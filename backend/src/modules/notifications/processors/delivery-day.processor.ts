import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { DELIVERY_DAY_QUEUE, type DeliveryDayJob, NotificationsService } from "../notifications.service";
import { SupabaseService } from "../../../supabase/supabase.service";
import { PushService } from "../../push/push.service";

/**
 * Barre a las 00:00 todos los pedidos cuya `estimated_delivery_at` cae hoy
 * y aún no fueron notificados. Encola un email y manda un push por cada uno.
 */
@Processor(DELIVERY_DAY_QUEUE, { autorun: process.env.NODE_ENV === "production" })
export class DeliveryDayProcessor extends WorkerHost {
  private _lastErrLog = 0;

  onApplicationBootstrap() {
    this.worker?.on("error", (err: any) => {
      const now = Date.now();
      if (now - this._lastErrLog > 60_000) {
        this._lastErrLog = now;
        this.logger.warn(`DeliveryDayProcessor: esperando disponibilidad de Redis (${err.message})`);
      }
    });
  }
  private readonly logger = new Logger(DeliveryDayProcessor.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process(_job: Job<DeliveryDayJob>): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: orders, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, shipping_city")
      .in("status", ["PAID", "SHIPPED"])
      .eq("estimated_delivery_at", today)
      .eq("delivery_notified_today", false);

    if (error) {
      this.logger.error(`scan error: ${error.message}`);
      return;
    }

    for (const o of orders ?? []) {
      await this.notifications.enqueueDeliveryDayNotice(o.id);
      await this.push
        .sendToUser(o.user_id, {
          title: "Tu pedido llega hoy",
          body: `#${o.id.slice(0, 8)} · ${o.shipping_city}`,
          url: `/cuenta/pedidos/${o.id}/qr`,
        })
        .catch(() => undefined);
      await this.supabase.admin
        .from("orders")
        .update({ delivery_notified_today: true })
        .eq("id", o.id);
    }

    this.logger.log(`delivery-day scan: ${orders?.length ?? 0} pedidos.`);
  }
}
