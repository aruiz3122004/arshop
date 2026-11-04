import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

export const EMAIL_QUEUE = "email";
export const DELIVERY_DAY_QUEUE = "delivery-day";

export type EmailJob =
  | { type: "order-confirmation"; orderId: string }
  | { type: "order-refunded"; orderId: string }
  | { type: "account-welcome"; userId: string }
  | { type: "mfa-code"; email: string; code: string; expiresInMinutes: number }
  | { type: "delivery-day"; orderId: string }
  | { type: "order-unassigned"; orderId: string }
  | { type: "order-disputed"; orderId: string }
  | { type: "invoice-issued"; orderId: string }
  | { type: "back-in-stock"; userId: string; variantId: string };

export type DeliveryDayJob = { type: "scan" };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJob>,
    @InjectQueue(DELIVERY_DAY_QUEUE)
    private readonly deliveryDayQueue: Queue<DeliveryDayJob>,
  ) {}

  private async safeAdd(queue: Queue<any>, name: string, data: any, opts?: any): Promise<boolean> {
    try {
      await queue.add(name, data, opts);
      return true;
    } catch (err: any) {
      this.logger.warn(`No se pudo encolar '${name}': ${err?.message || "error de conexión"}`);
      return false;
    }
  }

  async enqueueDeliveryDayNotice(orderId: string) {
    await this.safeAdd(
      this.emailQueue,
      "delivery-day",
      { type: "delivery-day", orderId },
      { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
  }

  async enqueueOrderUnassigned(orderId: string) {
    await this.safeAdd(
      this.emailQueue,
      "order-unassigned",
      { type: "order-unassigned", orderId },
      { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
    );
  }

  async enqueueOrderDisputed(orderId: string) {
    await this.safeAdd(
      this.emailQueue,
      "order-disputed",
      { type: "order-disputed", orderId },
      { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
    );
  }

  /** Programa el cron diario de aviso de entrega (una sola vez). */
  async ensureDailyScan() {
    try {
      const name = "delivery-day-scan";
      const repeatables = await this.deliveryDayQueue.getRepeatableJobs();
      const exists = repeatables.find((j) => j.name === name);
      if (exists) return;

      await this.deliveryDayQueue.add(
        name,
        { type: "scan" },
        {
          repeat: { pattern: "0 0 * * *", tz: "America/Bogota" },
          removeOnComplete: true,
          removeOnFail: 10,
        },
      );
      this.logger.log("Cron delivery-day-scan registrado (00:00 America/Bogota).");
    } catch (err: any) {
      this.logger.warn(`No se pudo programar cron diario: ${err?.message}`);
    }
  }

  async enqueueOrderConfirmation(orderId: string) {
    // jobId idempotente: si Stripe reenvía el webhook (hasta 3 días), BullMQ
    // rechaza el duplicado y no se envía el correo dos veces.
    const ok = await this.safeAdd(
      this.emailQueue,
      "order-confirmation",
      { type: "order-confirmation", orderId },
      {
        jobId: `order-confirmation:${orderId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
    if (ok) this.logger.log(`Queued order-confirmation for ${orderId}`);
  }

  async enqueueInvoiceIssued(orderId: string) {
    const ok = await this.safeAdd(
      this.emailQueue,
      "invoice-issued",
      { type: "invoice-issued", orderId },
      {
        jobId: `invoice-issued:${orderId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
    if (ok) this.logger.log(`Queued invoice-issued for ${orderId}`);
  }

  async enqueueOrderRefunded(orderId: string) {
    const ok = await this.safeAdd(
      this.emailQueue,
      "order-refunded",
      { type: "order-refunded", orderId },
      {
        jobId: `order-refunded:${orderId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
    if (ok) this.logger.log(`Queued order-refunded for ${orderId}`);
  }

  async enqueueBackInStock(userId: string, variantId: string) {
    // Idempotencia por job id: evita duplicados si notifySubscribers se
    // dispara varias veces para la misma reposición.
    await this.safeAdd(
      this.emailQueue,
      "back-in-stock",
      { type: "back-in-stock", userId, variantId },
      {
        jobId: `back-in-stock:${userId}:${variantId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  async enqueueWelcome(userId: string) {
    await this.safeAdd(
      this.emailQueue,
      "account-welcome",
      { type: "account-welcome", userId },
      { attempts: 3, backoff: { type: "exponential", delay: 2_000 } },
    );
  }

  /**
   * Envía por correo un código 2FA de respaldo. Prioridad alta y reintentos
   * rápidos porque el usuario está esperando en la pantalla de login.
   */
  async enqueueMfaCode(email: string, code: string, expiresInMinutes: number) {
    await this.safeAdd(
      this.emailQueue,
      "mfa-code",
      { type: "mfa-code", email, code, expiresInMinutes },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 50,
        removeOnFail: 20,
        priority: 1,
      },
    );
  }
}
