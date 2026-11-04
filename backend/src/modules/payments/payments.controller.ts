import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentsService } from "./payments.service";
import { OrdersService } from "../orders/orders.service";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SupabaseService } from "../../supabase/supabase.service";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { InvoicingService } from "../invoicing/invoicing.service";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogsService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly invoicing: InvoicingService,
  ) {}

  /** Crea PaymentIntent para una orden del usuario autenticado */
  @Post("intent")
  intent(
    @CurrentUser() user: AuthenticatedUser,
    @Body("orderId") orderId: string,
    @Body("currency") currency: string = "COP",
  ) {
    if (!orderId) throw new BadRequestException("orderId required");
    const validCurrencies = ["COP", "USD", "EUR"];
    const safeCurrency = validCurrencies.includes(currency?.toUpperCase())
      ? currency.toUpperCase()
      : "COP";
    return this.payments.createIntentForOrder(orderId, user.id, safeCurrency);
  }

  /**
   * Webhook de Stripe. Público (no requiere JWT) pero exige firma válida.
   * Usa el raw body expuesto por `rawBody: true` en main.ts.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("webhook")
  async webhook(
    @Headers("stripe-signature") signature: string,
    @Req() req: { rawBody?: Buffer; body: unknown },
  ) {
    if (!signature) throw new BadRequestException("Missing stripe-signature");
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException("Missing raw body");

    let event;
    try {
      event = this.payments.constructEvent(raw, signature);
    } catch (err) {
      this.logger.warn(`Invalid signature: ${(err as Error).message}`);
      throw new BadRequestException("Invalid signature");
    }

    const transitioned = await this.payments.handleEvent(event);

    // Side-effects coordinados fuera del service para evitar ciclos.
    // El stock solo se descuenta en la transición real
    // PENDING_PAYMENT → PAID (evita doble descuento ante reintentos de Stripe).
    // La factura sí se verifica en cada reintento porque es idempotente: si un
    // intento anterior falló, Stripe puede volver a disparar el webhook.
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as { id: string; metadata?: Record<string, string> };
      const order = await this.orders.findByStripeIntent(intent.id);
      if (order) {
        let skipInvoice = false;
        if (transitioned && order.items) {
          const variantIds = order.items.map(
            (it: { product_variant_id: string }) => it.product_variant_id,
          );
          try {
            // Convierte las reservas de la orden en decremento real. Edge case
            // raro: si un admin manipuló stock a 0 mientras la orden estaba
            // PENDING_PAYMENT, aquí falla con "insufficient stock on confirm".
            await this.inventory.confirmReservation(order.id, variantIds);
            await this.notifications.enqueueOrderConfirmation(order.id);
          } catch (err) {
            const message = (err as Error).message;
            const isStockShortage = /insufficient stock/i.test(message);
            this.logger.error(
              `Confirm reservation failed for ${order.id}: ${message} — auto-refund=${isStockShortage}`,
            );
            if (isStockShortage) {
              // Una orden que se reembolsa por falta de stock no debe facturarse.
              skipInvoice = true;
              try {
                // Liberar la reserva (si quedó) + Stripe refund + status CANCELLED
                await this.inventory.releaseReservation(order.id).catch(() => {});
                await this.payments.refundOrder(order.id);
                await this.notifications.enqueueOrderRefunded(order.id);
                await this.audit.record(
                  null,
                  "ORDER_AUTO_REFUNDED_STOCK",
                  order.id,
                  { reason: message },
                );
              } catch (refundErr) {
                this.logger.error(
                  `AUTO-REFUND FAILED for ${order.id}: ${(refundErr as Error).message}. ` +
                    `Manual intervention required.`,
                );
                await this.audit.record(
                  null,
                  "ORDER_AUTO_REFUND_FAILED",
                  order.id,
                  { stockError: message, refundError: (refundErr as Error).message },
                );
              }
            }
            // Errores no-stock (DB caída, etc) → dejar PAID; el reintento de
            // Stripe volverá a intentar stock y facturación.
          }
        }

        // La facturación nunca bloquea el webhook: si la DIAN/proveedor falla,
        // la orden queda PAID y la factura FAILED/PENDING_MANUAL para reintento.
        if (!skipInvoice && order.status !== "CANCELLED") {
          try {
            await this.invoicing.issueForOrder(order.id, null);
          } catch (invoiceErr) {
            this.logger.warn(
              `Facturación automática falló para ${order.id}: ${(invoiceErr as Error).message}`,
            );
          }
        }
      }
    }

    // Pago fallido o cancelado: liberar la reserva inmediatamente para que
    // el stock vuelva a estar disponible sin esperar al TTL de 15 min.
    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as { id: string };
      const order = await this.orders.findByStripeIntent(intent.id);
      if (order) {
        await this.inventory.releaseReservation(order.id).catch((e) =>
          this.logger.warn(
            `release_reservation falló para ${order.id}: ${(e as Error).message}`,
          ),
        );
      }
    }

    return { received: true };
  }


  /**
   * SOLO DEV: simula lo mismo que haría `payment_intent.succeeded`.
   * Útil cuando no se tiene Stripe CLI corriendo para disparar el webhook real.
   * Se deshabilita cuando NODE_ENV=production.
   */
  @Roles("ADMIN")
  @Post("dev/simulate-paid/:orderId")
  async simulatePaid(@Param("orderId") orderId: string) {
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new ForbiddenException("Endpoint deshabilitado en producción.");
    }

    const order = await this.orders.findByIdWithItems(orderId);
    if (!order) throw new NotFoundException("Orden no encontrada.");

    if (order.status === "PENDING_PAYMENT") {
      await this.orders.updateStatus(orderId, "PAID");
      try {
        // Si la orden fue creada por /orders tendrá reservas → confirmar.
        // Si fue sembrada directamente en DB sin reserva, decrementar directo.
        const variantIds = order.items.map(
          (it: { product_variant_id: string }) => it.product_variant_id,
        );
        const { data: hasReservation } = await this.supabase.admin
          .from("stock_reservations")
          .select("id")
          .eq("order_id", orderId)
          .limit(1);
        if (hasReservation && hasReservation.length) {
          await this.inventory.confirmReservation(orderId, variantIds);
        } else {
          await this.inventory.decrementStock(
            order.items.map((it: { product_variant_id: string; quantity: number }) => ({
              variantId: it.product_variant_id,
              quantity: it.quantity,
            })),
          );
        }
      } catch (err) {
        this.logger.error(
          `[dev simulate-paid] stock update falló: ${(err as Error).message}`,
        );
      }
    }

    await this.notifications.enqueueOrderConfirmation(orderId);
    try {
      await this.invoicing.issueForOrder(orderId, null);
    } catch (invoiceErr) {
      this.logger.warn(
        `[dev simulate-paid] facturación falló: ${(invoiceErr as Error).message}`,
      );
    }
    return { ok: true, orderId, status: "PAID" };
  }
}
