import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import { CatalogSyncService } from "../search/catalog-sync.service";

export interface StockItem {
  variantId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly catalogSync: CatalogSyncService,
  ) {}

  /**
   * Reserva stock con TTL para una orden recién creada. Falla si el
   * disponible (stock − reservas activas de otras órdenes) no alcanza.
   */
  async reserveStock(
    orderId: string,
    items: StockItem[],
    ttlMinutes = 15,
  ): Promise<void> {
    if (items.length === 0) return;
    const { error } = await this.supabase.admin.rpc("reserve_variant_stock", {
      p_order_id: orderId,
      p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.quantity })),
      p_ttl_minutes: ttlMinutes,
    });
    if (error) {
      if (error.message?.toLowerCase().includes("insufficient")) {
        throw new BadRequestException(
          "Insufficient stock for one or more items",
        );
      }
      throw error;
    }
  }

  /**
   * Convierte las reservas de una orden en decremento real.
   * Llamado desde el webhook de Stripe tras payment_intent.succeeded.
   */
  async confirmReservation(orderId: string, variantIds: string[]): Promise<void> {
    const { error } = await this.supabase.admin.rpc("confirm_reservation", {
      p_order_id: orderId,
    });
    if (error) {
      if (error.message?.toLowerCase().includes("insufficient")) {
        throw new BadRequestException(
          "Insufficient stock on confirm for one or more items",
        );
      }
      throw error;
    }
    if (variantIds.length) {
      this.catalogSync.enqueueVariantsStockChange(variantIds);
    }
  }

  /**
   * Libera las reservas sin tocar stock. Para cancelaciones y auto-refund
   * cuando el decremento falla (release antes de refundar).
   */
  async releaseReservation(orderId: string): Promise<void> {
    const { error } = await this.supabase.admin.rpc("release_reservation", {
      p_order_id: orderId,
    });
    if (error) throw error;
  }

  /**
   * Decrementa stock atómicamente sin pasar por reserva. Legacy, usado por
   * el endpoint dev simulate-paid y RefundService.restoreStock. Nuevos
   * flujos deberían usar reserveStock + confirmReservation.
   */
  async decrementStock(items: StockItem[]): Promise<void> {
    if (items.length === 0) return;
    const { error } = await this.supabase.admin.rpc("decrement_variant_stock", {
      p_items: items.map((i) => ({
        variant_id: i.variantId,
        qty: i.quantity,
      })),
    });
    if (error) {
      if (error.message?.toLowerCase().includes("insufficient")) {
        throw new BadRequestException("Insufficient stock for one or more items");
      }
      throw error;
    }

    // Sincroniza en segundo plano el catálogo y el índice full-text
    this.catalogSync.enqueueVariantsStockChange(items.map((i) => i.variantId));
  }

  /**
   * Incrementa stock para reponer unidades de una orden cancelada.
   * Espejo de decrementStock usando la función SQL `restore_variant_stock`.
   */
  async restoreStock(items: StockItem[]): Promise<void> {
    if (items.length === 0) return;
    const { error } = await this.supabase.admin.rpc("restore_variant_stock", {
      p_items: items.map((i) => ({
        variant_id: i.variantId,
        qty: i.quantity,
      })),
    });
    if (error) throw error;

    // Sincroniza en segundo plano el catálogo y el índice full-text
    this.catalogSync.enqueueVariantsStockChange(items.map((i) => i.variantId));
  }

  async getVariant(variantId: string) {
    const { data, error } = await this.supabase.admin
      .from("product_variants")
      .select(
        "id, product_id, size, color_name, color_hex, sku, stock, products(name, price_cop)",
      )
      .eq("id", variantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Variant not found");
    return data;
  }

  /** Suscribe al usuario para recibir aviso cuando la variante vuelva. */
  async subscribeNotification(userId: string, variantId: string): Promise<void> {
    const { data: existing } = await this.supabase.admin
      .from("stock_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("variant_id", variantId)
      .is("notified_at", null)
      .maybeSingle();
    if (existing) return;

    const { error } = await this.supabase.admin
      .from("stock_notifications")
      .insert({ user_id: userId, variant_id: variantId });
    if (error) throw error;
  }

  async unsubscribeNotification(
    userId: string,
    variantId: string,
  ): Promise<void> {
    const { error } = await this.supabase.admin
      .from("stock_notifications")
      .delete()
      .eq("user_id", userId)
      .eq("variant_id", variantId)
      .is("notified_at", null);
    if (error) throw error;
  }

  /**
   * Marca como notificados y devuelve los user_ids que esperaban aviso.
   * El caller se encarga de encolar los emails.
   */
  async claimPendingSubscribers(variantId: string): Promise<string[]> {
    const { data, error } = await this.supabase.admin
      .from("stock_notifications")
      .select("id, user_id")
      .eq("variant_id", variantId)
      .is("notified_at", null);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await this.supabase.admin
      .from("stock_notifications")
      .update({ notified_at: new Date().toISOString() })
      .in("id", ids);

    return rows.map((r) => r.user_id);
  }
}
