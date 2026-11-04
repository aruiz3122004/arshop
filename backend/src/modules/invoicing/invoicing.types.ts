export type InvoiceProviderId =
  | "DIAN_SIMULATED"
  | "DIAN_FREE"
  | "DIAN_OWN"
  | "FACTUS";

export type InvoiceEnvironment = "HABILITACION" | "PRODUCCION";

export type InvoiceStatus =
  | "PENDING"
  | "PENDING_MANUAL"
  | "ISSUED"
  | "REJECTED"
  | "FAILED"
  | "VOID";

export type InvoiceEventType =
  | "CREATED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "RETRY"
  | "MANUAL_MARK"
  | "CREDIT_NOTE"
  | "VOID";

export interface CompanyFiscalSettings {
  id: boolean;
  legal_name: string;
  trade_name: string;
  nit: string;
  dv: string;
  tax_regime: string;
  fiscal_responsibilities: string[];
  address: string;
  municipality_code: string;
  municipality: string;
  department: string;
  email: string;
  phone: string;
  logo_url: string | null;
  invoice_provider: InvoiceProviderId;
  environment: InvoiceEnvironment;
  enabled: boolean;
  demo_mode: boolean;
  software_id: string | null;
  software_pin_enc: string | null;
  certificate_path: string | null;
  certificate_password_enc: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  updated_at: string;
}

export interface InvoiceNumberingRange {
  id: string;
  document_type: "FV" | "NC" | "ND" | "POS";
  prefix: string;
  resolution_number: string | null;
  resolution_date: string | null;
  range_from: number;
  range_to: number;
  current_number: number;
  valid_from: string | null;
  valid_to: string | null;
  technical_key: string | null;
  active: boolean;
}

export interface InvoiceBuyer {
  document_type: "CC" | "CE" | "PP" | "NIT";
  document_number: string;
  legal_name: string;
  email: string | null;
  address: string | null;
  municipality_code: string | null;
  municipality: string;
  department: string;
  phone: string | null;
  regime: string;
}

export interface InvoiceLineDraft {
  order_item_id: string | null;
  description: string;
  quantity: number;
  unit_price_cop: number;
  discount_cop: number;
  tax_rate: number;
  tax_cop: number;
  line_total_cop: number;
  tax_scheme: "01";
}

export interface InvoiceTotals {
  subtotal_cop: number;
  discount_cop: number;
  taxable_base_cop: number;
  tax_cop: number;
  shipping_cost_cop: number;
  shipping_tax_cop: number;
  total_cop: number;
}

export interface InvoiceDraft {
  orderId: string;
  orderReference: string;
  issueDate: Date;
  seller: CompanyFiscalSettings;
  buyer: InvoiceBuyer;
  lines: InvoiceLineDraft[];
  totals: InvoiceTotals;
  currency: "COP";
  numbering: {
    number: number;
    prefix: string;
    technical_key: string | null;
    resolution_number: string | null;
    resolution_date?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
    range_from?: number | null;
    range_to?: number | null;
  };
}

export interface IssueInvoiceResult {
  status: Extract<InvoiceStatus, "ISSUED" | "PENDING_MANUAL" | "REJECTED" | "FAILED">;
  cufe?: string;
  xml?: string;
  qrDataUrl?: string;
  trackId?: string;
  dianStatusCode?: string;
  dianMessage?: string;
  acceptedAt?: Date;
}

export interface InvoiceProvider {
  readonly id: InvoiceProviderId;
  issue(input: InvoiceDraft): Promise<IssueInvoiceResult>;
}
