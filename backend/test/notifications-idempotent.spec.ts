import "reflect-metadata";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

/**
 * Garantiza que los jobs encolados tras un `payment_intent.succeeded` llevan
 * `jobId` idempotente. Un replay del webhook de Stripe (ocurre hasta 3 días
 * si nuestra respuesta no fue 2xx) **no** debe generar un segundo correo al
 * cliente. BullMQ dedup por `jobId`, pero si olvidamos poner `jobId`, el
 * segundo add crea un job nuevo con id aleatorio y el cliente recibe dos
 * correos.
 */

function makeService() {
  const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const deliveryDayQueue = {
    add: jest.fn(),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
  };
  const moduleRef = { get: jest.fn() };
  const svc = new NotificationsService(
    emailQueue as any,
    deliveryDayQueue as any,
    moduleRef as any,
  );
  return { svc, emailQueue, deliveryDayQueue, moduleRef };
}

describe("NotificationsService idempotencia", () => {
  // En producción se usa BullMQ; en desarrollo/test el servicio envía directo
  // por Resend. Estos tests validan las opciones de encolado, así que forzamos
  // el camino de producción.
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = "production";
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("order-confirmation usa jobId determinista (replay-safe)", async () => {
    const { svc, emailQueue } = makeService();
    await svc.enqueueOrderConfirmation("order-123");
    const opts = emailQueue.add.mock.calls[0][2];
    expect(opts.jobId).toBe("order-confirmation:order-123");
  });

  it("order-refunded usa jobId determinista", async () => {
    const { svc, emailQueue } = makeService();
    await svc.enqueueOrderRefunded("order-123");
    const opts = emailQueue.add.mock.calls[0][2];
    expect(opts.jobId).toBe("order-refunded:order-123");
  });

  it("back-in-stock usa jobId por (userId, variantId)", async () => {
    const { svc, emailQueue } = makeService();
    await svc.enqueueBackInStock("user-1", "variant-9");
    const opts = emailQueue.add.mock.calls[0][2];
    expect(opts.jobId).toBe("back-in-stock:user-1:variant-9");
  });

  it("mfa-code NO lleva jobId (cada login genera un código nuevo)", async () => {
    const { svc, emailQueue } = makeService();
    await svc.enqueueMfaCode("a@b.co", "123456", 15);
    const opts = emailQueue.add.mock.calls[0][2];
    expect(opts.jobId).toBeUndefined();
    expect(opts.priority).toBe(1); // alta prioridad porque usuario espera
  });
});
