import { Injectable, Logger } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { OrdersService } from "../orders/orders.service";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { InvoicingService } from "../invoicing/invoicing.service";

/**
 * Orquesta un reembolso completo: Stripe refund → status CANCELLED →
 * repone stock → email al cliente → audit. Centralizado para que el
 * flujo de disputa (y cualquier otro admin flow futuro) lo reutilice.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogsService,
    private readonly invoicing: InvoicingService,
  ) {}

  async refund(adminId: string, orderId: string, origin: string) {
    const updatedOrder = await this.payments.refundOrder(orderId);

    const order = await this.orders.findByIdWithItems(orderId);
    if (order?.items?.length) {
      const variantIds = order.items.map(
        (it: { product_variant_id: string }) => it.product_variant_id,
      );
      try {
        await this.inventory.restoreStock(
          order.items.map((it: { product_variant_id: string; quantity: number }) => ({
            variantId: it.product_variant_id,
            quantity: it.quantity,
          })),
        );
        // Si alguno pasó de 0 → >0, enfilamos avisos a suscriptores.
        for (const vid of variantIds) {
          try {
            const userIds = await this.inventory.claimPendingSubscribers(vid);
            await Promise.all(
              userIds.map((uid) =>
                this.notifications.enqueueBackInStock(uid, vid),
              ),
            );
          } catch (e) {
            this.logger.warn(
              `back-in-stock enqueue falló para ${vid}: ${(e as Error).message}`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Stock restore failed for ${orderId}: ${(err as Error).message}`,
        );
      }
    }

    await this.notifications.enqueueOrderRefunded(orderId);
    await this.audit.record(adminId, "ORDER_REFUNDED", orderId, { origin });

    // Si la orden ya tenía factura electrónica emitida, la devolución debe
    // soportarse con nota crédito. Best-effort: no bloquea el reembolso.
    try {
      await this.invoicing.createCreditNoteForOrder(
        orderId,
        `Reembolso total (${origin})`,
        adminId,
      );
    } catch (err) {
      this.logger.warn(
        `Nota crédito automática falló para ${orderId}: ${(err as Error).message}`,
      );
    }

    return updatedOrder;
  }
}
