import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PushService } from "../push/push.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Ventana de confirmación de entregas **simuladas**.
 *
 * Cuando el repartidor no pudo obtener el QR ni el código de 4 dígitos del
 * cliente, marca la entrega como simulada: el pedido queda en
 * `delivery_confirmation = 'PENDING_CLIENT'` y NO pasa a DELIVERED.
 *
 * Antes, al vencer el plazo el pedido se auto-aceptaba. Eso dejaba al cliente
 * sin voz: si el paquete nunca llegó, el sistema lo daba por entregado igual.
 * Ahora el plazo tiene dos hitos:
 *
 *   · 24 h (`delivery_reminder_at`) → recordatorio push, que se queda en
 *     pantalla hasta que el cliente lo atienda.
 *   · 48 h (`delivery_auto_confirm_at`) → sin respuesta, el pedido entra en
 *     DISPUTED y lo revisa un administrador. Nunca se auto-acepta.
 *
 * Sólo llegan aquí las entregas simuladas: las confirmadas con QR o con el
 * código del cliente se marcan DELIVERED de inmediato y no requieren nada.
 */
@Injectable()
export class DeliveryConfirmationService {
  private readonly logger = new Logger(DeliveryConfirmationService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLogsService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep() {
    await this.sendReminders();
    await this.escalateExpired();
  }

  /** Hito de 24 h: recordatorio antes de que venza la ventana. */
  private async sendReminders() {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, delivery_reminder_at, delivery_auto_confirm_at")
      .eq("delivery_confirmation", "PENDING_CLIENT")
      .not("delivery_reminder_at", "is", null)
      .lte("delivery_reminder_at", nowIso)
      .is("delivery_reminder_sent_at", null)
      .limit(100);

    if (error) {
      this.logger.error(`recordatorio de entrega: query falló (${error.message})`);
      return;
    }
    if (!rows?.length) return;

    for (const row of rows) {
      const deadline = row.delivery_auto_confirm_at
        ? new Date(row.delivery_auto_confirm_at)
        : null;
      const hoursLeft = deadline
        ? Math.max(
            1,
            Math.ceil((deadline.getTime() - Date.now()) / 3_600_000),
          )
        : 24;

      // Se marca como enviado aunque no haya suscripciones push: si no, el
      // barrido lo reintentaría cada 10 minutos para siempre.
      const { error: uErr } = await this.supabase.admin
        .from("orders")
        .update({ delivery_reminder_sent_at: nowIso })
        .eq("id", row.id)
        .is("delivery_reminder_sent_at", null);
      if (uErr) {
        this.logger.warn(`recordatorio ${row.id} no se pudo marcar: ${uErr.message}`);
        continue;
      }

      this.push
        .sendToUser(row.user_id, {
          title: "¿Recibiste tu pedido?",
          body: `El repartidor marcó tu pedido #${row.id.slice(0, 8)} como entregado. Confírmalo o repórtalo: en ${hoursLeft} h pasa a disputa con un asesor.`,
          url: `/cuenta/pedidos/${row.id}`,
          requireInteraction: true,
          tag: `delivery-confirm-${row.id}`,
        })
        .catch((e) =>
          this.logger.warn(`push recordatorio ${row.id}: ${(e as Error).message}`),
        );
    }
  }

  /** Hito de 48 h: sin respuesta, el caso pasa a disputa con un admin. */
  private async escalateExpired() {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, delivery_id, delivery_auto_confirm_at")
      .eq("delivery_confirmation", "PENDING_CLIENT")
      .lt("delivery_auto_confirm_at", nowIso)
      .limit(100);

    if (error) {
      this.logger.error(`escalado a disputa: query falló (${error.message})`);
      return;
    }
    if (!rows?.length) return;

    this.logger.log(`Escalando ${rows.length} entrega(s) simulada(s) a disputa`);

    for (const row of rows) {
      const { data: updated, error: uErr } = await this.supabase.admin
        .from("orders")
        .update({
          delivery_confirmation: "DISPUTED",
          delivery_disputed_at: nowIso,
          delivery_dispute_reason:
            "NO_RESPONSE: el cliente no confirmó la entrega simulada en el plazo",
        })
        .eq("id", row.id)
        .eq("delivery_confirmation", "PENDING_CLIENT") // guard contra carrera
        .select("id");

      if (uErr) {
        this.logger.warn(`escalado ${row.id} falló: ${uErr.message}`);
        continue;
      }
      // Si el guard no matcheó, otro proceso ya la movió: no duplicamos avisos.
      if (!updated?.length) continue;

      await this.audit
        .record(row.user_id, "ORDER_DELIVERY_DISPUTED_BY_TIMEOUT", row.id, {
          previous: "PENDING_CLIENT",
        })
        .catch((e) =>
          this.logger.warn(`audit escalado ${row.id}: ${(e as Error).message}`),
        );

      // El admin necesita enterarse: mismo camino que una disputa del cliente.
      this.notifications
        .enqueueOrderDisputed(row.id)
        .catch((e) =>
          this.logger.warn(
            `enqueueOrderDisputed ${row.id}: ${(e as Error).message}`,
          ),
        );

      this.push
        .sendToUser(row.user_id, {
          title: "Tu pedido pasó a disputa",
          body: `No recibimos tu confirmación del pedido #${row.id.slice(0, 8)}. Un asesor revisará el caso y te contactará.`,
          url: `/cuenta/pedidos/${row.id}`,
          requireInteraction: true,
          tag: `delivery-confirm-${row.id}`,
        })
        .catch((e) =>
          this.logger.warn(`push disputa ${row.id}: ${(e as Error).message}`),
        );

      if (row.delivery_id) {
        const { data: dom } = await this.supabase.admin
          .from("domiciliarios")
          .select("user_id")
          .eq("id", row.delivery_id)
          .maybeSingle();
        if (dom?.user_id) {
          this.push
            .sendToUser(dom.user_id, {
              title: "Entrega en disputa",
              body: `El cliente no confirmó el pedido #${row.id.slice(0, 8)}. Un admin revisará la entrega.`,
              url: `/domiciliario/pedidos/${row.id}`,
              tag: `delivery-dispute-${row.id}`,
            })
            .catch((e) =>
              this.logger.warn(
                `push disputa repartidor ${row.id}: ${(e as Error).message}`,
              ),
            );
        }
      }
    }
  }
}
