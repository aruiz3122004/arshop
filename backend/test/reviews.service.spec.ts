import "reflect-metadata";
import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { ReviewsService } from "../src/modules/reviews/reviews.service";
import type { AuthenticatedUser } from "../src/common/types/user";

type DbResult = { data: any; error: any };

/**
 * Mock mínimo del cliente de Supabase: `from(table)` devuelve un builder
 * encadenable y consume en orden las respuestas preparadas para esa tabla.
 * Alcanza para probar las reglas de negocio de las reseñas sin DB real.
 */
function mockSupabase(responses: Record<string, DbResult[]>) {
  const calls: { table: string; method: string; args: any[] }[] = [];

  const admin = {
    from(table: string) {
      const chain: any = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "order",
        "limit",
        "range",
        "update",
        "insert",
      ]) {
        chain[method] = (...args: any[]) => {
          calls.push({ table, method, args });
          return chain;
        };
      }
      const next = (): DbResult =>
        responses[table]?.shift() ?? { data: [], error: null };
      chain.maybeSingle = async () => next();
      chain.single = async () => next();
      chain.then = (resolve: (value: DbResult) => unknown) => resolve(next());
      return chain;
    },
  };

  return { admin, calls };
}

const user = {
  id: "user-1",
  email: "ana@example.com",
  role: "CUSTOMER",
  blocked: false,
  profile: {
    id: "user-1",
    email: "ana@example.com",
    full_name: "Ana María Gómez",
    phone: null,
    document_type: null,
    document_number: null,
    role: "CUSTOMER",
    blocked: false,
    created_at: new Date().toISOString(),
  },
} as AuthenticatedUser;

function serviceWith(responses: Record<string, DbResult[]>) {
  const supabase = mockSupabase(responses);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ReviewsService(supabase as any, audit as any);
  return { service, supabase, audit };
}

function orderItem(overrides: Record<string, any> = {}) {
  return {
    id: "item-1",
    order_id: "order-1",
    product_name_snapshot: "Blazer lino",
    variant_label: "M / Negro",
    orders: { user_id: "user-1", status: "DELIVERED" },
    product_variants: { product_id: "product-1" },
    ...overrides,
  };
}

describe("ReviewsService", () => {
  it("rechaza reseñas de pedidos no pagados", async () => {
    const { service } = serviceWith({
      order_items: [
        {
          data: orderItem({
            orders: { user_id: "user-1", status: "PENDING_PAYMENT" },
          }),
          error: null,
        },
      ],
    });

    await expect(
      service.create(user, {
        orderItemId: "item-1",
        rating: 5,
        body: "La tela es increíble y el calce queda perfecto.",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza reseñar una compra de otra cuenta", async () => {
    const { service } = serviceWith({
      order_items: [
        {
          data: orderItem({
            orders: { user_id: "otro-user", status: "DELIVERED" },
          }),
          error: null,
        },
      ],
    });

    await expect(
      service.create(user, {
        orderItemId: "item-1",
        rating: 4,
        body: "Muy bonito, aunque la talla queda un poco amplia.",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("crea la reseña con snapshot del nombre del cliente", async () => {
    const created = {
      id: "review-1",
      rating: 5,
      title: "Perfecto",
      body: "La tela es increíble y el calce queda perfecto.",
      author_name: "Ana María Gómez",
      created_at: new Date().toISOString(),
    };
    const { service, supabase, audit } = serviceWith({
      order_items: [{ data: orderItem(), error: null }],
      product_reviews: [
        { data: null, error: null }, // no existe reseña previa
        { data: created, error: null }, // insert ... single()
      ],
    });

    const result = await service.create(user, {
      orderItemId: "item-1",
      rating: 5,
      title: "Perfecto",
      body: "La tela es increíble y el calce queda perfecto.",
    });

    expect(result).toMatchObject(created);
    const insert = supabase.calls.find(
      (c) => c.table === "product_reviews" && c.method === "insert",
    );
    expect(insert?.args[0]).toMatchObject({
      product_id: "product-1",
      user_id: "user-1",
      order_id: "order-1",
      rating: 5,
      author_name: "Ana María Gómez",
      status: "APPROVED",
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("valida el largo mínimo del cuerpo antes de consultar la DB", async () => {
    const { service, supabase } = serviceWith({});

    await expect(
      service.create(user, {
        orderItemId: "item-1",
        rating: 5,
        body: "Corto",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(supabase.calls).toHaveLength(0);
  });

  it("marca como revisadas las compras que ya tienen reseña", async () => {
    const { service } = serviceWith({
      products: [{ data: { id: "product-1", name: "Blazer", slug: "blazer" }, error: null }],
      order_items: [
        {
          data: [
            {
              ...orderItem(),
              created_at: "2026-01-01T00:00:00.000Z",
            },
            {
              ...orderItem({ id: "item-2" }),
              created_at: "2026-02-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      product_reviews: [
        { data: [{ order_item_id: "item-1" }], error: null },
      ],
    });

    const result = await service.eligibility(user, "blazer");

    expect(result.canReview).toBe(true);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderItemId: "item-1", reviewed: true }),
        expect.objectContaining({ orderItemId: "item-2", reviewed: false }),
      ]),
    );
  });
});
