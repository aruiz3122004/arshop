import "reflect-metadata";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OrdersService } from "../src/modules/orders/orders.service";

describe("Gaps Comerciales (G1–G6)", () => {
  const buildOrdersService = (supabaseAdmin: any, inventoryOverrides: any = {}) =>
    new OrdersService(
      { admin: supabaseAdmin } as any,
      { setJson: jest.fn() } as any,
      {} as any,
      {
        reserveStock: jest.fn(),
        releaseReservation: jest.fn().mockResolvedValue(undefined),
        ...inventoryOverrides,
      } as any,
      {
        enqueueOrderUnassigned: jest.fn().mockResolvedValue(undefined),
      } as any,
      { record: jest.fn().mockResolvedValue(undefined) } as any,
      { sendToUser: jest.fn() } as any,
      { findForOrder: jest.fn().mockResolvedValue(null) } as any,
    );

  describe("G4 · Motor de Cupones Promocionales", () => {
    it("calcula descuento porcentual (PERCENT) y valida mínimo de compra", async () => {
      const supabaseAdmin = {
        from: (table: string) => {
          if (table === "coupons") {
            return {
              select: () => ({
                ilike: () => ({
                  maybeSingle: async () => ({
                    data: {
                      code: "BIENVENIDO10",
                      discount_type: "PERCENT",
                      discount_value: 10,
                      min_subtotal_cop: 100000,
                      max_uses: null,
                      uses_count: 5,
                      expires_at: null,
                      active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const svc = buildOrdersService(supabaseAdmin);

      // Compra por debajo del mínimo debe fallar
      await expect(svc.validateCoupon("bienvenido10", 80000)).rejects.toThrow(
        BadRequestException,
      );

      // Compra válida de $200.000 COP -> 10% = $20.000 COP
      const res = await svc.validateCoupon("bienvenido10", 200000);
      expect(res).toEqual({
        code: "BIENVENIDO10",
        discountType: "PERCENT",
        discountValue: 10,
        minSubtotalCop: 100000,
        discountCop: 20000,
      });
    });
  });

  describe("G2 · Cancelación voluntaria pre-envío (PENDING_PAYMENT y PAID)", () => {
    it("cancela orden PENDING_PAYMENT liberando reserva de stock sin llamar a Stripe refund", async () => {
      const releaseReservation = jest.fn().mockResolvedValue(undefined);
      const refundFn = jest.fn();

      const supabaseAdmin = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "ord-pending", user_id: "u-1", status: "PENDING_PAYMENT" },
                error: null,
              }),
            }),
          }),
          update: (patch: any) => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "ord-pending", user_id: "u-1", ...patch },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      const svc = buildOrdersService(supabaseAdmin, { releaseReservation });
      const res = await svc.cancelOrder("u-1", false, "ord-pending", refundFn);

      expect(releaseReservation).toHaveBeenCalledWith("ord-pending");
      expect(refundFn).not.toHaveBeenCalled();
      expect(res.status).toBe("CANCELLED");
    });

    it("cancela orden PAID invocando refundFn (reembolso Stripe + restauración de stock)", async () => {
      const refundFn = jest.fn().mockResolvedValue({
        id: "ord-paid",
        status: "CANCELLED",
      });

      const supabaseAdmin = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "ord-paid", user_id: "u-1", status: "PAID" },
                error: null,
              }),
            }),
          }),
        }),
      };

      const svc = buildOrdersService(supabaseAdmin);
      const res = await svc.cancelOrder("u-1", false, "ord-paid", refundFn);

      expect(refundFn).toHaveBeenCalledWith("ord-paid");
      expect((res as any).status).toBe("CANCELLED");
    });

    it("bloquea cancelación cuando la orden ya fue SHIPPED o si no pertenece al cliente", async () => {
      const supabaseAdmin = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "ord-shipped", user_id: "u-owner", status: "SHIPPED" },
                error: null,
              }),
            }),
          }),
        }),
      };

      const svc = buildOrdersService(supabaseAdmin);
      await expect(
        svc.cancelOrder("u-other", false, "ord-shipped", jest.fn()),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        svc.cancelOrder("u-owner", false, "ord-shipped", jest.fn()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("G1 · Devoluciones, Cambios de Talla y Retracto (Ley 1480 Art. 47)", () => {
    it("permite solicitar cambio de talla o retracto dentro de los 5 días hábiles y bloquea si venció", async () => {
      let deliveredAtIso = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

      const supabaseAdmin = {
        from: (table: string) => {
          if (table === "orders") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "ord-deliv",
                      user_id: "u-1",
                      status: "DELIVERED",
                      delivered_at: deliveredAtIso,
                      updated_at: deliveredAtIso,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "order_returns") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: (row: any) => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "ret-1", ...row },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const svc = buildOrdersService(supabaseAdmin);

      // Dentro de ventana (2 días atrás) -> éxito
      const created = await svc.requestReturn("u-1", "ord-deliv", {
        type: "SIZE_EXCHANGE",
        reason: "Me quedó ajustada de hombros",
        requestedSize: "L",
      });
      expect(created.status).toBe("REQUESTED");
      expect(created.requested_size).toBe("L");

      // Hace 12 días calendario (>= 8 días hábiles) -> rechaza por Ley 1480 (5 días hábiles)
      deliveredAtIso = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString();
      await expect(
        svc.requestReturn("u-1", "ord-deliv", {
          type: "RETRACT_REFUND",
          reason: "Deseo ejercer retracto",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("G3 & G6 · Despacho por transportadora nacional y desglose IVA 19%", () => {
    it("markShipped guarda shipping_carrier, tracking_number y tracking_url sin invocar assign_delivery local", async () => {
      let capturedPatch: any = null;
      const rpcMock = jest.fn();

      const supabaseAdmin = {
        rpc: rpcMock,
        from: () => ({
          update: (patch: any) => {
            capturedPatch = patch;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "ord-1", ...patch },
                    error: null,
                  }),
                }),
              }),
            };
          },
        }),
      };

      const svc = buildOrdersService(supabaseAdmin);
      const res = await svc.markShipped("ord-1", {
        carrier: "Servientrega",
        trackingNumber: "2094819203",
        trackingUrl: "https://www.servientrega.com/rastreo/2094819203",
      });

      expect(capturedPatch).toMatchObject({
        status: "SHIPPED",
        shipping_carrier: "Servientrega",
        tracking_number: "2094819203",
        tracking_url: "https://www.servientrega.com/rastreo/2094819203",
      });
      expect(rpcMock).not.toHaveBeenCalled();
      expect(res.shipping_carrier).toBe("Servientrega");
    });

    it("create calcula subtotal_cop, discount_cop, IVA 19% incluido e IVA del envío", async () => {
      let insertedOrder: any = null;

      const supabaseAdmin = {
        from: (table: string) => {
          if (table === "product_variants") {
            return {
              select: () => ({
                in: async () => ({
                  data: [
                    {
                      id: "v-1",
                      size: "M",
                      color_name: "Negro",
                      stock: 10,
                      products: {
                        name: "Camisa Oxford",
                        price_cop: 119000,
                        currency: "COP",
                        drop_starts_at: null,
                        drop_ends_at: null,
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }
          if (table === "shipping_rates") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { cost_cop: 15000, free_above_cop: 600000 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "orders") {
            return {
              insert: (payload: any) => {
                insertedOrder = payload;
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: "ord-iva", ...payload },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          if (table === "order_items") {
            return {
              insert: async () => ({ error: null }),
            };
          }
          return {};
        },
      };

      const svc = buildOrdersService(supabaseAdmin);
      await svc.create("u-1", {
        items: [{ variantId: "v-1", quantity: 1 }],
        shippingAddress: {
          line1: "Calle 10 # 20-30",
          neighborhood: "El Poblado",
          city: "Medellín",
          department: "Antioquia",
          phone: "3001234567",
        },
        habeasDataAccepted: true,
      });

      // Precio con IVA 19% incluido = $119.000 -> IVA prenda = $19.000
      // Envío $15.000 -> IVA envío = $2.395. IVA total = $21.395.
      expect(insertedOrder.subtotal_cop).toBe(119000);
      expect(insertedOrder.discount_cop).toBe(0);
      expect(insertedOrder.tax_cop).toBe(21395);
      expect(insertedOrder.shipping_tax_cop).toBe(2395);
      expect(insertedOrder.taxable_base_cop).toBe(112605);
      expect(insertedOrder.total_cop).toBe(134000);
    });
  });
});
