import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { CATALOG_SYNC_QUEUE, type CatalogSyncJob } from "./catalog-sync.service";
import { ElasticsearchService, type IndexedProduct } from "./elasticsearch.service";
import { SupabaseService } from "../../supabase/supabase.service";

const PRODUCT_SYNC_COLUMNS =
  "id, slug, name, brand, description, gender, category, price_cop, currency, images, active, created_at, variants:product_variants(id, size, color_name, color_hex, sku, stock)";

@Processor(CATALOG_SYNC_QUEUE, { autorun: process.env.NODE_ENV === "production" })
export class CatalogSyncProcessor extends WorkerHost {
  private _lastErrLog = 0;

  onApplicationBootstrap() {
    this.worker?.on("error", (err: any) => {
      const now = Date.now();
      if (now - this._lastErrLog > 60_000) {
        this._lastErrLog = now;
        this.logger.warn(`CatalogSyncProcessor: esperando disponibilidad de Redis (${err.message})`);
      }
    });
  }
  private readonly logger = new Logger(CatalogSyncProcessor.name);

  constructor(
    private readonly elasticsearch: ElasticsearchService,
    private readonly supabase: SupabaseService,
  ) {
    super();
  }

  async process(job: Job<CatalogSyncJob>): Promise<void> {
    const data = job.data;
    this.logger.log(`Procesando tarea de catálogo en segundo plano: ${data.type}`);

    switch (data.type) {
      case "sync-product":
        await this.handleProductSync(data.productId, data.action);
        break;
      case "sync-variants-stock":
        await this.handleVariantsStock(data.variantIds);
        break;
      case "full-reindex":
        await this.handleFullReindex();
        break;
    }
  }

  private mapProductToIndexed(p: any): IndexedProduct {
    const rawVariants = Array.isArray(p.variants) ? p.variants : [];
    const variants = rawVariants.map((v: any) => ({
      id: v.id,
      size: v.size,
      color_name: v.color_name,
      color_hex: v.color_hex,
      sku: v.sku,
      stock: Number(v.stock || 0),
    }));

    const totalStock = variants.reduce((sum: number, v: any) => sum + v.stock, 0);

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand || "ARShop",
      description: p.description || "",
      gender: p.gender,
      category: p.category,
      price_cop: Number(p.price_cop || 0),
      currency: p.currency || "COP",
      images: Array.isArray(p.images) ? p.images : [],
      active: Boolean(p.active),
      total_stock: totalStock,
      created_at: p.created_at,
      variants,
    };
  }

  private async handleProductSync(productId: string, action?: "upsert" | "delete") {
    if (action === "delete") {
      await this.elasticsearch.removeProduct(productId);
      this.logger.log(`Producto ${productId} removido del índice full-text.`);
      return;
    }

    const { data: p, error } = await this.supabase.admin
      .from("products")
      .select(PRODUCT_SYNC_COLUMNS)
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error cargando producto ${productId} para sync: ${error.message}`);
      throw error;
    }

    if (!p) {
      await this.elasticsearch.removeProduct(productId);
      return;
    }

    const doc = this.mapProductToIndexed(p);
    await this.elasticsearch.indexProduct(doc);
    this.logger.log(`Producto ${doc.name} (${doc.id}) sincronizado en índice de búsqueda.`);
  }

  private async handleVariantsStock(variantIds: string[]) {
    if (!variantIds || variantIds.length === 0) return;

    const { data, error } = await this.supabase.admin
      .from("product_variants")
      .select("product_id")
      .in("id", variantIds);

    if (error) {
      this.logger.error(`Error resolviendo variantes: ${error.message}`);
      throw error;
    }

    const productIds = Array.from(new Set(data.map((r) => r.product_id as string)));
    for (const pId of productIds) {
      await this.handleProductSync(pId, "upsert");
    }
  }

  async handleFullReindex() {
    this.logger.log("Iniciando indexación completa del catálogo...");
    const { data, error } = await this.supabase.admin
      .from("products")
      .select(PRODUCT_SYNC_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error(`Error leyendo catálogo para reindex: ${error.message}`);
      throw error;
    }

    const docs = (data || []).map((p) => this.mapProductToIndexed(p));
    await this.elasticsearch.bulkIndex(docs);
    this.logger.log(`Reindexación completa finalizada: ${docs.length} productos indexados.`);
  }
}
