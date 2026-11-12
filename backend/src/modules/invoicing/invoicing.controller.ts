import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { InvoicingService } from "./invoicing.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateCreditNoteDto, MarkInvoiceIssuedDto } from "./dto/invoice-actions.dto";
import { UpdateFiscalSettingsDto } from "./dto/fiscal-settings.dto";
import {
  CreateNumberingRangeDto,
  UpdateNumberingRangeDto,
} from "./dto/numbering.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller()
export class InvoicingController {
  constructor(
    private readonly invoicing: InvoicingService,
    private readonly numbering: InvoiceNumberingService,
    private readonly audit: AuditLogsService,
  ) {}

  /* ───────────────────────── Configuración ───────────────────────── */

  @Roles("ADMIN")
  @Get("admin/invoicing/settings")
  getSettings() {
    return this.invoicing.getPublicSettings();
  }

  @Roles("ADMIN")
  @Put("admin/invoicing/settings")
  async updateSettings(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateFiscalSettingsDto,
  ) {
    await this.invoicing.updateSettings(admin.id, dto);
    return this.invoicing.getPublicSettings();
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/invoicing/test")
  testConnection(@CurrentUser() admin: AuthenticatedUser) {
    return this.invoicing.testConnection(admin.id);
  }

  @Roles("ADMIN")
  @Get("admin/invoicing/numbering")
  listNumbering() {
    return this.numbering.list();
  }

  @Roles("ADMIN")
  @Post("admin/invoicing/numbering")
  async createNumbering(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateNumberingRangeDto,
  ) {
    const range = await this.numbering.create(dto);
    await this.audit.record(admin.id, "INVOICING_NUMBERING_CREATED", range.id, {
      prefix: range.prefix,
      documentType: range.document_type,
    });
    return range;
  }

  @Roles("ADMIN")
  @Patch("admin/invoicing/numbering/:id")
  async updateNumbering(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateNumberingRangeDto,
  ) {
    const range = await this.numbering.update(id, dto);
    await this.audit.record(admin.id, "INVOICING_NUMBERING_UPDATED", id, {
      prefix: range.prefix,
      active: range.active,
    });
    return range;
  }

  /* ───────────────────────── Facturas ───────────────────────── */

  @Roles("ADMIN")
  @Get("admin/invoices")
  list(
    @Query("status") status?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    return this.invoicing.listInvoices({
      status,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles("ADMIN")
  @Get("admin/invoices/issuable-orders")
  listIssuableOrders() {
    return this.invoicing.listIssuableOrders();
  }

  @Roles("ADMIN")
  @Get("admin/invoices/:id")
  detail(@Param("id") id: string) {
    return this.invoicing.getInvoice(id);
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/orders/:id/invoice")
  issueForOrder(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") orderId: string,
  ) {
    return this.invoicing.issueForOrder(orderId, admin.id);
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/invoices/:id/retry")
  retry(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string) {
    return this.invoicing.retryInvoice(id, admin.id);
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/invoices/:id/mark-issued")
  markIssued(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: MarkInvoiceIssuedDto,
  ) {
    return this.invoicing.markIssued(id, admin.id, dto);
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/invoices/:id/credit-note")
  creditNote(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    return this.invoicing.createCreditNote(id, admin.id, dto);
  }

  @Roles("ADMIN")
  @Get("admin/invoices/:id/xml")
  downloadXml(@Param("id") id: string) {
    return this.invoicing.downloadXml(id);
  }

  @Roles("ADMIN")
  @Get("admin/invoices/:id/representation")
  representation(@Param("id") id: string) {
    return this.invoicing.representationFor(id);
  }

  /* ───────────────────────── Enlace público ───────────────────────── */

  @Public()
  @Get("invoices/public/:id/:token")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "private, max-age=60")
  publicRepresentation(
    @Param("id") id: string,
    @Param("token") token: string,
  ) {
    return this.invoicing.publicRepresentation(id, token);
  }
}
