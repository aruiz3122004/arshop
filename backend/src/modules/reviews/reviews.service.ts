import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthenticatedUser } from "../../common/types/user";
import type {
  AdminListReviewsQuery,
  CreateReviewDto,
  ListReviewsQuery,
  ModerateReviewDto,
} from "./dto/review.dto";

/** Estados de pedido que habilitan una reseña verificada. */
const REVIEWABLE_STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;

interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: RatingDistribution;
}

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  author_name: string;
  verified: true;
  created_at: string;
}

/** PostgREST devuelve las relaciones to-one como objeto, pero algunos
 *  clientes/versiones las entregan como array. Normalizamos ambos. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function cleanAuthorName(value: string | null | undefined): string {
  const name = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.slice(0, 60) || "Cliente verificado";
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLogsService,
  ) {}

  private async requireProductBySlug(slug: string) {
    const { data, error } = await this.supabase.admin
      .from("products")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Producto no encontrado");
    return data as { id: string; name: string; slug: string };
  }

  private async getSummary(productId: string): Promise<ReviewSummary> {
    const { data, error } = await this.supabase.admin
      .from("product_rating_summary")
      .select(
        "average_rating, review_count, one_star, two_star, three_star, four_star, five_star",
      )
      .eq("product_id", productId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    return {
      average: Number(data.average_rating ?? 0),
      count: Number(data.review_count ?? 0),
      distribution: {
        1: Number(data.one_star ?? 0),
        2: Number(data.two_star ?? 0),
        3: Number(data.three_star ?? 0),
        4: Number(data.four_star ?? 0),
        5: Number(data.five_star ?? 0),
      },
    };
  }

  /** Listado público de reseñas aprobadas + resumen agregado. */
  async listByProduct(slug: string, query: ListReviewsQuery) {
    const product = await this.requireProductBySlug(slug);
    const limit = query.limit ?? 12;
    const offset = query.offset ?? 0;

    let q = this.supabase.admin
      .from("product_reviews")
      .select("id, rating, title, body, author_name, created_at", {
        count: "exact",
      })
      .eq("product_id", product.id)
      .eq("status", "APPROVED")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.rating) q = q.eq("rating", query.rating);

    const { data, error, count } = await q;
    if (error) throw error;

    const summary = await this.getSummary(product.id);
    const items: PublicReview[] = (data ?? []).map((row: any) => ({
      id: row.id,
      rating: Number(row.rating),
      title: row.title,
      body: row.body,
      author_name: row.author_name,
      verified: true,
      created_at: row.created_at,
    }));

    return { summary, items, total: count ?? items.length };
  }

  /**
   * ¿Qué líneas de pedido puede reseñar este usuario para el producto?
   * Devuelve sólo compras pagadas/enviadas/entregadas y marca las que ya
   * tienen reseña para que la UI no ofrezca duplicados.
   */
  async eligibility(user: AuthenticatedUser, slug: string) {
    const product = await this.requireProductBySlug(slug);

    const { data, error } = await this.supabase.admin
      .from("order_items")
      .select(
        "id, order_id, product_name_snapshot, variant_label, created_at, " +
          "orders!inner(user_id, status, created_at), " +
          "product_variants!inner(product_id)",
      )
      .eq("product_variants.product_id", product.id)
      .eq("orders.user_id", user.id)
      .in("orders.status", [...REVIEWABLE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const rows = (data ?? []) as any[];
    const itemIds = rows.map((row) => row.id);

    let reviewedIds = new Set<string>();
    if (itemIds.length > 0) {
      const { data: reviews, error: rErr } = await this.supabase.admin
        .from("product_reviews")
        .select("order_item_id")
        .in("order_item_id", itemIds);
      if (rErr) throw rErr;
      reviewedIds = new Set((reviews ?? []).map((r: any) => r.order_item_id));
    }

    const items = rows.map((row) => ({
      orderItemId: row.id as string,
      orderId: row.order_id as string,
      productName: row.product_name_snapshot as string,
      variantLabel: row.variant_label as string,
      purchasedAt: (first<any>(row.orders)?.created_at ?? row.created_at) as string,
      reviewed: reviewedIds.has(row.id),
    }));

    return {
      canReview: items.some((item) => !item.reviewed),
      productId: product.id,
      items,
    };
  }

  /** Crea una reseña verificada. Sólo el dueño de una compra válida puede. */
  async create(user: AuthenticatedUser, dto: CreateReviewDto) {
    const body = dto.body.trim();
    if (body.length < 20) {
      throw new BadRequestException(
        "La reseña debe tener al menos 20 caracteres.",
      );
    }

    const { data: item, error: iErr } = await this.supabase.admin
      .from("order_items")
      .select(
        "id, order_id, product_name_snapshot, variant_label, " +
          "orders!inner(user_id, status), " +
          "product_variants!inner(product_id)",
      )
      .eq("id", dto.orderItemId)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!item) throw new NotFoundException("Línea de pedido no encontrada");

    const row = item as any;
    const order = first<any>(row.orders);
    const variant = first<any>(row.product_variants);
    if (!order || !variant) {
      throw new NotFoundException("No se pudo validar la compra");
    }
    if (order.user_id !== user.id) {
      throw new ForbiddenException("Esa compra no pertenece a tu cuenta");
    }
    if (!REVIEWABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        "Sólo puedes reseñar pedidos pagados, enviados o entregados.",
      );
    }

    const { data: existing } = await this.supabase.admin
      .from("product_reviews")
      .select("id")
      .eq("order_item_id", dto.orderItemId)
      .maybeSingle();
    if (existing) {
      throw new ConflictException("Ya escribiste una reseña para esta compra");
    }

    const authorName = cleanAuthorName(
      user.profile?.full_name || user.email?.split("@")[0],
    );

    const { data, error } = await this.supabase.admin
      .from("product_reviews")
      .insert({
        product_id: variant.product_id,
        user_id: user.id,
        order_id: row.order_id,
        order_item_id: row.id,
        rating: dto.rating,
        title: dto.title?.trim() || null,
        body,
        author_name: authorName,
        // Compra verificada: publicación inmediata, moderación posterior.
        status: "APPROVED",
      })
      .select("id, rating, title, body, author_name, created_at")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException(
          "Ya escribiste una reseña para esta compra",
        );
      }
      throw error;
    }

    this.logger.log(
      `Review ${data.id} creada por ${user.id} para producto ${variant.product_id}`,
    );
    return { ...data, verified: true };
  }

  /** Panel admin: todas las reseñas, con filtro por estado. */
  async adminList(query: AdminListReviewsQuery) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    let q = this.supabase.admin
      .from("product_reviews")
      .select(
        "id, rating, title, body, author_name, status, moderation_note, created_at, " +
          "product:products(id, name, slug)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.status) q = q.eq("status", query.status);

    const { data, error, count } = await q;
    if (error) throw error;

    return {
      items: (data ?? []).map((row: any) => ({
        ...row,
        product: first<any>(row.product),
      })),
      total: count ?? 0,
    };
  }

  async moderate(
    admin: AuthenticatedUser,
    reviewId: string,
    dto: ModerateReviewDto,
  ) {
    const { data: current, error: fErr } = await this.supabase.admin
      .from("product_reviews")
      .select("id, status, product_id")
      .eq("id", reviewId)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!current) throw new NotFoundException("Reseña no encontrada");

    const { data, error } = await this.supabase.admin
      .from("product_reviews")
      .update({
        status: dto.status,
        moderation_note: dto.note?.trim() || null,
      })
      .eq("id", reviewId)
      .select("id, status, moderation_note, product_id")
      .single();
    if (error) throw error;

    await this.audit.record(admin.id, `REVIEW_${dto.status}`, reviewId, {
      productId: data.product_id,
      previousStatus: current.status,
      note: dto.note?.trim() || null,
    });

    return data;
  }
}
