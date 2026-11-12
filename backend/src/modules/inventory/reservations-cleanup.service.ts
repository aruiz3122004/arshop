import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SupabaseService } from "../../supabase/supabase.service";

/**
 * Las reservas de stock expiran por `expires_at > now()` (la vista
 * `product_variants_available` ya las ignora), pero las filas se quedan
 * eternamente en la tabla si nadie las borra. Dos efectos:
 *   - El índice `idx_stock_reservations_variant_expires` crece sin tope.
 *   - El endpoint `release_reservation` manual se hace cada vez más lento
 *     por el DELETE sobre más filas.
 *
 * El webhook de Stripe libera cuando falla el pago; el `confirm_reservation`
 * las convierte en decremento y las borra. Pero las órdenes cancelables
 * manualmente, los crashes de proceso a mitad de checkout, o un cliente
 * que simplemente abandona la pestaña, dejan residuales. Este cron barre.
 */
@Injectable()
export class ReservationsCleanupService {
  private readonly logger = new Logger(ReservationsCleanupService.name);

  constructor(private readonly supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepExpired() {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from("stock_reservations")
      .delete()
      .lt("expires_at", nowIso)
      .select("id");

    if (error) {
      this.logger.warn(`sweep expired reservations: ${error.message}`);
    } else {
      const n = data?.length ?? 0;
      if (n > 0) {
        this.logger.log(`Liberadas ${n} reserva(s) expiradas`);
      }
    }

    // Vacío A: Cancelar órdenes PENDING_PAYMENT abandonadas (> 2 horas sin pago)
    // para que no queden abiertas indefinidamente.
    const abandonedCutoff = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const { data: abandoned, error: abErr } = await this.supabase.admin
      .from("orders")
      .update({ status: "CANCELLED", delivery_id: null })
      .eq("status", "PENDING_PAYMENT")
      .lt("created_at", abandonedCutoff)
      .select("id");

    if (abErr) {
      this.logger.warn(`sweep abandoned orders: ${abErr.message}`);
    } else if (abandoned && abandoned.length > 0) {
      this.logger.log(
        `Canceladas ${abandoned.length} orden(es) PENDING_PAYMENT abandonadas (>2h)`,
      );
    }
  }
}
