import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { OrdersService } from "./orders.service";
import { RedisService } from "../../redis/redis.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import {
  CreateReturnDto,
  DisputeReasonDto,
  ReceiverDataDto,
  ShipOrderDto,
  ValidateCouponDto,
} from "./dto/dispute.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthenticatedUser } from "../../common/types/user";

/** Validación de forma del Idempotency-Key — UUID v4 o similar, 16-64 chars seguros. */
const IDEM_KEY_REGEX = /^[A-Za-z0-9_-]{16,64}$/;
const IDEM_TTL_SECONDS = 15 * 60;
const IDEM_POLL_INTERVAL_MS = 100;
const IDEM_POLL_MAX_ATTEMPTS = 30; // 3 s en total

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditLogsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Checkout — límite estricto por IP (5/min) + idempotencia opcional.
   *
   * Si el cliente envía `Idempotency-Key: <uuid>`, el servidor cachea el
   * resultado 15 min indexado por (userId, key). Reintentos con la misma
   * key devuelven el mismo pedido sin crear duplicados. Protege contra:
   *  - Doble submit del formulario (doble click, Enter + click)
   *  - Retry automático del cliente HTTP tras timeout de red
   *  - Reenvío del request por backoff del browser
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers("idempotency-key") idemKey?: string,
  ) {
    if (!idemKey) {
      return this.orders.create(user.id, dto);
    }
    if (!IDEM_KEY_REGEX.test(idemKey)) {
      throw new BadRequestException(
        "Idempotency-Key debe ser 16-64 chars [A-Za-z0-9_-]",
      );
    }

    const cacheKey = `idem:order:${user.id}:${idemKey}`;
    const pendingMarker = "__pending__";

    // Reserva atómica: si otro request con la misma key ya está en vuelo,
    // SETNX falla y hacemos poll hasta que escriba el resultado real.
    const reserved = await this.redis.setNx(
      cacheKey,
      pendingMarker,
      IDEM_TTL_SECONDS,
    );
    if (!reserved) {
      for (let i = 0; i < IDEM_POLL_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, IDEM_POLL_INTERVAL_MS));
        const val = await this.redis.get(cacheKey);
        if (val && val !== pendingMarker) return JSON.parse(val);
      }
      throw new ConflictException(
        "Un request previo con esa Idempotency-Key sigue procesándose",
      );
    }

    try {
      const result = await this.orders.create(user.id, dto);
      await this.redis.set(cacheKey, JSON.stringify(result), IDEM_TTL_SECONDS);
      return result;
    } catch (err) {
      // Fallo del create → liberar la reserva para que el cliente pueda
      // reintentar con la misma key si corresponde.
      await this.redis.del(cacheKey);
      throw err;
    }
  }

  @Post("validate-coupon")
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.orders.validateCoupon(dto.code, dto.subtotalCop);
  }

  @Get("mine")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.listForUser(user.id);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.orders.findByIdForUser(id, user.id);
  }

  @Get(":id/qr")
  qr(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    /**
     * `keepCode` = epoch seconds del código que el cliente ya está mostrando.
     * El polling de la página (60 s) no debe rotar ese código: si rotara, el
     * cliente podía dictarlo justo cuando el backend ya guardó otro hash.
     */
    @Query("keepCode") keepCode?: string,
  ) {
    return this.orders.issueQr(user.id, id, keepCode);
  }

  @Post(":id/confirm-delivery")
  confirmDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.orders.confirmSimulatedDelivery(user.id, id);
  }

  @Post(":id/dispute-delivery")
  disputeDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DisputeReasonDto,
  ) {
    return this.orders.disputeSimulatedDelivery(user.id, id, dto?.reason);
  }

  @Post(":id/returns")
  requestReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.orders.requestReturn(user.id, id, dto);
  }

  @Post(":id/receiver-data")
  saveReceiver(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReceiverDataDto,
  ) {
    return this.orders.saveReceiverPrefill(user.id, id, dto);
  }

  @Roles("ADMIN")
  @Get()
  listAll(@Query("cursor") cursor?: string) {
    return this.orders.listAll(50, cursor);
  }

  @Roles("ADMIN")
  @Patch(":id/ship")
  async markShipped(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto?: ShipOrderDto,
  ) {
    const result = await this.orders.markShipped(id, dto);
    await this.audit.record(admin.id, "ORDER_SHIPPED", id, {
      carrier: dto?.carrier ?? null,
      trackingNumber: dto?.trackingNumber ?? null,
    });
    return result;
  }

  @Roles("ADMIN")
  @Patch(":id/deliver")
  async markDelivered(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const result = await this.orders.updateStatus(id, "DELIVERED");
    await this.audit.record(admin.id, "ORDER_DELIVERED", id, {});
    return result;
  }

  @Roles("ADMIN")
  @Post(":id/assign-delivery")
  async assignDelivery(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body("domiciliarioId") domiciliarioId?: string,
  ) {
    return this.orders.reassignDelivery(admin.id, id, domiciliarioId);
  }
}
