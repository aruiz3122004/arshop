import "reflect-metadata";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { DeliveryService } from "../src/modules/delivery/delivery.service";

/**
 * `verifyClientCodeAnywhere` es el camino del repartidor que escribe el código
 * de 4 dígitos sin tener una orden abierta (pantalla /domiciliario/scan).
 *
 * Antes ese valor viajaba a /delivery/scan-qr, cuyo DTO exige un token de al
 * menos 10 caracteres ("token must be longer than or equal to 10 characters").
 * Aquí se resuelve la orden por hash entre las entregas activas asignadas y
 * se delega en la verificación canónica (lock por orden + RPC atómica).
 */

const dom = { id: "dom-1", user_id: "u-1" };

function makeOrder(id: string, code: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    delivery_id: "dom-1",
    user_id: "customer-1",
    status: "SHIPPED",
    delivery_confirmation: null,
    qr_consumed_at: null,
    receiver_prefilled: null,
    verify_code_failed_attempts: 0,
    verify_code_locked_until: null,
    client_code_hash: `${id}:${code}`,
    client_code_exp: new Date(Date.now() + 60_000).toISOString(),
    ...patch,
  };
}

function makeService(orders: any[]) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const updates: any[] = [];

  const supabase = {
    admin: {
      from: (table: string) => {
        if (table === "domiciliarios") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: dom, error: null }),
              }),
            }),
          };
        }
        if (table === "orders") {
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                if (col === "delivery_id") {
                  return {
                    in: () => ({
                      is: async () => ({ data: orders, error: null }),
                    }),
                  };
                }
                // verifyClientCode: .eq("id", orderId).maybeSingle()
                return {
                  maybeSingle: async () => ({
                    data: orders.find((o) => o.id === val) ?? null,
                    error: null,
                  }),
                };
              },
            }),
            update: (patch: any) => {
              updates.push(patch);
              return { eq: async () => ({ data: null, error: null }) };
            },
          };
        }
        throw new Error(`tabla inesperada: ${table}`);
      },
      rpc: async (name: string, args: any) => {
        rpcCalls.push({ name, args });
        return { data: true, error: null };
      },
    },
  } as any;

  const qr = {
    hashClientCode: (orderId: string, code: string) => `${orderId}:${code}`,
  } as any;
  const audit = { record: jest.fn() } as any;
  const push = { sendToUser: jest.fn() } as any;
  const config = { getOrThrow: () => 48 } as any;

  const svc = new DeliveryService(supabase, qr, audit, push, config);
  return { svc, rpcCalls, updates };
}

describe("DeliveryService.verifyClientCodeAnywhere", () => {
  it("resuelve el código entre las entregas asignadas y consume esa orden", async () => {
    const { svc, rpcCalls } = makeService([
      makeOrder("o-1", "1111"),
      makeOrder("o-2", "9876"),
    ]);

    const res = await svc.verifyClientCodeAnywhere("u-1", "9876");

    expect(res.ok).toBe(true);
    expect(res.orderId).toBe("o-2");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      name: "consume_order_client_code",
      args: { p_order_id: "o-2", p_hash: "o-2:9876" },
    });
  });

  it("rechaza un código que no coincide con ninguna entrega activa", async () => {
    const { svc, rpcCalls } = makeService([makeOrder("o-1", "1111")]);

    await expect(
      svc.verifyClientCodeAnywhere("u-1", "2222"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // No se toca la RPC de consumo: un fallo no debe quemar una orden.
    expect(rpcCalls).toHaveLength(0);
  });

  it("ignora códigos vencidos aunque el hash coincida", async () => {
    const { svc, rpcCalls } = makeService([
      makeOrder("o-1", "1111", {
        client_code_exp: new Date(Date.now() - 1_000).toISOString(),
      }),
    ]);

    await expect(
      svc.verifyClientCodeAnywhere("u-1", "1111"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rpcCalls).toHaveLength(0);
  });

  it("respeta el lockout por orden de la verificación canónica", async () => {
    const { svc } = makeService([
      makeOrder("o-1", "1111", {
        verify_code_locked_until: new Date(Date.now() + 60_000).toISOString(),
      }),
    ]);

    await expect(
      svc.verifyClientCodeAnywhere("u-1", "1111"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
