import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { Job } from "bullmq";
import { EMAIL_QUEUE, type EmailJob } from "../notifications.service";
import { SupabaseService } from "../../../supabase/supabase.service";
import { orderConfirmationHtml } from "../templates/order-confirmation";
import { orderRefundedHtml } from "../templates/order-refunded";
import { mfaCodeHtml } from "../templates/mfa-code";
import { deliveryDayHtml } from "../templates/delivery-day";
import { orderUnassignedHtml } from "../templates/order-unassigned";
import { orderDisputedHtml } from "../templates/order-disputed";
import { backInStockHtml } from "../templates/back-in-stock";
import { invoiceIssuedHtml } from "../templates/invoice-issued";
import { GuestTokenService } from "../../guest/guest-token.service";

@Processor(EMAIL_QUEUE, { autorun: process.env.NODE_ENV === "production" })
export class EmailProcessor extends WorkerHost {
  private _lastErrLog = 0;

  onApplicationBootstrap() {
    this.worker?.on("error", (err: any) => {
      const now = Date.now();
      if (now - this._lastErrLog > 60_000) {
        this._lastErrLog = now;
        this.logger.warn(`EmailProcessor: esperando disponibilidad de Redis (${err.message})`);
      }
    });
  }
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly sandboxTo: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly guestToken: GuestTokenService,
  ) {
    super();
    this.resend = new Resend(config.getOrThrow<string>("RESEND_API_KEY"));
    this.from = config.getOrThrow<string>("RESEND_FROM");
    this.sandboxTo = config.get<string>("RESEND_SANDBOX_TO") || undefined;
    if (this.sandboxTo) {
      this.logger.warn(
        `Resend en modo sandbox: todos los correos se redirigen a ${this.sandboxTo}`,
      );
    }
  }

  /**
   * Resuelve el destinatario real respetando el modo sandbox: si está
   * configurado, todo correo se redirige al email definido en
   * `RESEND_SANDBOX_TO` (para no spamear clientes mientras no hay
   * dominio verificado en Resend).
   */
  private resolveTo(originalTo: string): string {
    return this.sandboxTo ?? originalTo;
  }

  /**
   * Email del comprador de una orden: `guest_email` para invitados y la
   * cuenta de Supabase para usuarios registrados. Devuelve null si no hay
   * ninguno (no debe romper el job).
   */
  private async resolveOrderEmail(order: {
    user_id: string | null;
    guest_email?: string | null;
  }): Promise<string | null> {
    if (order.guest_email) return order.guest_email;
    if (!order.user_id) return null;
    const { data } = await this.supabase.admin.auth.admin.getUserById(
      order.user_id,
    );
    return data?.user?.email ?? null;
  }

  async process(job: Job<EmailJob>): Promise<void> {
    const data = job.data;
    this.logger.log(`Processing ${data.type}`);
    switch (data.type) {
      case "order-confirmation":
        await this.sendOrderConfirmation(data.orderId);
        break;
      case "order-refunded":
        await this.sendOrderRefunded(data.orderId);
        break;
      case "account-welcome":
        await this.sendWelcome(data.userId);
        break;
      case "mfa-code":
        await this.sendMfaCode(data.email, data.code, data.expiresInMinutes);
        break;
      case "delivery-day":
        await this.sendDeliveryDay(data.orderId);
        break;
      case "order-unassigned":
        await this.sendOrderUnassigned(data.orderId);
        break;
      case "order-disputed":
        await this.sendOrderDisputed(data.orderId);
        break;
      case "back-in-stock":
        await this.sendBackInStock(data.userId, data.variantId);
        break;
      case "invoice-issued":
        await this.sendInvoiceIssued(data.orderId);
        break;
    }
  }

  private async sendBackInStock(userId: string, variantId: string) {
    const [{ data: profile }, { data: variant }] = await Promise.all([
      this.supabase.admin
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle(),
      this.supabase.admin
        .from("product_variants")
        .select("size, color_name, products(name, slug)")
        .eq("id", variantId)
        .maybeSingle(),
    ]);
    if (!profile?.email || !variant) return;

    const prod = Array.isArray(variant.products)
      ? variant.products[0]
      : variant.products;
    if (!prod) return;

    const siteUrl =
      this.config.get<string>("WEB_URL") ?? "https://arshop.co";

    await this.resend.emails.send({
      from: this.from,
      to: this.resolveTo(profile.email),
      subject: `De vuelta: ${prod.name}`,
      html: backInStockHtml({
        productName: prod.name,
        productSlug: prod.slug,
        size: variant.size,
        colorName: variant.color_name,
        siteUrl,
      }),
    });
    this.logger.log(`back-in-stock enviado a user ${userId} para variant ${variantId}`);
  }

  private async sendOrderDisputed(orderId: string) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, user_id, guest_email, delivery_id, shipping_city, shipping_department, delivery_dispute_reason",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const { data: admins } = await this.supabase.admin
      .from("profiles")
      .select("email")
      .eq("role", "ADMIN")
      .eq("blocked", false);

    const adminEmails = (admins ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    if (adminEmails.length === 0) {
      this.logger.warn(`order-disputed ${orderId}: no hay admins activos`);
      return;
    }

    const customerEmail = await this.resolveOrderEmail(order);

    let deliveryName: string | null = null;
    if (order.delivery_id) {
      const { data: dom } = await this.supabase.admin
        .from("domiciliarios")
        .select("nombre_completo")
        .eq("id", order.delivery_id)
        .maybeSingle();
      deliveryName = dom?.nombre_completo ?? null;
    }

    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";

    for (const email of adminEmails) {
      const to = this.resolveTo(email);
      const subject = this.sandboxTo
        ? `[Sandbox → ${email}] ⚠ Disputa de entrega #${orderId.slice(0, 8)}`
        : `⚠ Disputa de entrega #${orderId.slice(0, 8)}`;
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html: orderDisputedHtml({
          orderId,
          city: order.shipping_city,
          department: order.shipping_department,
          customerEmail,
          deliveryName,
          reason: order.delivery_dispute_reason,
          appUrl,
        }),
      });
    }
    this.logger.log(`order-disputed alertado a ${adminEmails.length} admin(s)`);
  }

  private async sendOrderUnassigned(orderId: string) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email, shipping_city, shipping_department")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    // Buscar emails de todos los admins
    const { data: admins } = await this.supabase.admin
      .from("profiles")
      .select("email")
      .eq("role", "ADMIN")
      .eq("blocked", false);

    const adminEmails = (admins ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    if (adminEmails.length === 0) {
      this.logger.warn(`order-unassigned ${orderId}: no hay admins activos`);
      return;
    }

    const customerEmail = await this.resolveOrderEmail(order);
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";

    for (const email of adminEmails) {
      const to = this.resolveTo(email);
      const subject = this.sandboxTo
        ? `[Sandbox → ${email}] ⚠ Pedido sin domiciliario #${orderId.slice(0, 8)}`
        : `⚠ Pedido sin domiciliario #${orderId.slice(0, 8)}`;
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html: orderUnassignedHtml({
          orderId,
          city: order.shipping_city,
          department: order.shipping_department,
          customerEmail,
          appUrl,
        }),
      });
    }
    this.logger.log(`order-unassigned alertado a ${adminEmails.length} admin(s)`);
  }

  private async sendDeliveryDay(orderId: string) {
    const { data: order, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email, shipping_city")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) return;
    const email = await this.resolveOrderEmail(order);
    if (!email) return;
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const to = this.resolveTo(email);
    const subject = this.sandboxTo
      ? `[Sandbox → ${email}] Tu pedido llega hoy — ARShop`
      : "Tu pedido llega hoy — ARShop";
    await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: deliveryDayHtml({ orderId, city: order.shipping_city, appUrl }),
    });
    this.logger.log(`delivery-day email → ${to}`);
  }

  private async sendMfaCode(
    originalEmail: string,
    code: string,
    expiresInMinutes: number,
  ) {
    const to = this.resolveTo(originalEmail);
    const subject = this.sandboxTo
      ? `[Sandbox → ${originalEmail}] Tu código ARShop: ${code}`
      : `Tu código ARShop: ${code}`;

    const { error: sendErr } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: mfaCodeHtml({ code, minutes: expiresInMinutes }),
    });
    if (sendErr) throw new Error(sendErr.message);

    this.logger.log(
      this.sandboxTo
        ? `MFA code redirected to sandbox ${to} (original: ${originalEmail})`
        : `MFA code sent to ${originalEmail}`,
    );
  }

  private async sendOrderConfirmation(orderId: string) {
    const { data: order, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email, is_guest, total_cop, shipping_city, shipping_department, items:order_items(product_name_snapshot, variant_label, quantity, unit_price_cop)")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) throw error ?? new Error("Order not found");

    const email = await this.resolveOrderEmail(order);
    if (!email) throw new Error(`Order email missing for ${order.id}`);

    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    // El invitado sigue su pedido con un enlace firmado; el usuario lo ve en
    // su cuenta, así que no le mandamos un token innecesario.
    const trackingUrl = order.is_guest
      ? `${appUrl}/pedido/${this.guestToken.issue(order.id)}`
      : null;

    const html = orderConfirmationHtml({
      id: order.id,
      total_cop: order.total_cop,
      shipping_city: order.shipping_city,
      shipping_department: order.shipping_department,
      items: order.items ?? [],
      trackingUrl,
    });

    const to = this.resolveTo(email);
    const subject = this.sandboxTo
      ? `[Sandbox → ${email}] Pedido confirmado #${order.id.slice(0, 8)} — ARShop`
      : `Pedido confirmado #${order.id.slice(0, 8)} — ARShop`;

    const { error: sendErr } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (sendErr) throw new Error(sendErr.message);

    this.logger.log(
      this.sandboxTo
        ? `Order confirmation redirected to sandbox ${to} (original: ${email})`
        : `Order confirmation sent to ${email}`,
    );
  }

  private async sendInvoiceIssued(orderId: string) {
    const { data: invoice, error } = await this.supabase.admin
      .from("invoices")
      .select("full_number, cufe, total_cop, buyer_snapshot")
      .eq("order_id", orderId)
      .eq("status", "ISSUED")
      .maybeSingle();
    if (error || !invoice) return;

    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const email = await this.resolveOrderEmail(order);
    if (!email) return;

    const buyer = (invoice.buyer_snapshot ?? {}) as { legal_name?: string };
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const to = this.resolveTo(email);
    const subject = this.sandboxTo
      ? `[Sandbox → ${email}] Factura electrónica ${invoice.full_number ?? ""} — ARShop`
      : `Factura electrónica ${invoice.full_number ?? ""} — ARShop`;

    const { error: sendErr } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: invoiceIssuedHtml({
        orderId,
        fullNumber: invoice.full_number,
        cufe: invoice.cufe,
        totalCop: Number(invoice.total_cop),
        legalName: buyer.legal_name ?? "cliente ARShop",
        appUrl,
      }),
    });
    if (sendErr) throw new Error(sendErr.message);
    this.logger.log(`invoice-issued enviado a ${to}`);
  }

  private async sendOrderRefunded(orderId: string) {
    const { data: order, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email, total_cop")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) throw error ?? new Error("Order not found");

    const email = await this.resolveOrderEmail(order);
    if (!email) throw new Error(`Order email missing for ${order.id}`);

    const html = orderRefundedHtml({ id: order.id, total_cop: order.total_cop });
    const to = this.resolveTo(email);
    const subject = this.sandboxTo
      ? `[Sandbox → ${email}] Reembolso procesado #${order.id.slice(0, 8)} — ARShop`
      : `Reembolso procesado #${order.id.slice(0, 8)} — ARShop`;

    const { error: sendErr } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (sendErr) throw new Error(sendErr.message);
  }

  private async sendWelcome(userId: string) {
    const { data } = await this.supabase.admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) return;
    const to = this.resolveTo(email);
    const subject = this.sandboxTo
      ? `[Sandbox → ${email}] Bienvenido a ARShop`
      : "Bienvenido a ARShop";
    await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: `<p>Hola, gracias por unirte a ARShop.</p>`,
    });
  }
}
