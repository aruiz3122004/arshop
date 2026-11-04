import "reflect-metadata";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { DeliveryService } from "../src/modules/delivery/delivery.service";

/**
 * verifyClientCode (código 4 dígitos como alternativa al QR) debe:
 *   - Lockout tras 5 fallos consecutivos por orden (ventana 15 min).
 *   - No afectar otras órdenes.
 *   - Resetear contador tras un éxito.
 */

function makeService(opts: {
  dom?: any;
  order?: any;
  consume?: boolean;
}) {
  const dom = opts.dom ?? { id: "dom-1", user_id: "u-1" };
  let orderState = opts.order ?? {
    id: "o-1",
    delivery_id: "dom-1",
    user_id: "customer-1",
    status: "SHIPPED",
    qr_consumed_at: null,
    receiver_prefilled: null,
    verify_code_failed_attempts: 0,
    verify_code_locked_until: null,
  };

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
              eq: () => ({
                maybeSingle: async () => ({ data: orderState, error: null }),
              }),
            }),
            update: (patch: any) => {
              updates.push(patch);
              orderState = { ...orderState, ...patch };
              return {
                eq: async () => ({ data: null, error: null }),
              };
            },
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
      rpc: async () => ({ data: opts.consume ?? false, error: null }),
    },
  } as any;

  const qr = {
    hashClientCode: (orderId: string, code: string) => `${orderId}:${code}`,
  } as any;
  const audit = { record: jest.fn() } as any;
  const push = { sendToUser: jest.fn() } as any;
  const config = { getOrThrow: () => 48 } as any;

  const svc = new DeliveryService(supabase, qr, audit, push, config);
  return { svc, updates, getOrder: () => orderState };
}

describe("DeliveryService.verifyClientCode lockout", () => {
  it("tras 5 fallos marca verify_code_locked_until", async () => {
    const { svc, getOrder } = makeService({ consume: false });

    for (let i = 0; i < 4; i++) {
      await expect(
        svc.verifyClientCode("u-1", "o-1", "0000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // 5º fallo: debe aplicar lockout
    await expect(
      svc.verifyClientCode("u-1", "o-1", "0000"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(getOrder().verify_code_locked_until).toBeTruthy();
  });

  it("durante lockout responde Forbidden sin tocar RPC", async () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const { svc } = makeService({
      consume: false,
      order: {
        id: "o-1",
        delivery_id: "dom-1",
        user_id: "customer-1",
        status: "SHIPPED",
        qr_consumed_at: null,
        receiver_prefilled: null,
        verify_code_failed_attempts: 0,
        verify_code_locked_until: future,
      },
    });

    await expect(
      svc.verifyClientCode("u-1", "o-1", "1234"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("código válido resetea contador y responde ok", async () => {
    const { svc, getOrder } = makeService({
      consume: true,
      order: {
        id: "o-1",
        delivery_id: "dom-1",
        user_id: "customer-1",
        status: "SHIPPED",
        qr_consumed_at: null,
        receiver_prefilled: null,
        verify_code_failed_attempts: 3,
        verify_code_locked_until: null,
      },
    });

    const res = await svc.verifyClientCode("u-1", "o-1", "1234");
    expect(res.ok).toBe(true);
    expect(getOrder().verify_code_failed_attempts).toBe(0);
    expect(getOrder().verify_code_locked_until).toBeNull();
  });

  it("rechaza si la orden no está asignada al repartidor", async () => {
    const { svc } = makeService({
      consume: false,
      dom: { id: "dom-OTHER", user_id: "u-1" },
    });

    await expect(
      svc.verifyClientCode("u-1", "o-1", "1234"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
