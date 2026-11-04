import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SimulateDeliveryDto } from "../src/modules/delivery/dto/scan-qr.dto";
import { DeliveryConfirmationService } from "../src/modules/delivery/delivery-confirmation.service";

describe("SimulateDeliveryDto — PIN opcional", () => {
  it("rechaza un payload sin PIN y sin skipPin", async () => {
    const errors = await validate(plainToInstance(SimulateDeliveryDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("acepta PIN válido", async () => {
    const errors = await validate(
      plainToInstance(SimulateDeliveryDto, { pin: "1234" }),
    );
    expect(errors).toHaveLength(0);
  });

  it("acepta skipPin: true sin PIN (repartidor sin el PIN a mano)", async () => {
    const errors = await validate(
      plainToInstance(SimulateDeliveryDto, {
        skipPin: true,
        receiverName: "Patricia Hernández",
        documentType: "CC",
        documentNumber: "72561891",
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it("rechaza un PIN con formato inválido", async () => {
    const errors = await validate(
      plainToInstance(SimulateDeliveryDto, { pin: "12" }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

/**
 * El barrido de la ventana de confirmación tiene dos hitos. Antes, al vencer
 * el plazo el pedido se auto-aceptaba; ahora escala a disputa para que un
 * admin lo revise.
 */
describe("DeliveryConfirmationService", () => {
  function makeSupabase(rows: { reminder: any[]; expire: any[] }) {
    const patches: any[] = [];
    let mode: "reminder" | "expire" | "update" = "reminder";

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      not: () => {
        mode = "reminder";
        return chain;
      },
      lte: () => chain,
      lt: () => {
        mode = "expire";
        return chain;
      },
      limit: () => chain,
      update: (patch: any) => {
        patches.push(patch);
        mode = "update";
        return chain;
      },
      maybeSingle: async () => ({ data: { user_id: "dom-user" }, error: null }),
      then: (resolve: any) =>
        resolve({
          data: mode === "reminder" ? rows.reminder : rows.expire,
          error: null,
        }),
    };

    return { supabase: { admin: { from: () => chain } } as any, patches };
  }

  function build(rows: { reminder: any[]; expire: any[] }) {
    const { supabase, patches } = makeSupabase(rows);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const push = { sendToUser: jest.fn().mockResolvedValue({ sent: 1 }) };
    const notifications = {
      enqueueOrderDisputed: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new DeliveryConfirmationService(
      supabase,
      audit as any,
      push as any,
      notifications as any,
    );
    return { svc, patches, audit, push, notifications };
  }

  it("a las 24 h envía un recordatorio invasivo y lo marca como enviado", async () => {
    const { svc, patches, push } = build({
      reminder: [
        {
          id: "ord-1",
          user_id: "u-1",
          delivery_reminder_at: new Date().toISOString(),
          delivery_auto_confirm_at: new Date(
            Date.now() + 10 * 3_600_000,
          ).toISOString(),
        },
      ],
      expire: [],
    });

    await svc.sweep();

    expect(push.sendToUser).toHaveBeenCalledWith(
      "u-1",
      expect.objectContaining({
        requireInteraction: true,
        url: "/cuenta/pedidos/ord-1",
      }),
    );
    expect(
      patches.some((p) => typeof p.delivery_reminder_sent_at === "string"),
    ).toBe(true);
  });

  it("al vencer las 48 h pasa a DISPUTED y avisa al admin, nunca auto-acepta", async () => {
    const { svc, patches, notifications, audit } = build({
      reminder: [],
      expire: [
        {
          id: "ord-2",
          user_id: "u-2",
          delivery_id: "dom-1",
          delivery_auto_confirm_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });

    await svc.sweep();

    const dispute = patches.find((p) => p.delivery_confirmation === "DISPUTED");
    expect(dispute).toBeDefined();
    expect(dispute.delivery_dispute_reason).toContain("NO_RESPONSE");
    expect(
      patches.some((p) => p.delivery_confirmation === "AUTO_ACCEPTED"),
    ).toBe(false);
    expect(notifications.enqueueOrderDisputed).toHaveBeenCalledWith("ord-2");
    expect(audit.record).toHaveBeenCalledWith(
      "u-2",
      "ORDER_DELIVERY_DISPUTED_BY_TIMEOUT",
      "ord-2",
      expect.anything(),
    );
  });
});
