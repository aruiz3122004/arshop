import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { OrdersService } from "../orders/orders.service";
import { SupabaseService } from "../../supabase/supabase.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly currency: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly supabase: SupabaseService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {
    this.stripe = new Stripe(config.getOrThrow<string>("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-11-20.acacia" as unknown as Stripe.StripeConfig["apiVersion"],
    });
    this.currency = config.getOrThrow<string>("STRIPE_CURRENCY");
    this.webhookSecret = config.getOrThrow<string>("STRIPE_WEBHOOK_SECRET");
  }

  /**
   * Obtiene o crea un Customer en Stripe y lo persiste en `profiles.stripe_customer_id`.
   * La tarjeta y datos bancarios viven 100% en los servidores de Stripe (PCI-DSS Nivel 1);
   * nosotros solo guardamos el ID del Customer para no duplicarlo entre pagos.
   */
  async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const { data: profile, error } = await this.supabase.admin
      .from("profiles")
      .select("email, full_name, stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    if (profile?.stripe_customer_id) return profile.stripe_customer_id;

    // Fallback por si el trigger aún no copió el email a profiles (perfil muy antiguo).
    let email = profile?.email ?? undefined;
    if (!email) {
      const { data: authData } =
        await this.supabase.admin.auth.admin.getUserById(userId);
      email = authData?.user?.email ?? undefined;
    }

    const customer = await this.stripe.customers.create({
      email,
      name: profile?.full_name || undefined,
      metadata: { userId },
    });

    const { error: upErr } = await this.supabase.admin
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", userId);
    if (upErr) {
      this.logger.error(
        `No se pudo persistir stripe_customer_id en profiles (${userId}): ${upErr.message}`,
      );
    }

    this.logger.log(`Stripe Customer ${customer.id} creado para user ${userId}`);
    return customer.id;
  }

  /**
   * Convierte total_cop al importe y moneda elegidos por el usuario.
   * COP es zero-decimal en Stripe; USD/EUR usan 100 minor units por unidad.
   */
  private async resolveStripeAmount(
    totalCop: number,
    requestedCurrency: string,
  ): Promise<{ amount: number; currency: string }> {
    const cur = requestedCurrency.toUpperCase();
    if (cur === "COP") {
      return { amount: Math.round(totalCop), currency: "cop" };
    }
    const rates = await this.exchangeRates.getRates();
    const rate = cur === "USD" ? rates.USD : rates.EUR;
    const converted = totalCop * rate;
    return { amount: Math.round(converted * 100), currency: cur.toLowerCase() };
  }

  /**
   * Crea un PaymentIntent para una orden con soporte de tarjetas guardadas en Stripe.
   * Genera también CustomerSession para que Stripe Elements muestre y recuerde métodos de pago.
   * @param requestedCurrency - "COP" | "USD" | "EUR" (default "COP")
   */
  async createIntentForOrder(orderId: string, userId: string, requestedCurrency = "COP") {
    const order = await this.orders.findByIdForUser(orderId, userId);
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "PENDING_PAYMENT") {
      throw new Error(`Order ${orderId} is not pending payment`);
    }

    // Si ya hay un PaymentIntent abierto para esta orden (el usuario abandonó
    // el checkout y volvió, cambió de moneda, etc.), lo cancelamos antes de
    // crear uno nuevo. Sin esto, el anterior queda huérfano en Stripe
    // consumiendo cuota y ensuciando reportes financieros.
    if (order.stripe_payment_intent_id) {
      try {
        const prev = await this.stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
        );
        if (
          prev.status === "requires_payment_method" ||
          prev.status === "requires_confirmation" ||
          prev.status === "requires_action"
        ) {
          await this.stripe.paymentIntents.cancel(prev.id);
          this.logger.log(
            `Stripe PI ${prev.id} cancelado antes de crear uno nuevo para order ${orderId}`,
          );
        }
      } catch (err) {
        // No bloqueamos la creación del nuevo PI por un cleanup fallido.
        this.logger.warn(
          `No se pudo cancelar PI previo ${order.stripe_payment_intent_id}: ${(err as Error).message}`,
        );
      }
    }

    const customerId = await this.getOrCreateStripeCustomer(userId);

    // Customer Session: permite a Stripe Elements mostrar tarjetas guardadas del cliente de forma segura
    let customerSessionClientSecret: string | undefined;
    try {
      const cs = await this.stripe.customerSessions.create({
        customer: customerId,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_save: "enabled",
              payment_method_redisplay: "enabled",
              payment_method_remove: "enabled",
            },
          },
        },
      });
      customerSessionClientSecret = cs.client_secret;
    } catch (csErr) {
      this.logger.warn(`customerSessions.create: ${(csErr as Error).message}`);
    }

    const { amount, currency } = await this.resolveStripeAmount(
      order.total_cop,
      requestedCurrency,
    );

    const intent = await this.stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      setup_future_usage: "off_session",
      metadata: {
        order_id: order.id,
        user_id: userId,
        charge_currency: currency.toUpperCase(),
      },
      automatic_payment_methods: { enabled: true },
    });

    await this.orders.attachStripeIntent(order.id, intent.id);
    await this.orders.setChargeCurrency(order.id, currency.toUpperCase());

    return {
      clientSecret: intent.client_secret,
      customerSessionClientSecret,
      intentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
    };
  }

  /** Verifica la firma del webhook y devuelve el evento parseado. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  /** Routing de eventos entrantes. Debe ser idempotente; devuelve true si transicionó estado. */
  async handleEvent(event: Stripe.Event): Promise<boolean> {
    this.logger.log(`Stripe event: ${event.type}`);
    switch (event.type) {
      case "payment_intent.succeeded":
        return this.onIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      case "payment_intent.payment_failed":
        return this.onIntentFailed(event.data.object as Stripe.PaymentIntent);
      default:
        this.logger.debug(`Unhandled event: ${event.type}`);
        return false;
    }
  }

  private async onIntentSucceeded(intent: Stripe.PaymentIntent): Promise<boolean> {
    const order = await this.orders.findByStripeIntent(intent.id);
    if (!order || order.status !== "PENDING_PAYMENT") return false; // idempotente
    await this.orders.updateStatus(order.id, "PAID");
    this.logger.log(`Order ${order.id} marked PAID`);
    // NOTA: la coordinación con InventoryService + NotificationsService
    // se hace en PaymentsController tras llamar a handleEvent, para no
    // crear dependencia circular entre módulos.
    return true;
  }

  private async onIntentFailed(intent: Stripe.PaymentIntent): Promise<boolean> {
    const order = await this.orders.findByStripeIntent(intent.id);
    if (!order || order.status !== "PENDING_PAYMENT") return false;
    this.logger.warn(`Payment failed for order ${order.id}: ${intent.last_payment_error?.message ?? "unknown"}`);
    await this.orders.updateStatus(order.id, "CANCELLED");
    return true;
  }

  /**
   * Emite el reembolso total en Stripe y cancela la orden.
   * Devuelve la orden actualizada; el controlador desencadena
   * la reposición de stock y el email de confirmación.
   */
  async refundOrder(orderId: string) {
    const order = await this.orders.findByIdWithItems(orderId);
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (!["PAID", "SHIPPED", "DELIVERED"].includes(order.status)) {
      throw new BadRequestException(
        `Solo se pueden reembolsar órdenes PAID, SHIPPED o DELIVERED (estado actual: ${order.status})`,
      );
    }

    if (order.stripe_payment_intent_id) {
      try {
        await this.stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
        });
        this.logger.log(
          `Stripe refund creado para order ${orderId} (PI ${order.stripe_payment_intent_id})`,
        );
      } catch (err) {
        this.logger.error(
          `Stripe refund falló para ${orderId}: ${(err as Error).message}`,
        );
        throw err;
      }
    } else {
      this.logger.warn(
        `Order ${orderId} sin stripe_payment_intent_id; se cancela sin reembolso en Stripe`,
      );
    }

    return this.orders.updateStatus(orderId, "CANCELLED");
  }
}
