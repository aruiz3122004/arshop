import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { DeliveryService } from "../src/modules/delivery/delivery.service";

/**
 * La simulación de entrega es el único camino que deja el pedido en
 * PENDING_CLIENT (el cliente debe aceptar en 48 h). Por eso:
 *
 *   · No puede usarse si el cliente ya validó el QR o su código: ahí el
 *     pedido se cierra como entregado y punto.
 *   · No puede salir sin datos del receptor ni sin PIN/skipPin explícito.
 */

function makeService(order: any) {
  const updates: any[] = [];
  const recibido: any[] = [];

  const supabase = {
    admin: {
      from: (table: string) => {
        if (table === "domiciliarios") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "dom-1", user_id: "u-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: order, error: null }),
              }),
            }),
            update: (patch: any) => {
              updates.push(patch);
              return {
                eq: () => ({
                  select: () => ({
                    single: async () => ({
                      data: { ...order, ...patch },
                      error: null,
                    }),
                  }),
                }),
              };
            },
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    full_name: "Patricia Hernández",
                    document_type: "CC",
                    document_number: "72561891",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "recibido") {
          return {
            upsert: async (row: any) => {
              recibido.push(row);
              return { error: null };
            },
          };
        }
        return {};
      },
    },
  } as any;

  const qr = {} as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const push = { sendToUser: jest.fn().mockResolvedValue({ sent: 0 }) } as any;
  const config = {
    getOrThrow: (key: string) =>
      key === "SIMULATED_DELIVERY_REMINDER_HOURS" ? 24 : 48,
  } as any;

  const svc = new DeliveryService(supabase, qr, audit, push, config);
  return { svc, updates, recibido, audit, push };
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o-1",
    delivery_id: "dom-1",
    user_id: "customer-1",
    status: "SHIPPED",
    shipped_at: new Date(Date.now() - 3_600_000).toISOString(),
    delivery_confirmation: null,
    qr_consumed_at: null,
    ...overrides,
  };
}

describe("DeliveryService.simulateDelivery", () => {
  it("rechaza simular si el cliente ya validó el QR o su código", async () => {
    const { svc, updates, recibido } = makeService(
      baseOrder({ qr_consumed_at: new Date().toISOString() }),
    );

    await expect(
      svc.simulateDelivery("u-1", "o-1", { skipPin: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Ni siquiera debe registrar un recibido ni tocar la orden.
    expect(updates).toHaveLength(0);
    expect(recibido).toHaveLength(0);
  });

  it("con skipPin deja PENDING_CLIENT, recordatorio a 24 h y disputa a 48 h", async () => {
    const { svc, updates, audit } = makeService(baseOrder());

    await svc.simulateDelivery("u-1", "o-1", { skipPin: true });

    const patch = updates[0];
    expect(patch.delivery_confirmation).toBe("PENDING_CLIENT");
    expect(patch.delivery_pin_skipped).toBe(true);
    expect(patch.delivery_reminder_sent_at).toBeNull();

    const reminder = new Date(patch.delivery_reminder_at).getTime();
    const deadline = new Date(patch.delivery_auto_confirm_at).getTime();
    expect(reminder - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(deadline - Date.now()).toBeGreaterThan(47 * 3_600_000);
    expect(deadline).toBeGreaterThan(reminder);

    expect(audit.record).toHaveBeenCalledWith(
      "u-1",
      "ORDER_SIMULATED_BY_REPARTIDOR",
      "o-1",
      expect.objectContaining({ pin_verified: false }),
    );
  });

  it("sin PIN y sin skipPin no simula (evita el atajo silencioso)", async () => {
    const { svc, updates } = makeService(baseOrder());

    await expect(
      svc.simulateDelivery("u-1", "o-1", {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it("rechaza simular dos veces la misma orden", async () => {
    const { svc } = makeService(
      baseOrder({ delivery_confirmation: "PENDING_CLIENT" }),
    );

    await expect(
      svc.simulateDelivery("u-1", "o-1", { skipPin: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
