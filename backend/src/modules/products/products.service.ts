import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { PostgrestError } from "@supabase/supabase-js";
import { SupabaseService } from "../../supabase/supabase.service";
import { CatalogSyncService } from "../search/catalog-sync.service";
import { ElasticsearchService, type SearchOptions } from "../search/elasticsearch.service";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateProductDto, CreateVariantDto } from "./dto/create-product.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { ListProductsQuery } from "./dto/list-products.query";

const PRODUCT_COLUMNS =
  "*, variants:product_variants(id, size, color_name, color_hex, sku, stock)";

/** Tope duro para el listado del panel admin (no paginado en UI). */
const ADMIN_LIST_MAX = 1000;

export interface VariantSyncReport {
  /** Variantes quitadas en el form que no se pudieron borrar porque tienen
   * pedidos asociados (FK `order_items` ON DELETE RESTRICT). Quedan con
   * stock 0 para que no se puedan volver a comprar. */
  archived: string[];
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly catalogSync: CatalogSyncService,
    private readonly elasticsearch: ElasticsearchService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Para cada variante cuyo stock cruzó de 0 a >0, enfila el aviso
   * "back-in-stock" a los suscriptores activos y los marca como notificados.
   * Best-effort: no debe hacer fallar la operación principal.
   */
  private async notifyBackInStock(variantIds: string[]) {
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
          `notifyBackInStock falló para variant ${vid}: ${(e as Error).message}`,
        );
      }
    }
  }

  /** Búsqueda inteligente full-text con motor aislado y Elasticsearch */
  async searchFullText(query: string, options?: SearchOptions) {
    return this.elasticsearch.search(query, options);
  }

  /**
   * Exporta todos los registros de producto directamente desde el índice
   * de búsqueda aislado (Elasticsearch / motor full-text en memoria),
   * garantizando cero impacto y cero bloqueos sobre la base de datos principal.
   * Si el índice aún no se ha sincronizado, recurre a adminList para garantizar
   * la totalidad de los registros.
   */
  async exportCatalogFromSearchIndex() {
    const searchRes = await this.elasticsearch.search("", {
      includeInactive: true,
      limit: 10000,
    });

    if (searchRes.results && searchRes.results.length > 0) {
      return {
        exportedAt: new Date().toISOString(),
        source: searchRes.source,
        total: searchRes.total,
        products: searchRes.results,
      };
    }

    // Fallback de seguridad para garantizar siempre la totalidad de registros
    const all = await this.adminList();
    return {
      exportedAt: new Date().toISOString(),
      source: "database-fallback",
      total: all.length,
      products: all,
    };
  }

  /** Listado público: solo productos activos, paginado por cursor. */
  async list(q: ListProductsQuery) {
    const limit = q.limit ?? 24;
    let query = this.supabase.admin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "product_variants", ascending: true })
      .limit(limit);

    if (q.gender) query = query.eq("gender", q.gender);
    if (q.category) query = query.eq("category", q.category);
    if (q.minPrice !== undefined) query = query.gte("price_cop", q.minPrice);
    if (q.maxPrice !== undefined) query = query.lte("price_cop", q.maxPrice);
    if (q.cursor) query = query.lt("created_at", q.cursor);
    if (q.q) query = query.ilike("name", `%${q.q}%`);

    const { data, error } = await query;
    if (error) throw this.toHttp(error, "list");
    return data;
  }

  /** Listado del panel admin: incluye inactivos, sin el tope de 100 del público. */
  async adminList() {
    const { data, error } = await this.supabase.admin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "product_variants", ascending: true })
      .range(0, ADMIN_LIST_MAX - 1);
    if (error) throw this.toHttp(error, "adminList");
    return data;
  }

  async detail(slug: string) {
    const { data, error } = await this.supabase.admin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("slug", slug)
      .order("created_at", { referencedTable: "product_variants", ascending: true })
      .maybeSingle();
    if (error) throw this.toHttp(error, "detail");
    if (!data) throw new NotFoundException("Product not found");
    return data;
  }

  /**
   * Devuelve el stock disponible real (físico − reservas activas) para cada
   * variante del producto. Público. Lo consume la PDP para pintar "quedan N"
   * en tiempo real durante un flash drop.
   */
  async availability(slug: string) {
    const { data: product, error: pErr } = await this.supabase.admin
      .from("products")
      .select("id, drop_starts_at, drop_ends_at")
      .eq("slug", slug)
      .maybeSingle();
    if (pErr) throw this.toHttp(pErr, "availability.product");
    if (!product) throw new NotFoundException("Product not found");

    const { data: variants, error: vErr } = await this.supabase.admin
      .from("product_variants_available")
      .select("id, physical_stock, available_stock")
      .eq("product_id", product.id);
    if (vErr) throw this.toHttp(vErr, "availability.variants");

    return {
      dropStartsAt: product.drop_starts_at,
      dropEndsAt: product.drop_ends_at,
      variants: variants ?? [],
      asOf: new Date().toISOString(),
    };
  }

  /** Detalle por id (panel admin). Incluye inactivos. */
  async detailById(id: string) {
    const { data, error } = await this.supabase.admin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", id)
      .order("created_at", { referencedTable: "product_variants", ascending: true })
      .maybeSingle();
    if (error) throw this.toHttp(error, "detailById");
    if (!data) throw new NotFoundException("Producto no encontrado");
    return data;
  }

  async create(dto: CreateProductDto) {
    const { variants, ...rest } = dto;
    const insertRow: Record<string, unknown> = {
      slug: rest.slug,
      name: rest.name,
      brand: rest.brand,
      description: rest.description,
      gender: rest.gender,
      category: rest.category,
      price_cop: rest.priceCop,
      currency: "COP",
      images: rest.images,
      active: rest.active ?? true,
      drop_starts_at: rest.dropStartsAt ?? null,
      drop_ends_at: rest.dropEndsAt ?? null,
    };
    if (rest.compareAtPriceCop !== undefined) {
      insertRow.compare_at_price_cop = rest.compareAtPriceCop;
    }
    if (rest.fit !== undefined) {
      insertRow.fit = rest.fit;
    }
    if (rest.sizeGuide !== undefined) {
      insertRow.size_guide = rest.sizeGuide;
    }

    const { data: product, error } = await this.supabase.admin
      .from("products")
      .insert(insertRow)
      .select()
      .single();
    if (error) throw this.toHttp(error, "create");

    if (variants.length) {
      const { error: variantErr } = await this.supabase.admin
        .from("product_variants")
        .insert(variants.map((v) => this.variantRow(product.id, v)));
      if (variantErr) {
        // Evita dejar un producto huérfano sin variantes si falla el insert
        // (p. ej. SKU duplicado).
        await this.supabase.admin.from("products").delete().eq("id", product.id);
        throw this.toHttp(variantErr, "create.variants");
      }
    }

    const created = await this.detailById(product.id);
    this.catalogSync.enqueueProductSync(product.id, "upsert");
    return created;
  }

  async update(id: string, dto: UpdateProductDto) {
    const patch: Record<string, unknown> = {};
    if (dto.slug !== undefined) patch.slug = dto.slug;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.brand !== undefined) patch.brand = dto.brand;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.gender !== undefined) patch.gender = dto.gender;
    if (dto.category !== undefined) patch.category = dto.category;
    if (dto.priceCop !== undefined) patch.price_cop = dto.priceCop;
    if (dto.compareAtPriceCop !== undefined) {
      patch.compare_at_price_cop = dto.compareAtPriceCop;
    }
    if (dto.fit !== undefined) patch.fit = dto.fit;
    if (dto.sizeGuide !== undefined) patch.size_guide = dto.sizeGuide;
    if (dto.images !== undefined) patch.images = dto.images;
    if (dto.active !== undefined) patch.active = dto.active;
    if (dto.dropStartsAt !== undefined) patch.drop_starts_at = dto.dropStartsAt;
    if (dto.dropEndsAt !== undefined) patch.drop_ends_at = dto.dropEndsAt;

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { data, error } = await this.supabase.admin
        .from("products")
        .update(patch)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw this.toHttp(error, "update");
      if (!data) throw new NotFoundException("Producto no encontrado");
    } else {
      // Valida existencia aunque solo vengan variantes.
      await this.detailById(id);
    }

    let report: VariantSyncReport = { archived: [] };
    if (dto.variants !== undefined) {
      if (dto.variants.length === 0) {
        throw new BadRequestException("El producto debe tener al menos una variante.");
      }
      report = await this.syncVariants(id, dto.variants);
    }

    const product = await this.detailById(id);
    this.catalogSync.enqueueProductSync(id, "upsert");
    return { ...product, archivedVariants: report.archived };
  }

  /**
   * Borra el producto. Si alguna variante ya fue vendida (FK restrict desde
   * order_items), no se puede borrar sin romper el histórico de pedidos:
   * en ese caso se desactiva (deja de verse en el catálogo).
   */
  async remove(id: string): Promise<{ ok: true; archived: boolean }> {
    const { data, error } = await this.supabase.admin
      .from("products")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        const { data: upd, error: updErr } = await this.supabase.admin
          .from("products")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .maybeSingle();
        if (updErr) throw this.toHttp(updErr, "remove.archive");
        if (!upd) throw new NotFoundException("Producto no encontrado");
        this.catalogSync.enqueueProductSync(id, "upsert");
        return { ok: true, archived: true };
      }
      throw this.toHttp(error, "remove");
    }
    if (!data || data.length === 0) throw new NotFoundException("Producto no encontrado");
    this.catalogSync.enqueueProductSync(id, "delete");
    return { ok: true, archived: false };
  }

  /* ───────────────────────── helpers ───────────────────────── */

  /**
   * Sincroniza las variantes del producto con la lista enviada por el admin
   * en una sola transacción Postgres (función `sync_product_variants`).
   *
   * La implementación previa en TypeScript hacía delete → update → insert
   * desde el cliente sin transacción: si el insert fallaba (p. ej. SKU
   * duplicado al mover una variante entre productos), las variantes ya
   * borradas quedaban perdidas y el producto en estado inconsistente.
   *
   * La RPC devuelve `{archived: text[], restocked: uuid[]}`. El back-in-stock
   * sigue disparándose desde Node porque toca BullMQ / notificaciones.
   */
  private async syncVariants(
    productId: string,
    incoming: CreateVariantDto[],
  ): Promise<VariantSyncReport> {
    const skus = incoming.map((v) => v.sku.trim());
    const dup = skus.find((s, i) => skus.indexOf(s) !== i);
    if (dup) throw new BadRequestException(`SKU repetido en el formulario: ${dup}`);

    const items = incoming.map((v) => ({
      id: v.id ?? null,
      size: v.size,
      colorName: v.colorName,
      colorHex: v.colorHex,
      sku: v.sku,
      stock: v.stock,
    }));

    const { data, error } = await this.supabase.admin.rpc(
      "sync_product_variants",
      { p_product_id: productId, p_items: items },
    );
    if (error) throw this.toHttp(error as PostgrestError, "syncVariants");

    const result = (data ?? { archived: [], restocked: [] }) as {
      archived: string[];
      restocked: string[];
    };

    if (result.restocked.length) {
      this.notifyBackInStock(result.restocked).catch(() => {});
    }

    return { archived: result.archived };
  }

  private variantRow(productId: string, v: CreateVariantDto) {
    return {
      product_id: productId,
      size: v.size.trim(),
      color_name: v.colorName.trim(),
      color_hex: v.colorHex,
      sku: v.sku.trim(),
      stock: v.stock,
    };
  }

  /**
   * Traduce errores de PostgREST/Postgres a HttpException. Sin esto, el
   * filtro global los recibe como objeto plano y responde un 500 genérico.
   */
  private toHttp(error: PostgrestError, op: string): HttpException {
    switch (error.code) {
      case "23505": {
        const field = /\((\w+)\)=/.exec(error.details ?? "")?.[1];
        const label = field === "slug" ? "slug" : field === "sku" ? "SKU" : field ?? "valor";
        const value = /\)=\(([^)]*)\)/.exec(error.details ?? "")?.[1];
        return new ConflictException(
          `Ya existe otro registro con ese ${label}${value ? `: ${value}` : ""}.`,
        );
      }
      case "23503":
        return new ConflictException(
          "El registro está referenciado por pedidos existentes y no se puede borrar.",
        );
      case "23514":
      case "22P02":
        return new BadRequestException(`Datos inválidos: ${error.message}`);
      case "PGRST116":
        return new NotFoundException("Producto no encontrado");
      default:
        this.logger.error(`[${op}] ${error.code}: ${error.message} ${error.details ?? ""}`);
        return new InternalServerErrorException(`Error de base de datos (${op}).`);
    }
  }
}
