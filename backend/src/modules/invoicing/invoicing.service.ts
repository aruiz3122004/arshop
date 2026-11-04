import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import {
  InvoiceRepresentationService,
  type InvoiceRepresentationInput,
} from "./invoice-representation.service";
import {
  buildCreditNoteXml,
  buildInvoiceArtifacts,
  buildQrDataUrl,
  dianQrUrl,
} from "./invoice-xml.builder";
import {
  DianFreeProvider,
  DianOwnProvider,
  FactusProvider,
  SimulatedDianProvider,
} from "./providers/dian.providers";
import type { CreateCreditNoteDto, MarkInvoiceIssuedDto } from "./dto/invoice-actions.dto";
import type { UpdateFiscalSettingsDto } from "./dto/fiscal-settings.dto";
import type {
  CompanyFiscalSettings,
  InvoiceBuyer,
  InvoiceDraft,
  InvoiceLineDraft,
  InvoiceProvider,
  InvoiceProviderId,
  InvoiceTotals,
  IssueInvoiceResult,
} from "./invoicing.types";

interface OrderItemRow {
  id: string;
  product_variant_id: string;
  product_name_snapshot: string;
  variant_label: string;
  unit_price_cop: number;
  quantity: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  total_cop: number;
  subtotal_cop: number | null;
  discount_cop: number | null;
  shipping_cost_cop: number | null;
  shipping_address: Record<string, string> | null;
  shipping_city: string | null;
  shipping_department: string | null;
  shipping_phone: string | null;
  billing_document_type: string | null;
  billing_document_number: string | null;
  billing_legal_name: string | null;
  billing_email: string | null;
  billing_municipality_code: string | null;
  created_at: string;
  items: OrderItemRow[];
}

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly numbering: InvoiceNumberingService,
    private readonly representation: InvoiceRepresentationService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogsService,
    private readonly config: ConfigService,
    private readonly simulated: SimulatedDianProvider,
    private readonly dianFree: DianFreeProvider,
    private readonly dianOwn: DianOwnProvider,
    private readonly factus: FactusProvider,
  ) {}

  /* ───────────────────────── Configuración fiscal ───────────────────────── */

  async getSettings(): Promise<CompanyFiscalSettings> {
    const { data, error } = await this.supabase.admin
      .from("company_fiscal_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      this.handleMissingTable(error, "company_fiscal_settings");
    }
    if (data) return data as CompanyFiscalSettings;

    const { data: inserted, error: insertError } = await this.supabase.admin
      .from("company_fiscal_settings")
      .insert({ id: true })
      .select()
      .single();
    if (insertError) throw insertError;
    return inserted as CompanyFiscalSettings;
  }

  /** Configuración sin secretos (nunca devolver PIN/contraseña al navegador). */
  async getPublicSettings() {
    const settings = await this.getSettings();
    const {
      software_pin_enc: softwarePin,
      certificate_password_enc: certificatePassword,
      certificate_path: certificatePath,
      ...safe
    } = settings;
    return {
      ...safe,
      hasSoftwarePin: Boolean(softwarePin),
      hasCertificate: Boolean(certificatePath),
      hasCertificatePassword: Boolean(certificatePassword),
    };
  }

  async updateSettings(actorId: string, dto: UpdateFiscalSettingsDto) {
    const current = await this.getSettings();
    const provider = dto.invoiceProvider ?? current.invoice_provider;
    const environment = dto.environment ?? current.environment;

    if (environment === "PRODUCCION" && provider === "DIAN_SIMULATED") {
      throw new BadRequestException(
        "El ambiente PRODUCCION requiere un proveedor real (Facturación Gratuita DIAN, software propio o Factus). El modo simulado solo funciona en habilitación.",
      );
    }

    const patch: Record<string, unknown> = {};
    if (dto.legalName !== undefined) patch.legal_name = dto.legalName.trim();
    if (dto.tradeName !== undefined) patch.trade_name = dto.tradeName.trim();
    if (dto.nit !== undefined) patch.nit = dto.nit.replace(/[^0-9]/g, "");
    if (dto.dv !== undefined) patch.dv = dto.dv.replace(/[^0-9]/g, "");
    if (dto.taxRegime !== undefined) patch.tax_regime = dto.taxRegime.trim();
    if (dto.fiscalResponsibilities !== undefined) {
      patch.fiscal_responsibilities = dto.fiscalResponsibilities
        .map((r) => r.trim())
        .filter(Boolean);
    }
    if (dto.address !== undefined) patch.address = dto.address.trim();
    if (dto.municipalityCode !== undefined) {
      patch.municipality_code = dto.municipalityCode.replace(/[^0-9]/g, "");
    }
    if (dto.municipality !== undefined) patch.municipality = dto.municipality.trim();
    if (dto.department !== undefined) patch.department = dto.department.trim();
    if (dto.email !== undefined) patch.email = dto.email.trim();
    if (dto.phone !== undefined) patch.phone = dto.phone.trim();
    if (dto.logoUrl !== undefined) patch.logo_url = dto.logoUrl.trim() || null;
    if (dto.invoiceProvider !== undefined) patch.invoice_provider = dto.invoiceProvider;
    if (dto.environment !== undefined) patch.environment = dto.environment;
    if (dto.enabled !== undefined) patch.enabled = dto.enabled;
    if (dto.demoMode !== undefined) patch.demo_mode = dto.demoMode;
    if (dto.softwareId !== undefined) patch.software_id = dto.softwareId.trim() || null;

    const { data, error } = await this.supabase.admin
      .from("company_fiscal_settings")
      .update(patch)
      .eq("id", true)
      .select()
      .single();
    if (error) throw error;

    await this.audit.record(actorId, "INVOICING_SETTINGS_UPDATED", "company_fiscal_settings", {
      provider,
      environment,
      enabled: data.enabled,
      demoMode: data.demo_mode,
    });
    return data;
  }

  async testConnection(actorId: string) {
    const settings = await this.getSettings();
    const provider = settings.invoice_provider;
    let ok = true;
    let message = "";

    switch (provider) {
      case "DIAN_SIMULATED":
        message =
          "Modo simulado listo. Genera XML/CUFE/QR localmente y simula aceptación de habilitación. No hay transmisión real.";
        break;
      case "DIAN_FREE":
        message =
          "Modo Facturación Gratuita DIAN listo. El XML se genera localmente; la radicación es manual en el portal de la DIAN.";
        break;
      case "DIAN_OWN":
        ok = Boolean(settings.certificate_path && settings.software_id);
        message = ok
          ? "Credenciales declaradas. Falta instalar/configurar el adaptador @dian-kit para transmitir."
          : "Falta certificado .p12 y software ID/PIN para el modo de software propio.";
        break;
      case "FACTUS":
        ok = false;
        message = "Factus requiere API key y configuración del sandbox. No está configurado.";
        break;
    }

    await this.supabase.admin
      .from("company_fiscal_settings")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: ok })
      .eq("id", true);

    await this.audit.record(actorId, "INVOICING_CONNECTION_TESTED", provider, { ok, message });
    return { ok, provider, environment: settings.environment, message };
  }

  /* ───────────────────────── Listados ───────────────────────── */

  async listInvoices(params: { status?: string; q?: string; limit?: number }) {
    const settings = await this.getSettings();
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);

    let query = this.supabase.admin
      .from("invoices")
      .select(
        "*, order:orders(id, user_id, status, total_cop, created_at, billing_legal_name, billing_document_number, billing_email, shipping_city, shipping_department)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (params.status && params.status !== "ALL") {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query;
    if (error) this.handleMissingTable(error, "invoices");

    let rows = (data ?? []) as Array<Record<string, any>>;
    const term = params.q?.trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) => {
        const order = row.order as Record<string, any> | null;
        return [
          row.full_number,
          row.cufe,
          order?.id,
          order?.billing_legal_name,
          order?.billing_document_number,
          order?.billing_email,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      });
    }

    const { data: statRows } = await this.supabase.admin
      .from("invoices")
      .select("status, total_cop");

    const stats = {
      pending: 0,
      issued: 0,
      rejected: 0,
      failed: 0,
      void: 0,
      pendingManual: 0,
      totalIssuedCop: 0,
      total: 0,
    };
    for (const row of (statRows ?? []) as Array<{ status: string; total_cop: number }>) {
      stats.total++;
      if (row.status === "PENDING") stats.pending++;
      if (row.status === "PENDING_MANUAL") stats.pendingManual++;
      if (row.status === "ISSUED") {
        stats.issued++;
        stats.totalIssuedCop += Number(row.total_cop ?? 0);
      }
      if (row.status === "REJECTED") stats.rejected++;
      if (row.status === "FAILED") stats.failed++;
      if (row.status === "VOID") stats.void++;
    }

    return {
      invoices: rows.map((row) => this.decorateInvoice(row)),
      stats,
      fiscal: {
        provider: settings.invoice_provider,
        environment: settings.environment,
        enabled: settings.enabled,
        demoMode: settings.demo_mode,
        legalName: settings.legal_name,
        nit: settings.nit,
        dv: settings.dv,
      },
    };
  }

  async listIssuableOrders() {
    const { data: orders, error } = await this.supabase.admin
      .from("orders")
      .select(
        "id, status, total_cop, created_at, shipping_city, shipping_department, billing_legal_name, billing_document_number, billing_email, invoice_status",
      )
      .in("status", ["PAID", "SHIPPED", "DELIVERED"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const ids = (orders ?? []).map((o) => o.id);
    let invoiceRows: Array<{ id: string; order_id: string; status: string; full_number: string | null }> = [];
    if (ids.length) {
      const { data } = await this.supabase.admin
        .from("invoices")
        .select("id, order_id, status, full_number")
        .in("order_id", ids);
      invoiceRows = (data ?? []) as typeof invoiceRows;
    }
    const byOrder = new Map(invoiceRows.map((i) => [i.order_id, i]));

    return (orders ?? [])
      .map((order) => ({
        ...order,
        invoice: byOrder.get(order.id) ?? null,
      }))
      .filter((order) => !order.invoice || ["FAILED", "REJECTED"].includes(order.invoice.status));
  }

  async getInvoice(id: string) {
    const { data, error } = await this.supabase.admin
      .from("invoices")
      .select(
        "*, order:orders(*, items:order_items(*)), lines:invoice_lines(*), events:invoice_events(*), credit_notes:credit_notes(*)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) this.handleMissingTable(error, "invoices");
    if (!data) throw new NotFoundException("Factura no encontrada");
    return this.decorateInvoice(data, true);
  }

  async findForOrder(orderId: string) {
    const map = await this.findForOrders([orderId]);
    return map.get(orderId) ?? null;
  }

  /**
   * Adjunta el resumen de factura a un lote de órdenes (listado admin) sin
   * hacer una consulta por orden. Si la migración no está aplicada devuelve un
   * mapa vacío para no romper el listado de pedidos.
   */
  async findForOrders(orderIds: string[]) {
    const result = new Map<string, Record<string, any>>();
    if (orderIds.length === 0) return result;

    try {
      const { data, error } = await this.supabase.admin
        .from("invoices")
        .select(
          "id, order_id, number, prefix, full_number, cufe, status, provider, environment, issue_date, accepted_at, total_cop, tax_cop, taxable_base_cop, dian_status_code, dian_message, qr_data_url",
        )
        .in("order_id", orderIds);
      if (error) {
        if (this.isMissingTable(error)) return result;
        throw error;
      }
      for (const row of (data ?? []) as Array<Record<string, any>>) {
        result.set(row.order_id, {
          ...row,
          public_url:
            row.status === "ISSUED" && row.cufe
              ? this.publicUrl(row.id, row.cufe)
              : null,
        });
      }
    } catch (err) {
      this.logger.warn(`findForOrders falló: ${(err as Error).message}`);
    }
    return result;
  }

  /* ───────────────────────── Emisión ───────────────────────── */

  async issueForOrder(orderId: string, actorId: string | null) {
    const existing = await this.findExistingInvoice(orderId);
    if (existing && !["FAILED", "REJECTED"].includes(existing.status)) {
      return existing;
    }

    const settings = await this.getSettings();
    if (!settings.enabled) {
      throw new BadRequestException(
        "La facturación electrónica está desactivada. Actívala en Facturación → Configuración.",
      );
    }

    const order = await this.loadOrder(orderId);
    if (!["PAID", "SHIPPED", "DELIVERED"].includes(order.status)) {
      throw new BadRequestException(
        `Solo se puede facturar una orden pagada (estado actual: ${order.status}).`,
      );
    }

    const buyer = await this.resolveBuyer(order);
    const built = this.buildDraftLines(order);

    let assignment;
    if (existing?.number && existing.prefix) {
      const range = await this.numbering.getActive("FV");
      assignment = {
        number: Number(existing.number),
        prefix: String(existing.prefix),
        technical_key: range.technical_key ?? null,
        resolution_number: range.resolution_number ?? null,
        resolution_date: range.resolution_date ?? null,
        valid_from: range.valid_from ?? null,
        valid_to: range.valid_to ?? null,
        range_from: range.range_from ?? null,
        range_to: range.range_to ?? null,
      };
    } else {
      assignment = await this.numbering.next("FV");
    }

    const draft: InvoiceDraft = {
      orderId: order.id,
      orderReference: order.id.slice(0, 8).toUpperCase(),
      issueDate: new Date(),
      seller: settings,
      buyer,
      lines: built.lines,
      totals: built.totals,
      currency: "COP",
      numbering: assignment,
    };

    const provider = this.providerFor(settings.invoice_provider);
    let result: IssueInvoiceResult;
    try {
      result = await provider.issue(draft);
    } catch (err) {
      result = {
        status: "FAILED",
        dianStatusCode: "ERROR",
        dianMessage: (err as Error).message,
      };
    }

    const now = new Date().toISOString();
    const status = result.status;
    const fullNumber = `${assignment.prefix}${assignment.number}`;

    const invoicePayload = {
      order_id: order.id,
      number: assignment.number,
      prefix: assignment.prefix,
      full_number: fullNumber,
      cufe: result.cufe ?? null,
      status,
      provider: settings.invoice_provider,
      environment: settings.environment,
      issue_date: draft.issueDate.toISOString(),
      accepted_at: result.acceptedAt?.toISOString() ?? (status === "ISSUED" ? now : null),
      xml_content: result.xml ?? null,
      qr_data_url:
        status === "ISSUED"
          ? result.qrDataUrl ??
            (result.cufe ? await buildQrDataUrl(dianQrUrl(result.cufe)) : null)
          : null,
      dian_track_id: result.trackId ?? null,
      dian_status_code: result.dianStatusCode ?? null,
      dian_message: result.dianMessage ?? null,
      taxable_base_cop: built.totals.taxable_base_cop,
      tax_cop: built.totals.tax_cop,
      total_cop: built.totals.total_cop,
      currency: "COP",
      seller_snapshot: this.sellerSnapshot(settings),
      buyer_snapshot: buyer,
      retry_count: existing ? Number(existing.retry_count ?? 0) + 1 : 0,
      last_error: status === "FAILED" || status === "REJECTED" ? result.dianMessage ?? null : null,
    };

    let invoice: Record<string, any>;
    if (existing) {
      const { data, error } = await this.supabase.admin
        .from("invoices")
        .update(invoicePayload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      invoice = data as Record<string, any>;
      await this.supabase.admin.from("invoice_lines").delete().eq("invoice_id", existing.id);
    } else {
      const { data, error } = await this.supabase.admin
        .from("invoices")
        .insert(invoicePayload)
        .select()
        .single();
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          const duplicate = await this.findExistingInvoice(orderId);
          if (duplicate) return duplicate;
        }
        throw error;
      }
      invoice = data as Record<string, any>;
    }

    const { error: linesError } = await this.supabase.admin.from("invoice_lines").insert(
      built.lines.map((line, position) => ({
        ...line,
        invoice_id: invoice.id,
        position,
      })),
    );
    if (linesError) throw linesError;

    await this.insertEvent(invoice.id, "CREATED", actorId, {
      provider: settings.invoice_provider,
      environment: settings.environment,
      number: fullNumber,
    });
    if (status !== "FAILED") {
      await this.insertEvent(invoice.id, "SENT", actorId, {
        provider: settings.invoice_provider,
        trackId: result.trackId ?? null,
      });
    }
    if (status === "ISSUED") {
      await this.insertEvent(invoice.id, "ACCEPTED", actorId, {
        dianStatusCode: result.dianStatusCode ?? "00",
        message: result.dianMessage ?? null,
      });
    } else if (status === "REJECTED" || status === "FAILED") {
      await this.insertEvent(invoice.id, "REJECTED", actorId, {
        dianStatusCode: result.dianStatusCode ?? null,
        message: result.dianMessage ?? null,
      });
    }

    await this.setOrderInvoiceStatus(order.id, status);
    await this.audit.record(actorId, `INVOICE_${status}`, invoice.id, {
      orderId: order.id,
      fullNumber,
      cufe: result.cufe ?? null,
      provider: settings.invoice_provider,
    });

    if (status === "ISSUED") {
      this.notifications
        .enqueueInvoiceIssued(order.id)
        .catch((e) =>
          this.logger.warn(`enqueueInvoiceIssued falló: ${(e as Error).message}`),
        );
    }

    return this.getInvoice(invoice.id);
  }

  async retryInvoice(invoiceId: string, actorId: string) {
    const invoice = await this.getInvoiceRow(invoiceId);
    if (["ISSUED", "VOID"].includes(invoice.status)) {
      throw new BadRequestException("Esta factura ya fue emitida o anulada.");
    }
    if (!invoice.number || !invoice.prefix) {
      return this.issueForOrder(invoice.order_id, actorId);
    }

    const settings = await this.getSettings();
    const order = await this.loadOrder(invoice.order_id);
    const buyer = (invoice.buyer_snapshot as InvoiceBuyer | null) ?? (await this.resolveBuyer(order));
    const built = this.buildDraftLines(order);
    const range = await this.numbering.getActive("FV");
    const draft: InvoiceDraft = {
      orderId: order.id,
      orderReference: order.id.slice(0, 8).toUpperCase(),
      issueDate: new Date(),
      seller: settings,
      buyer,
      lines: built.lines,
      totals: built.totals,
      currency: "COP",
      numbering: {
        number: Number(invoice.number),
        prefix: String(invoice.prefix),
        technical_key: range.technical_key ?? null,
        resolution_number: range.resolution_number ?? null,
        resolution_date: range.resolution_date ?? null,
        valid_from: range.valid_from ?? null,
        valid_to: range.valid_to ?? null,
        range_from: range.range_from ?? null,
        range_to: range.range_to ?? null,
      },
    };

    const provider = this.providerFor(settings.invoice_provider);
    const result = await provider.issue(draft);
    const patch = {
      cufe: result.cufe ?? null,
      status: result.status,
      accepted_at: result.acceptedAt?.toISOString() ?? null,
      xml_content: result.xml ?? invoice.xml_content,
      qr_data_url:
        result.qrDataUrl ?? (result.cufe ? await buildQrDataUrl(dianQrUrl(result.cufe)) : null),
      dian_track_id: result.trackId ?? null,
      dian_status_code: result.dianStatusCode ?? null,
      dian_message: result.dianMessage ?? null,
      retry_count: Number(invoice.retry_count ?? 0) + 1,
      last_error: ["FAILED", "REJECTED"].includes(result.status)
        ? result.dianMessage ?? null
        : null,
    };
    const { error } = await this.supabase.admin
      .from("invoices")
      .update(patch)
      .eq("id", invoiceId);
    if (error) throw error;

    await this.insertEvent(invoiceId, "RETRY", actorId, {
      status: result.status,
      message: result.dianMessage ?? null,
    });
    if (result.status === "ISSUED") {
      await this.insertEvent(invoiceId, "ACCEPTED", actorId, { message: result.dianMessage ?? null });
      this.notifications.enqueueInvoiceIssued(order.id).catch(() => {});
    }
    await this.setOrderInvoiceStatus(order.id, result.status);
    await this.audit.record(actorId, "INVOICE_RETRIED", invoiceId, {
      status: result.status,
    });
    return this.getInvoice(invoiceId);
  }

  async markIssued(invoiceId: string, actorId: string, dto: MarkInvoiceIssuedDto) {
    const invoice = await this.getInvoiceRow(invoiceId);
    if (invoice.status === "VOID") {
      throw new BadRequestException("La factura está anulada.");
    }

    const number = dto.number ?? Number(invoice.number);
    const prefix = invoice.prefix ?? "";
    if (!number) throw new BadRequestException("Debes indicar el número aceptado por la DIAN.");
    const cufe = dto.cufe.trim();
    if (!cufe) throw new BadRequestException("Debes indicar el CUFE aceptado por la DIAN.");

    const fullNumber = `${prefix}${number}`;
    const { error } = await this.supabase.admin
      .from("invoices")
      .update({
        number,
        full_number: fullNumber,
        cufe,
        status: "ISSUED",
        accepted_at: new Date().toISOString(),
        dian_status_code: "00",
        dian_message: dto.message?.trim() || "Factura registrada manualmente como aceptada por la DIAN.",
        xml_content: dto.xml?.trim() || invoice.xml_content,
        qr_data_url: await buildQrDataUrl(dianQrUrl(cufe)),
        last_error: null,
      })
      .eq("id", invoiceId);
    if (error) throw error;

    await this.insertEvent(invoiceId, "MANUAL_MARK", actorId, {
      fullNumber,
      cufe,
      message: dto.message ?? null,
    });
    await this.insertEvent(invoiceId, "ACCEPTED", actorId, {
      message: "Registro manual del CUFE aceptado.",
    });
    await this.setOrderInvoiceStatus(invoice.order_id, "ISSUED");
    await this.audit.record(actorId, "INVOICE_MARKED_ISSUED", invoiceId, {
      orderId: invoice.order_id,
      fullNumber,
      cufe,
    });
    this.notifications
      .enqueueInvoiceIssued(invoice.order_id)
      .catch((e) => this.logger.warn(`enqueueInvoiceIssued falló: ${(e as Error).message}`));

    return this.getInvoice(invoiceId);
  }

  /**
   * Emite una nota crédito total a partir de una orden reembolsada. Es
   * idempotente: si ya existe una nota crédito por el total, no duplica.
   */
  async createCreditNoteForOrder(orderId: string, reason: string, actorId: string | null) {
    const invoice = await this.findExistingInvoice(orderId);
    if (!invoice || invoice.status !== "ISSUED") return null;

    const total = Number(invoice.total_cop);
    const credited = await this.creditedAmount(invoice.id);
    if (credited >= total) return null;

    return this.createCreditNote(invoice.id, actorId, {
      reason,
      amountCop: total - credited,
    });
  }

  async createCreditNote(
    invoiceId: string,
    actorId: string | null,
    dto: CreateCreditNoteDto,
  ) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException("Indica el motivo de la nota crédito.");

    const invoice = await this.getInvoiceRow(invoiceId);
    if (invoice.status !== "ISSUED") {
      throw new BadRequestException("Solo se puede emitir nota crédito sobre una factura emitida.");
    }

    const total = Number(invoice.total_cop);
    const credited = await this.creditedAmount(invoiceId);
    const remaining = Math.max(0, total - credited);
    if (remaining <= 0) {
      throw new BadRequestException("Esta factura ya fue acreditada en su totalidad.");
    }

    const amount = Math.min(Number(dto.amountCop ?? remaining), remaining);
    if (amount <= 0) throw new BadRequestException("El monto de la nota crédito debe ser mayor a cero.");

    const assignment = await this.numbering.next("NC");
    const issueDate = new Date();
    const credit = buildCreditNoteXml({
      invoice: {
        full_number: invoice.full_number,
        cufe: invoice.cufe,
        total_cop: total,
        seller_snapshot: invoice.seller_snapshot ?? {},
        buyer_snapshot: invoice.buyer_snapshot ?? {},
      },
      number: assignment.number,
      prefix: assignment.prefix,
      amountCop: amount,
      reason,
      issueDate,
      technicalKey: assignment.technical_key,
      environment: invoice.environment,
    });

    const fullNumber = `${assignment.prefix}${assignment.number}`;
    const { data, error } = await this.supabase.admin
      .from("credit_notes")
      .insert({
        invoice_id: invoiceId,
        order_id: invoice.order_id,
        number: assignment.number,
        prefix: assignment.prefix,
        full_number: fullNumber,
        cufe: credit.cufe,
        status: "ISSUED",
        reason,
        amount_cop: amount,
        xml_content: credit.xml,
        created_by: actorId,
        issued_at: issueDate.toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await this.insertEvent(invoiceId, "CREDIT_NOTE", actorId, {
      creditNoteId: data.id,
      fullNumber,
      amountCop: amount,
      reason,
    });

    if (credited + amount >= total) {
      await this.supabase.admin
        .from("invoices")
        .update({ status: "VOID" })
        .eq("id", invoiceId);
      await this.setOrderInvoiceStatus(invoice.order_id, "VOID");
      await this.insertEvent(invoiceId, "VOID", actorId, {
        creditNoteId: data.id,
        reason: "Nota crédito total",
      });
    }

    await this.audit.record(actorId, "INVOICE_CREDIT_NOTE", invoiceId, {
      orderId: invoice.order_id,
      fullNumber,
      amountCop: amount,
      reason,
    });
    return this.getInvoice(invoiceId);
  }

  private async creditedAmount(invoiceId: string): Promise<number> {
    const { data, error } = await this.supabase.admin
      .from("credit_notes")
      .select("amount_cop")
      .eq("invoice_id", invoiceId)
      .eq("status", "ISSUED");
    if (error) {
      if (this.isMissingTable(error)) return 0;
      throw error;
    }
    return (data ?? []).reduce(
      (sum, row: { amount_cop: number | string }) => sum + Number(row.amount_cop ?? 0),
      0,
    );
  }

  /* ───────────────────────── Descargas ───────────────────────── */

  async downloadXml(invoiceId: string) {
    const invoice = await this.getInvoiceRow(invoiceId);
    if (!invoice.xml_content) throw new NotFoundException("Esta factura no tiene XML generado.");
    return {
      filename: `${invoice.full_number ?? invoice.id}.xml`,
      xml: invoice.xml_content,
    };
  }

  async representationFor(invoiceId: string) {
    const detail = await this.getInvoice(invoiceId);
    return {
      filename: `${detail.full_number ?? detail.id}.html`,
      html: this.representation.render({
        ...detail,
        lines: detail.lines ?? [],
      } as InvoiceRepresentationInput),
    };
  }

  async publicRepresentation(invoiceId: string, token: string) {
    const invoice = await this.getInvoiceRow(invoiceId);
    if (invoice.status !== "ISSUED" || !invoice.cufe) {
      throw new NotFoundException("La factura aún no está emitida.");
    }
    const expected = this.signPublicToken(invoiceId, invoice.cufe);
    if (!safeEqual(expected, token)) {
      throw new UnauthorizedException("Enlace de factura inválido.");
    }

    const detail = await this.getInvoice(invoiceId);
    return this.representation.render({
      ...detail,
      lines: detail.lines ?? [],
    } as InvoiceRepresentationInput);
  }

  /* ───────────────────────── Helpers ───────────────────────── */

  private decorateInvoice(
    row: Record<string, any>,
    detail = false,
  ): Record<string, any> {
    const lines = detail
      ? [...((row.lines ?? []) as Array<Record<string, any>>)].sort(
          (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
        )
      : undefined;
    const events = detail
      ? [...((row.events ?? []) as Array<Record<string, any>>)].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
      : undefined;
    const creditNotes = detail
      ? [...((row.credit_notes ?? []) as Array<Record<string, any>>)].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
      : undefined;

    return {
      ...row,
      lines,
      events,
      credit_notes: creditNotes,
      public_url:
        row.status === "ISSUED" && row.cufe ? this.publicUrl(row.id, row.cufe) : null,
    };
  }

  private async findExistingInvoice(orderId: string) {
    const { data, error } = await this.supabase.admin
      .from("invoices")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) {
      if (this.isMissingTable(error)) return null;
      throw error;
    }
    return data as Record<string, any> | null;
  }

  private async getInvoiceRow(invoiceId: string) {
    const { data, error } = await this.supabase.admin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) this.handleMissingTable(error, "invoices");
    if (!data) throw new NotFoundException("Factura no encontrada");
    return data as Record<string, any>;
  }

  private async loadOrder(orderId: string): Promise<OrderRow> {
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Orden no encontrada");
    return data as unknown as OrderRow;
  }

  private async resolveBuyer(order: OrderRow): Promise<InvoiceBuyer> {
    let profile: Record<string, any> | null = null;
    if (!order.billing_document_number || !order.billing_legal_name || !order.billing_email) {
      const { data } = await this.supabase.admin
        .from("profiles")
        .select("email, full_name, document_type, document_number, phone")
        .eq("id", order.user_id)
        .maybeSingle();
      profile = data ?? null;
    }

    let accountEmail: string | null = order.billing_email ?? profile?.email ?? null;
    if (!accountEmail) {
      const { data } = await this.supabase.admin.auth.admin.getUserById(order.user_id);
      accountEmail = data?.user?.email ?? null;
    }

    const address = order.shipping_address ?? {};
    const documentType = normalizeDocType(
      order.billing_document_type ?? profile?.document_type,
    );
    const documentNumber =
      order.billing_document_number?.trim() ||
      profile?.document_number?.trim() ||
      "222222222222";
    const legalName =
      order.billing_legal_name?.trim() ||
      address.recipientName?.trim() ||
      profile?.full_name?.trim() ||
      accountEmail ||
      "Consumidor final";

    return {
      document_type: documentType,
      document_number: documentNumber,
      legal_name: legalName,
      email: accountEmail,
      address: [address.line1, address.line2, address.neighborhood].filter(Boolean).join(" ") || null,
      municipality_code: order.billing_municipality_code ?? null,
      municipality: order.shipping_city ?? address.city ?? "Bogotá D.C.",
      department: order.shipping_department ?? address.department ?? "Cundinamarca",
      phone: order.shipping_phone ?? address.phone ?? profile?.phone ?? null,
      regime: documentType === "NIT" ? "O-48" : "R-99-PN",
    };
  }

  private buildDraftLines(order: OrderRow): { lines: InvoiceLineDraft[]; totals: InvoiceTotals } {
    const items = order.items ?? [];
    const grossTotal = items.reduce(
      (sum, it) => sum + Number(it.unit_price_cop) * Number(it.quantity),
      0,
    );
    const discount = Math.min(
      Math.max(0, Number(order.discount_cop ?? 0)),
      Math.max(0, grossTotal),
    );

    const shares = items.map((it) => {
      const gross = Number(it.unit_price_cop) * Number(it.quantity);
      return grossTotal > 0 ? (discount * gross) / grossTotal : 0;
    });
    const lineDiscounts = shares.map((v) => Math.floor(v));
    let remainder = discount - lineDiscounts.reduce((a, b) => a + b, 0);
    const fractionOrder = shares
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder && fractionOrder.length > 0; k++) {
      lineDiscounts[fractionOrder[k % fractionOrder.length].i] += 1;
    }

    const lines: InvoiceLineDraft[] = items.map((it, idx) => {
      const gross = Number(it.unit_price_cop) * Number(it.quantity);
      const lineDiscount = Math.min(gross, lineDiscounts[idx] ?? 0);
      const net = gross - lineDiscount;
      const tax = net - Math.round(net / 1.19);
      return {
        order_item_id: it.id,
        description: `${it.product_name_snapshot} · ${it.variant_label}`,
        quantity: Number(it.quantity),
        unit_price_cop: Number(it.unit_price_cop),
        discount_cop: lineDiscount,
        tax_rate: 19,
        tax_cop: tax,
        line_total_cop: net,
        tax_scheme: "01",
      };
    });

    const shipping = Math.max(0, Number(order.shipping_cost_cop ?? 0));
    if (shipping > 0) {
      const shippingTax = shipping - Math.round(shipping / 1.19);
      lines.push({
        order_item_id: null,
        description: "Envío nacional",
        quantity: 1,
        unit_price_cop: shipping,
        discount_cop: 0,
        tax_rate: 19,
        tax_cop: shippingTax,
        line_total_cop: shipping,
        tax_scheme: "01",
      });
    }

    const taxCop = lines.reduce((sum, l) => sum + l.tax_cop, 0);
    const totalCop = lines.reduce((sum, l) => sum + l.line_total_cop, 0);
    const taxableBaseCop = totalCop - taxCop;

    return {
      lines,
      totals: {
        subtotal_cop: grossTotal,
        discount_cop: discount,
        taxable_base_cop: taxableBaseCop,
        tax_cop: taxCop,
        shipping_cost_cop: shipping,
        shipping_tax_cop: shipping > 0 ? shipping - Math.round(shipping / 1.19) : 0,
        total_cop: totalCop,
      },
    };
  }

  private providerFor(id: InvoiceProviderId): InvoiceProvider {
    switch (id) {
      case "DIAN_FREE":
        return this.dianFree;
      case "DIAN_OWN":
        return this.dianOwn;
      case "FACTUS":
        return this.factus;
      default:
        return this.simulated;
    }
  }

  /** Snapshot del emisor sin secretos (PIN, certificado ni su contraseña). */
  private sellerSnapshot(settings: CompanyFiscalSettings) {
    const {
      software_pin_enc,
      certificate_password_enc,
      certificate_path,
      ...safe
    } = settings;
    return safe;
  }

  private async insertEvent(
    invoiceId: string,
    type: string,
    actorId: string | null,
    payload: Record<string, unknown>,
  ) {
    const { error } = await this.supabase.admin.from("invoice_events").insert({
      invoice_id: invoiceId,
      type,
      payload,
      actor_id: actorId,
    });
    if (error) this.logger.warn(`No se pudo registrar evento ${type}: ${error.message}`);
  }

  private async setOrderInvoiceStatus(orderId: string, status: string) {
    const { error } = await this.supabase.admin
      .from("orders")
      .update({ invoice_status: status })
      .eq("id", orderId);
    if (error && (error as { code?: string }).code !== "42703") {
      this.logger.warn(`No se pudo actualizar invoice_status de ${orderId}: ${error.message}`);
    }
  }

  private signPublicToken(invoiceId: string, cufe: string) {
    const secret =
      this.config.get<string>("INVOICE_PUBLIC_SECRET") ||
      this.config.get<string>("QR_HMAC_SECRET") ||
      "arshop-invoice-demo-secret";
    return createHmac("sha256", secret)
      .update(`${invoiceId}.${cufe}`)
      .digest("base64url");
  }

  private publicUrl(invoiceId: string, cufe: string) {
    return `/api/invoices/public/${invoiceId}/${this.signPublicToken(invoiceId, cufe)}`;
  }

  private handleMissingTable(error: unknown, table: string): never {
    if (this.isMissingTable(error)) {
      throw new BadRequestException(
        `La tabla ${table} no existe. Ejecuta db/migrations/028_electronic_invoicing.sql en Supabase.`,
      );
    }
    throw error as Error;
  }

  private isMissingTable(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === "42P01" || code === "42703";
  }
}

function normalizeDocType(value: string | null | undefined): InvoiceBuyer["document_type"] {
  return value === "CE" || value === "PP" || value === "NIT" ? value : "CC";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
