import "reflect-metadata";
import { OrdersService } from "../src/modules/orders/orders.service";

/**
 * `issueQr` rota el QR firmado en cada llamada (la página lo refresca cada
 * 60 s), pero NO debe rotar el código de 4 dígitos mientras siga vigente y el
 * cliente pida conservarlo (`keepCode`). Si lo rotara, el código que el
 * cliente acababa de dictar dejaba de coincidir con el hash guardado justo
 * cuando el repartidor lo escribía.
 */

function build(opts: { order: any }) {
  const updates: any[] = [];
  let issuedCodes = 0;

  const supabaseAdmin = {
    from: (table: string) => {
      if (table !== "orders") throw new Error(`tabla inesperada: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.order, error: null }),
          }),
        }),
        update: (patch: any) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  const qr = {
    issue: () => ({ token: "payload.sig", jti: "jti-1", exp: 9_999 }),
    issueClientCode: () => {
      issuedCodes += 1;
      return {
        code: "4321",
        hash: `hash-${issuedCodes}`,
        exp: Math.floor(Date.now() / 1000) + 120,
      };
    },
    toDataUrl: async () => "data:image/png;base64,xx",
  };

  const svc = new OrdersService(
    { admin: supabaseAdmin } as any,
    {} as any,
    qr as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { svc, updates, issuedCodes: () => issuedCodes };
}

function makeOrder(patch: Record<string, unknown> = {}) {
  return {
    id: "o-1",
    user_id: "u-1",
    status: "SHIPPED",
    qr_consumed_at: null,
    qr_jti: "jti-old",
    client_code_hash: "hash-1",
    client_code_exp: new Date(Date.now() + 60_000).toISOString(),
    estimated_delivery_at: null,
    delivery_warning: null,
    delivery_status: "ASSIGNED",
    delivery_id: "dom-1",
    receiver_prefilled: null,
    ...patch,
  };
}

describe("OrdersService.issueQr · código de 4 dígitos", () => {
  it("en la primera carga emite un código nuevo y lo persiste", async () => {
    const { svc, updates, issuedCodes } = build({ order: makeOrder() });

    const res = await svc.issueQr("u-1", "o-1");

    expect(issuedCodes()).toBe(1);
    expect(res.clientCode).toBe("4321");
    expect(updates[0]).toMatchObject({
      qr_jti: "jti-1",
      client_code_hash: "hash-1",
    });
    expect(updates[0].client_code_exp).toBeTruthy();
  });

  it("conserva el código vigente cuando el polling manda su exp", async () => {
    const order = makeOrder();
    const storedExp = Math.floor(
      new Date(order.client_code_exp).getTime() / 1000,
    );
    const { svc, updates, issuedCodes } = build({ order });

    const res = await svc.issueQr("u-1", "o-1", String(storedExp));

    expect(issuedCodes()).toBe(0);
    // El QR sí rota; el hash del código no se toca.
    expect(updates[0]).toMatchObject({ qr_jti: "jti-1" });
    expect(updates[0]).not.toHaveProperty("client_code_hash");
    expect(res.clientCode).toBeUndefined();
    expect(res.clientCodeExp).toBe(storedExp);
  });

  it("emite uno nuevo si el vigente ya expiró", async () => {
    const expired = makeOrder({
      client_code_exp: new Date(Date.now() - 1_000).toISOString(),
    });
    const expiredExp = Math.floor(
      new Date(expired.client_code_exp).getTime() / 1000,
    );
    const { svc, updates, issuedCodes } = build({ order: expired });

    const res = await svc.issueQr("u-1", "o-1", String(expiredExp));

    expect(issuedCodes()).toBe(1);
    expect(res.clientCode).toBe("4321");
    expect(updates[0]).toHaveProperty("client_code_hash");
  });

  it("emite uno nuevo si el exp enviado no corresponde al guardado", async () => {
    const { svc, updates, issuedCodes } = build({ order: makeOrder() });

    const res = await svc.issueQr("u-1", "o-1", "123");

    expect(issuedCodes()).toBe(1);
    expect(res.clientCode).toBe("4321");
    expect(updates[0]).toHaveProperty("client_code_hash");
  });
});
