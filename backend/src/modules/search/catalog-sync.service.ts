import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { SupabaseService } from "../../supabase/supabase.service";
import type { CatalogSyncProcessor } from "./catalog-sync.processor";

export const CATALOG_SYNC_QUEUE = "catalog-search-sync";

export type CatalogSyncJob =
  | { type: "sync-product"; productId: string; action?: "upsert" | "delete" }
  | { type: "sync-variants-stock"; variantIds: string[] }
  | { type: "full-reindex" };

@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    @InjectQueue(CATALOG_SYNC_QUEUE) private readonly queue: Queue<CatalogSyncJob>,
    private readonly supabase: SupabaseService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Encola sincronización para un producto específico tras creación, edición o eliminación.
   */
  async enqueueProductSync(productId: string, action: "upsert" | "delete" = "upsert") {
    const jobData: CatalogSyncJob = { type: "sync-product", productId, action };
    if (process.env.NODE_ENV === "production") {
      try {
        await this.queue.add("sync-product", jobData, {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        });
        return;
      } catch (err: any) {
        this.logger.warn(`BullMQ no disponible para sync de producto ${productId}, ejecutando en directo.`);
      }
    }
    void (async () => {
      try {
        const { CatalogSyncProcessor: ProcessorClass } = await import("./catalog-sync.processor");
        const processor = this.moduleRef.get<CatalogSyncProcessor>(ProcessorClass, { strict: false });
        await processor?.process({ data: jobData } as any);
      } catch (err: any) {
        this.logger.warn(`Error en sync directo de producto ${productId}: ${err?.message}`);
      }
    })();
  }

  /**
   * Encola sincronización automática cuando el stock de variantes cambia en inventario
   * (p. ej. venta realizada, cancelación o devolución).
   */
  async enqueueVariantsStockChange(variantIds: string[]) {
    if (!variantIds || variantIds.length === 0) return;
    try {
      // Buscar los IDs de producto correspondientes
      const { data, error } = await this.supabase.admin
        .from("product_variants")
        .select("product_id")
        .in("id", variantIds);

      if (error) {
        this.logger.error(`Error resolviendo product_id para variantes: ${error.message}`);
        return;
      }

      const productIds = Array.from(new Set(data.map((r) => r.product_id as string)));
      for (const pId of productIds) {
        await this.enqueueProductSync(pId, "upsert");
      }
    } catch (err: any) {
      this.logger.error(`Error encolando sync por inventario: ${err?.message}`);
    }
  }

  /**
   * Encola reindexación total del catálogo completo.
   */
  async enqueueFullReindex() {
    try {
      await this.queue.add(
        "full-reindex",
        { type: "full-reindex" },
        {
          jobId: "catalog-full-reindex",
          attempts: 2,
          removeOnComplete: true,
        },
      );
      this.logger.log("Job de reindexación total encolado en segundo plano.");
    } catch (err: any) {
      this.logger.error(`Error encolando reindexación total: ${err?.message}`);
    }
  }
}
