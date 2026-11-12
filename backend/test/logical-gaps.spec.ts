import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DeliveryService } from "../src/modules/delivery/delivery.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import { ConfirmDeliveryDto } from "../src/modules/delivery/dto/scan-qr.dto";

describe("Corrección de Vacíos Argumentales (A–E)", () => {
  describe("Vacío B · ConfirmDeliveryDto y bloqueo de source='manual' sin QR/código", () => {
    it("ConfirmDeliveryDto exige receiverName, documentType y documentNumber válidos", async () => {
      const invalid = plainToInstance(ConfirmDeliveryDto, { source: "manual" });
      const errors = await validate(invalid);
      expect(errors.length).toBeGreaterThanOrEqual(3);

      const valid = plainToInstance(ConfirmDeliveryDto, {
        receiverName: "Ana Gómez",
        documentType: "CC",
        documentNumber: "10203040",
        source: "qr",
      });
      expect(await validate(valid)).toHaveLength(0);
    });

    it("confirmDelivery rechaza source='manual' si qr_consumed_at es null", async () => {
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
                    maybeSingle: async () => ({
                      data: {
                        id: "ord-1",
                        delivery_id: "dom-1",
                        status: "SHIPPED",
                        delivery_confirmation: null,
                        qr_consumed_at: null,
                        shipped_at: new Date().toISOString(),
                      },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {};
          },
        },
      } as any;

      const svc = new DeliveryService(
        supabase,
        {} as any,
        { record: jest.fn() } as any,
        { sendToUser: jest.fn() } as any,
        { getOrThrow: () => 48 } as any,
      );

      await expect(
        svc.confirmDelivery(
          "u-1",
          "ord-1",
          "Ana Gómez",
          "CC",
          "10203040",
          "manual",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("Vacío C · Guardas de estado PAID/SHIPPED y asignación post-pago", () => {
    it("listMyOrders devuelve vacío si se filtra por PENDING_PAYMENT", async () => {
      const svc = new DeliveryService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      const res = await svc.listMyOrders("u-1", "PENDING_PAYMENT");
      expect(res).toEqual([]);
    });

    it("verifyClientCode y scanQr rechazan órdenes en PENDING_PAYMENT o DISPUTED", async () => {
      let currentOrder: any = {
        id: "ord-1",
        delivery_id: "dom-1",
        status: "PENDING_PAYMENT",
        delivery_confirmation: null,
        qr_jti: "jti-1",
        qr_consumed_at: null,
      };

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
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: currentOrder, error: null }),
                }),
              }),
            };
          },
        },
      } as any;

      const qr = {
        verify: () => ({ orderId: "ord-1", jti: "jti-1" }),
        hashClientCode: () => "hash",
      } as any;

      const svc = new DeliveryService(
        supabase,
        qr,
        { record: jest.fn() } as any,
        { sendToUser: jest.fn() } as any,
        { getOrThrow: () => 48 } as any,
      );

      await expect(
        svc.verifyClientCode("u-1", "ord-1", "1234"),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        svc.scanQr("u-1", { token: "valid-token-12345" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      currentOrder = {
        ...currentOrder,
        status: "SHIPPED",
        delivery_confirmation: "DISPUTED",
      };

      await expect(
        svc.verifyClientCode("u-1", "ord-1", "1234"),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        svc.scanQr("u-1", { token: "valid-token-12345" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("OrdersService.issueQr rechaza órdenes en PENDING_PAYMENT", async () => {
      const supabase = {
        admin: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    user_id: "u-1",
                    status: "PENDING_PAYMENT",
                    qr_consumed_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        },
      } as any;

      const ordersSvc = new OrdersService(
        supabase,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(ordersSvc.issueQr("u-1", "ord-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("OrdersService.updateStatus('PAID') dispara assign_delivery automáticamente", async () => {
      const rpcMock = jest.fn().mockResolvedValue({
        data: { status: "ASSIGNED", delivery_id: "dom-1" },
        error: null,
      });

      const supabase = {
        admin: {
          from: () => ({
            update: (patch: any) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "ord-1",
                      status: patch.status,
                      delivery_status: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    status: "PAID",
                    delivery_status: "ASSIGNED",
                    delivery_id: "dom-1",
                  },
                  error: null,
                }),
              }),
            }),
          }),
          rpc: rpcMock,
        },
      } as any;

      const ordersSvc = new OrdersService(
        supabase,
        {} as any,
        {} as any,
        {} as any,
        { enqueueOrderUnassigned: jest.fn() } as any,
        { record: jest.fn() } as any,
        {} as any,
      );

      const res = await ordersSvc.updateStatus("ord-1", "PAID");
      expect(rpcMock).toHaveBeenCalledWith("assign_delivery", {
        p_order_id: "ord-1",
      });
      expect(res.delivery_status).toBe("ASSIGNED");
    });
  });

  describe("Vacío D · Reasignación administrativa de órdenes UNASSIGNED", () => {
    it("reassignDelivery rechaza órdenes no pagadas y permite reasignar órdenes PAID", async () => {
      let orderStatus = "PENDING_PAYMENT";
      const rpcMock = jest.fn().mockResolvedValue({
        data: { status: "ASSIGNED", delivery_id: "dom-1" },
        error: null,
      });

      const supabase = {
        admin: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    status: orderStatus,
                    shipping_department: "Antioquia",
                    shipping_city: "Medellín",
                    delivery_id: null,
                    delivery_status: "UNASSIGNED",
                    items: [],
                  },
                  error: null,
                }),
              }),
            }),
          }),
          rpc: rpcMock,
        },
      } as any;

      const auditMock = { record: jest.fn().mockResolvedValue(undefined) };
      const ordersSvc = new OrdersService(
        supabase,
        {} as any,
        {} as any,
        {} as any,
        { enqueueOrderUnassigned: jest.fn() } as any,
        auditMock as any,
        {} as any,
      );

      await expect(
        ordersSvc.reassignDelivery("admin-1", "ord-1"),
      ).rejects.toBeInstanceOf(BadRequestException);

      orderStatus = "PAID";
      await ordersSvc.reassignDelivery("admin-1", "ord-1");
      expect(rpcMock).toHaveBeenCalledWith("assign_delivery", {
        p_order_id: "ord-1",
      });
      expect(auditMock.record).toHaveBeenCalledWith(
        "admin-1",
        "ORDER_DELIVERY_REASSIGNED",
        "ord-1",
        expect.objectContaining({ mode: "auto" }),
      );
    });
  });
});
