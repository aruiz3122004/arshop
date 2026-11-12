import "reflect-metadata";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { GuestTokenService } from "../src/modules/guest/guest-token.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import type { CreateOrderDto } from "../src/modules/orders/dto/create-order.dto";

const SECRET = "test_guest_secret_at_least_32_chars_long";

function tokenService(opts: { ttlSeconds?: number } = {}) {
  const config = {
    get: (key: string) => {
      if (key === "GUEST_ORDER_SECRET") return SECRET;
      if (key === "GUEST_ORDER_TTL_SECONDS") return opts.ttlSeconds;
      return undefined;
    },
    getOrThrow: (key: string) => {
      if (key === "QR_HMAC_SECRET") return SECRET;
      throw new Error(`missing ${key}`);
    },
  };
  return new GuestTokenService(config as any);
}

describe("GuestTokenService", () => {
  it("emite un token verificable para la orden", () => {
    const svc = tokenService();
    const token = svc.issue("order-123");

    expect(token.split(".")).toHaveLength(2);
    expect(svc.verify(token).orderId).toBe("order-123");
  });

  it("rechaza un token manipulado", () => {
    const svc = tokenService();
    const token = svc.issue("order-123");
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(() => svc.verify(tampered)).toThrow(UnauthorizedException);
  });

  it("rechaza un token expirado", () => {
    const svc = tokenService({ ttlSeconds: -10 });
    const token = svc.issue("order-123");

    expect(() => svc.verify(token)).toThrow(UnauthorizedException);
  });

  it("no acepta un token de otra orden", () => {
    const svc = tokenService();
    const token = svc.issue("order-123");

    expect(() => svc.verifyForOrder(token, "order-999")).toThrow(
      UnauthorizedException,
    );
  });
});

/**
 * Mock mínimo de Supabase para `OrdersService.create`: cubre las tablas que
 * toca el happy path de invitado (variantes, tarifas, orders y order_items).
 */
function guestSupabase() {
  const inserts: { table: string; payload: any }[] = [];
  const order = {
    id: "order-guest-1",
    user_id: null,
    is_guest: true,
    guest_email: "ana@example.com",
    guest_name: "Ana Gómez",
    total_cop: 161_000,
  };

  const admin = {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "shipping_rates") {
            return { data: { cost_cop: 12_000, free_above_cop: 600_000 }, error: null };
          }
          return { data: null, error: null };
        },
        insert: (payload: any) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: order, error: null }),
            }),
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: null, error: null }),
          };
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      };

      if (table === "product_variants") {
        chain.in = () => {
          const thenable: any = {
            then: (resolve: (v: unknown) => unknown) =>
              resolve({
                data: [
                  {
                    id: "variant-1",
                    size: "M",
                    color_name: "Negro",
                    stock: 5,
                    products: {
                      name: "Blazer lino",
                      price_cop: 149_000,
                      currency: "COP",
                      drop_starts_at: null,
                      drop_ends_at: null,
                    },
                  },
                ],
                error: null,
              }),
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return thenable;
        };
        return chain;
      }

      return chain;
    },
  };

  return { admin, inserts };
}

function ordersServiceWith(supabaseReturn: ReturnType<typeof guestSupabase>) {
  const guestToken = tokenService();
  const inventory = { reserveStock: jest.fn().mockResolvedValue(undefined) };
  const svc = new OrdersService(
    supabaseReturn as any,
    { getJson: jest.fn(), setJson: jest.fn() } as any,
    {} as any,
    inventory as any,
    { enqueueOrderConfirmation: jest.fn() } as any,
    { record: jest.fn() } as any,
    {} as any,
    { findForOrder: jest.fn().mockResolvedValue(null) } as any,
    guestToken,
  );
  return { svc, inventory };
}

const dto: CreateOrderDto = {
  items: [{ variantId: "variant-1", quantity: 1 }],
  shippingAddress: {
    line1: "Calle 1 #2-3",
    neighborhood: "Chapinero",
    city: "Bogotá",
    department: "Cundinamarca",
    phone: "3001234567",
  },
  habeasDataAccepted: true,
};

describe("OrdersService.create · invitado", () => {
  it("crea la orden sin user_id, guarda guest_email y devuelve token", async () => {
    const supabaseReturn = guestSupabase();
    const { svc } = ordersServiceWith(supabaseReturn);

    const result: any = await svc.create(null, dto, {
      email: "  Ana@Example.com ",
      fullName: "  Ana Gómez ",
    });

    expect(result.guest_token).toEqual(expect.any(String));
    expect(result.guest_token.split(".")).toHaveLength(2);

    const orderInsert = supabaseReturn.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({
      user_id: null,
      is_guest: true,
      guest_email: "ana@example.com",
      guest_name: "Ana Gómez",
      status: "PENDING_PAYMENT",
      habeas_data_accepted: true,
    });

    const itemsInsert = supabaseReturn.inserts.find(
      (i) => i.table === "order_items",
    );
    expect(itemsInsert?.payload).toEqual([
      expect.objectContaining({
        order_id: "order-guest-1",
        product_variant_id: "variant-1",
        quantity: 1,
      }),
    ]);
  });

  it("exige identidad de invitado cuando no hay sesión", async () => {
    const supabaseReturn = guestSupabase();
    const { svc } = ordersServiceWith(supabaseReturn);

    await expect(svc.create(null, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(supabaseReturn.inserts).toHaveLength(0);
  });
});
