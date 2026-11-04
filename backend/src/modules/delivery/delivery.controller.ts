import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { DeliveryService } from "./delivery.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/user";
import {
  ConfirmDeliveryDto,
  ScanQrDto,
  SetPinDto,
  SimulateDeliveryDto,
  UpdateDeliveryProfileDto,
  VerifyClientCodeDto,
} from "./dto/scan-qr.dto";

@Roles("REPARTIDOR")
@Controller("delivery")
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get("mine/profile")
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.delivery.getProfile(user.id);
  }

  @Patch("mine/profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeliveryProfileDto,
  ) {
    return this.delivery.updateProfile(user.id, dto);
  }

  @Get("mine/orders")
  listMyOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
  ) {
    return this.delivery.listMyOrders(user.id, status);
  }

  @Get("mine/orders/:id")
  getMyOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") orderId: string,
  ) {
    return this.delivery.getMyOrder(user.id, orderId);
  }

  @Get("mine/bonos")
  listMyBonos(@CurrentUser() user: AuthenticatedUser) {
    return this.delivery.listMyBonos(user.id);
  }

  // Throttle: cambiar PIN es costoso (scrypt hash) y no hay razón legítima
  // para cambiarlo más de un puñado de veces por hora. Si llega más tráfico
  // es un bot probando o un repartidor con problemas serios de UX.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("mine/pin")
  setPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPinDto) {
    return this.delivery.setPin(user.id, dto);
  }

  @Post("scan-qr")
  scanQr(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanQrDto) {
    return this.delivery.scanQr(user.id, dto);
  }

  /**
   * Verifica el código de 4 dígitos sin conocer el pedido. Es el camino del
   * repartidor que, sin cámara o sin una orden abierta, escribe lo que el
   * cliente le dicta. La orden se resuelve entre sus entregas activas.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("verify-code")
  verifyCodeAnywhere(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyClientCodeDto,
  ) {
    return this.delivery.verifyClientCodeAnywhere(user.id, dto.code);
  }

  /** Verifica el código numérico de 4 dígitos como alternativa al QR. */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("verify-code/:orderId")
  verifyCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: VerifyClientCodeDto,
  ) {
    return this.delivery.verifyClientCode(user.id, orderId, dto.code);
  }

  /** Datos del titular (nombre + documento) para prefill en simulación. */
  @Get("mine/orders/:id/client-info")
  clientInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") orderId: string,
  ) {
    return this.delivery.getClientInfo(user.id, orderId);
  }

  /**
   * Confirmar entrega tras un QR válido o diligencia manual.
   * Si el cliente ya prellenó los datos, puede llegar con receiverName vacío
   * y usarse los de `receiver_prefilled`.
   */
  @Post("confirm/:orderId")
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.delivery.confirmDelivery(
      user.id,
      orderId,
      dto.receiverName,
      dto.documentType,
      dto.documentNumber,
      dto.source ?? "qr",
    );
  }

  @Post("simulate/:orderId")
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: SimulateDeliveryDto,
  ) {
    return this.delivery.simulateDelivery(user.id, orderId, dto);
  }
}
