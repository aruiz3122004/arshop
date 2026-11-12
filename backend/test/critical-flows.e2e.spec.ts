import "reflect-metadata";
import {
  BadRequestException,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AuthController } from "../src/modules/auth/auth.controller";
import { AuthService } from "../src/modules/auth/auth.service";
import { OrdersController } from "../src/modules/orders/orders.controller";
import { OrdersService } from "../src/modules/orders/orders.service";
import { PaymentsController } from "../src/modules/payments/payments.controller";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { DeliveryController } from "../src/modules/delivery/delivery.controller";
import { DeliveryService } from "../src/modules/delivery/delivery.service";
import { InventoryService } from "../src/modules/inventory/inventory.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { AuditLogsService } from "../src/modules/audit-logs/audit-logs.service";
import { InvoicingService } from "../src/modules/invoicing/invoicing.service";
import { RedisService } from "../src/redis/redis.service";
import { SupabaseService } from "../src/supabase/supabase.service";
import { ConfigService } from "@nestjs/config";
import { LoggingInterceptor } from "../src/common/interceptors/logging.interceptor";
import { PinoJsonLogger } from "../src/common/logger/pino-json.logger";

/**
 * Guard de prueba para E2E: inyecta `req.user` según el header `x-test-role`
 * o la cookie `arshop_access_token` seteada en `/auth/sign-in`.
 */
@Injectable()
class E2eAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const roleHeader = (req.headers["x-test-role"] as string) || "CUSTOMER";
    const userIdHeader = (req.headers["x-test-user-id"] as string) || "user-e2e-1";
    req.user = {
      id: userIdHeader,
      email: "cliente.e2e@arshop.co",
      role: roleHeader,
    };
    return true;
  }
}

describe("E2E Críticos (Supertest): Signup → Order → Payment → Delivery → RMA", () => {
  let app: NestExpressApplication;

  // Estado compartido simulado en memoria para el flujo E2E completo
  const memoryStore = new Map<string, string>();
  let orderState: any = null;
  let createOrderCalls = 0;

  const mockAuthService = {
    signUp: jest.fn(async (dto: { email: string; fullName?: string }) => ({
      id: "user-e2e-1",
      email: dto.email,
    })),
    signIn: jest.fn(async (dto: { email: string }) => ({
      accessToken: "jwt-access-token-e2e",
      refreshToken: "jwt-refresh-token-e2e",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-e2e-1", email: dto.email },
    })),
  };

  const mockOrdersService = {
    validateCoupon: jest.fn(async (code: string, subtotalCop: number) => ({
      code: code.toUpperCase(),
      discountType: "PERCENT",
      discountValue: 10,
      minSubtotalCop: 100000,
      discountCop: Math.round(subtotalCop * 0.1),
    })),
    create: jest.fn(async (userId: string, dto: any) => {
      createOrderCalls++;
      const subtotalCop = 200000;
      const discountCop = dto.couponCode ? 20000 : 0;
      const netCop = subtotalCop - discountCop;
      const taxCop = netCop - Math.round(netCop / 1.19);
      orderState = {
        id: "550e8400-e29b-41d4-a716-446655440099",
        user_id: userId,
        status: "PENDING_PAYMENT",
        subtotal_cop: subtotalCop,
        discount_cop: discountCop,
        coupon_code: dto.couponCode ?? null,
        tax_cop: taxCop,
        shipping_cost_cop: 15000,
        total_cop: netCop + 15000,
        qr_consumed_at: null,
        items: dto.items.map((it: any) => ({
          product_variant_id: it.variantId,
          quantity: it.quantity,
        })),
      };
      return orderState;
    }),
    findByStripeIntent: jest.fn(async () => orderState),
    issueQr: jest.fn(async () => ({
      consumed: false,
      token: "signed-qr-jwt-token",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      clientCode: "4829",
    })),
    requestReturn: jest.fn(async (userId: string, orderId: string, dto: any) => {
      if (!orderState || orderState.status !== "DELIVERED") {
        throw new BadRequestException(
          "Solo puedes solicitar cambios o devoluciones sobre pedidos entregados",
        );
      }
      return {
        id: "ret-e2e-1",
        order_id: orderId,
        user_id: userId,
        type: dto.type,
        status: "REQUESTED",
        reason: dto.reason,
        requested_size: dto.requestedSize ?? null,
      };
    }),
  };

  const mockPaymentsService = {
    createIntentForOrder: jest.fn(async (orderId: string, _userId: string, currency: string) => ({
      clientSecret: "pi_e2e_secret_123",
      intentId: "pi_e2e_123",
      amount: orderState?.total_cop ?? 195000,
      currency: currency.toLowerCase(),
    })),
    constructEvent: jest.fn((_raw: Buffer, sig: string) => {
      if (sig !== "valid_stripe_sig") {
        throw new Error("Invalid signature");
      }
      return {
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_e2e_123" } },
      };
    }),
    handleEvent: jest.fn(async () => {
      if (!orderState || orderState.status !== "PENDING_PAYMENT") return false;
      orderState.status = "PAID";
      orderState.delivery_status = "ASSIGNED";
      return true;
    }),
  };

  const mockInventoryService = {
    confirmReservation: jest.fn().mockResolvedValue(undefined),
    releaseReservation: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    enqueueOrderConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const mockDeliveryService = {
    scanQr: jest.fn(async (_userId: string, dto: { token: string }) => {
      if (dto.token !== "signed-qr-jwt-token") {
        throw new BadRequestException("QR inválido");
      }
      orderState.qr_consumed_at = new Date().toISOString();
      return {
        ok: true,
        orderId: orderState.id,
        needsReceiverData: true,
        prefill: null,
      };
    }),
    confirmDelivery: jest.fn(
      async (
        _userId: string,
        orderId: string,
        receiverName: string,
        documentType: string,
        documentNumber: string,
        source: "qr" | "manual",
      ) => {
        if (!orderState?.qr_consumed_at) {
          throw new BadRequestException(
            "Para confirmar la entrega debes escanear primero el código QR del cliente o verificar su código de 4 dígitos.",
          );
        }
        orderState.status = "DELIVERED";
        orderState.delivered_at = new Date().toISOString();
        return {
          ...orderState,
          id: orderId,
          recibido: { receiverName, documentType, documentNumber, source },
        };
      },
    ),
  };

  const mockRedisService = {
    setNx: jest.fn(async (key: string, val: string) => {
      if (memoryStore.has(key)) return false;
      memoryStore.set(key, val);
      return true;
    }),
    get: jest.fn(async (key: string) => memoryStore.get(key) ?? null),
    set: jest.fn(async (key: string, val: string) => {
      memoryStore.set(key, val);
    }),
    del: jest.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        OrdersController,
        PaymentsController,
        DeliveryController,
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: DeliveryService, useValue: mockDeliveryService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AuditLogsService, useValue: { record: jest.fn() } },
        {
          provide: InvoicingService,
          useValue: {
            issueForOrder: jest.fn().mockResolvedValue(null),
            createCreditNoteForOrder: jest.fn().mockResolvedValue(null),
            findForOrder: jest.fn().mockResolvedValue(null),
            findForOrders: jest.fn().mockResolvedValue(new Map()),
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SupabaseService, useValue: { admin: {} } },
        { provide: ConfigService, useValue: { get: () => "test" } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    app.useLogger(new PinoJsonLogger());
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new LoggingInterceptor());
    app.useGlobalGuards(new E2eAuthGuard());

    // Middleware ligero para simular rawBody en supertest cuando la ruta es /payments/webhook
    app.use("/payments/webhook", (req: any, _res: any, next: () => void) => {
      if (!req.rawBody) {
        req.rawBody = Buffer.from(JSON.stringify(req.body ?? {}));
      }
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("1. E2E Signup & Sign-in → Cupón → Checkout Idempotente (POST /orders)", async () => {
    // 1.1 Registro de usuario
    const signupRes = await request(app.getHttpServer())
      .post("/auth/sign-up")
      .send({
        email: "cliente.e2e@arshop.co",
        password: "PasswordSegura123!",
        fullName: "Cliente E2E",
      })
      .expect(201);

    expect(signupRes.body.email).toBe("cliente.e2e@arshop.co");
    expect(signupRes.headers["x-request-id"]).toBeDefined();

    // 1.2 Inicio de sesión (verifica cookies httpOnly)
    const loginRes = await request(app.getHttpServer())
      .post("/auth/sign-in")
      .send({
        email: "cliente.e2e@arshop.co",
        password: "PasswordSegura123!",
      })
      .expect(200);

    const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
    expect(setCookies.some((c) => c.includes("arshop_access_token="))).toBe(true);
    expect(setCookies.some((c) => c.includes("HttpOnly"))).toBe(true);

    // 1.3 Validar cupón BIENVENIDO10
    const couponRes = await request(app.getHttpServer())
      .post("/orders/validate-coupon")
      .send({ code: "BIENVENIDO10", subtotalCop: 200000 })
      .expect(201);

    expect(couponRes.body.discountCop).toBe(20000);

    // 1.4 Crear orden con Idempotency-Key y verificar deduplicación ante retry
    const idemKey = "idem_e2e_checkout_key_0001";
    const orderPayload = {
      items: [
        {
          variantId: "550e8400-e29b-41d4-a716-446655440000",
          quantity: 1,
        },
      ],
      shippingAddress: {
        line1: "Carrera 11 # 82-71",
        neighborhood: "Zona T",
        city: "Bogotá",
        department: "Cundinamarca",
        phone: "3001234567",
      },
      habeasDataAccepted: true,
      couponCode: "BIENVENIDO10",
    };

    const orderRes1 = await request(app.getHttpServer())
      .post("/orders")
      .set("Idempotency-Key", idemKey)
      .send(orderPayload)
      .expect(201);

    const orderRes2 = await request(app.getHttpServer())
      .post("/orders")
      .set("Idempotency-Key", idemKey)
      .send(orderPayload)
      .expect(201);

    expect(orderRes1.body.id).toBe(orderRes2.body.id);
    expect(orderRes1.body.discount_cop).toBe(20000);
    expect(orderRes1.body.total_cop).toBe(195000);
    // El segundo POST con la misma Idempotency-Key NO vuelve a ejecutar OrdersService.create
    expect(createOrderCalls).toBe(1);
  });

  it("2. E2E PaymentIntent → Webhook Stripe HMAC → Confirmación de Stock y transición a PAID", async () => {
    // 2.1 Crear PaymentIntent
    const intentRes = await request(app.getHttpServer())
      .post("/payments/intent")
      .send({ orderId: orderState.id, currency: "COP" })
      .expect(201);

    expect(intentRes.body.clientSecret).toBe("pi_e2e_secret_123");

    // 2.2 Webhook con firma inválida debe ser rechazado con 400
    await request(app.getHttpServer())
      .post("/payments/webhook")
      .set("stripe-signature", "bad_sig")
      .send({ type: "payment_intent.succeeded" })
      .expect(400);

    // 2.3 Webhook con firma válida transiciona la orden a PAID, confirma stock y encola email
    await request(app.getHttpServer())
      .post("/payments/webhook")
      .set("stripe-signature", "valid_stripe_sig")
      .send({ type: "payment_intent.succeeded" })
      .expect(200);

    expect(orderState.status).toBe("PAID");
    expect(mockInventoryService.confirmReservation).toHaveBeenCalledWith(
      orderState.id,
      ["550e8400-e29b-41d4-a716-446655440000"],
    );
    expect(mockNotificationsService.enqueueOrderConfirmation).toHaveBeenCalledWith(
      orderState.id,
    );
  });

  it("3. E2E Delivery Antifraude (QR) → Entrega Confirmada → Solicitud RMA Ley 1480", async () => {
    // 3.1 Cliente obtiene su QR firmado
    const qrRes = await request(app.getHttpServer())
      .get(`/orders/${orderState.id}/qr`)
      .expect(200);

    expect(qrRes.body.token).toBe("signed-qr-jwt-token");

    // 3.2 Intento del repartidor de confirmar entrega manual SIN haber escaneado el QR -> 400
    await request(app.getHttpServer())
      .post(`/delivery/confirm/${orderState.id}`)
      .set("x-test-role", "REPARTIDOR")
      .send({
        receiverName: "Cliente E2E",
        documentType: "CC",
        documentNumber: "1020304050",
        source: "manual",
      })
      .expect(400);

    // 3.3 Repartidor escanea el QR firmado -> consume el QR
    await request(app.getHttpServer())
      .post("/delivery/scan-qr")
      .set("x-test-role", "REPARTIDOR")
      .send({ token: qrRes.body.token })
      .expect(201);

    // 3.4 Repartidor registra datos del receptor y cierra la entrega -> DELIVERED
    const confirmRes = await request(app.getHttpServer())
      .post(`/delivery/confirm/${orderState.id}`)
      .set("x-test-role", "REPARTIDOR")
      .send({
        receiverName: "Cliente E2E",
        documentType: "CC",
        documentNumber: "1020304050",
        source: "qr",
      })
      .expect(201);

    expect(confirmRes.body.status).toBe("DELIVERED");

    // 3.5 Cliente solicita cambio de talla dentro de los 5 días hábiles (Ley 1480 Art. 47)
    const rmaRes = await request(app.getHttpServer())
      .post(`/orders/${orderState.id}/returns`)
      .send({
        type: "SIZE_EXCHANGE",
        reason: "Deseo cambiar de talla M a talla L",
        requestedSize: "L",
      })
      .expect(201);

    expect(rmaRes.body.status).toBe("REQUESTED");
    expect(rmaRes.body.requested_size).toBe("L");
  });
});
