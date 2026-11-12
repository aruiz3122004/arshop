import "reflect-metadata";
import {
  buildCreditNoteXml,
  buildInvoiceArtifacts,
  buildQrContent,
  calculateCufe,
  dianQrUrl,
  formatDate,
  formatTime,
} from "../src/modules/invoicing/invoice-xml.builder";
import { InvoiceNumberingService } from "../src/modules/invoicing/invoice-numbering.service";
import { InvoicingService } from "../src/modules/invoicing/invoicing.service";
import type { InvoiceDraft } from "../src/modules/invoicing/invoicing.types";

const ISSUE_DATE = new Date("2026-03-15T15:30:00.000Z");

function draft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  const base: InvoiceDraft = {
    orderId: "11111111-1111-1111-1111-111111111111",
    orderReference: "11111111",
    issueDate: ISSUE_DATE,
    seller: {
      id: true,
      legal_name: "ARShop S.A.S. (DEMO)",
      trade_name: "ARShop",
      nit: "901482109",
      dv: "4",
      tax_regime: "RESPONSABLE_IVA",
      fiscal_responsibilities: ["O-48", "O-13"],
      address: "Calle 93 # 11-45",
      municipality_code: "11001",
      municipality: "Bogotá D.C.",
      department: "Cundinamarca",
      email: "facturacion@arshop.co",
      phone: "+57 601 000 0000",
      logo_url: null,
      invoice_provider: "DIAN_SIMULATED",
      environment: "HABILITACION",
      enabled: true,
      demo_mode: true,
      software_id: "ARSHOP-DEMO-001",
      software_pin_enc: null,
      certificate_path: null,
      certificate_password_enc: null,
      last_test_at: null,
      last_test_ok: null,
      updated_at: ISSUE_DATE.toISOString(),
    },
    buyer: {
      document_type: "CC",
      document_number: "1020304050",
      legal_name: "Ana María Gómez",
      email: "ana@example.com",
      address: "Carrera 7 # 72-01",
      municipality_code: "11001",
      municipality: "Bogotá D.C.",
      department: "Cundinamarca",
      phone: "3001234567",
      regime: "R-99-PN",
    },
    lines: [
      {
        order_item_id: "item-1",
        description: "Camisa Oxford · M · Negro",
        quantity: 1,
        unit_price_cop: 119000,
        discount_cop: 0,
        tax_rate: 19,
        tax_cop: 19000,
        line_total_cop: 119000,
        tax_scheme: "01",
      },
    ],
    totals: {
      subtotal_cop: 119000,
      discount_cop: 0,
      taxable_base_cop: 100000,
      tax_cop: 19000,
      shipping_cost_cop: 0,
      shipping_tax_cop: 0,
      total_cop: 119000,
    },
    currency: "COP",
    numbering: {
      number: 990000001,
      prefix: "FEAR",
      technical_key:
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      resolution_number: "18764000001234",
    },
  };
  return { ...base, ...overrides };
}

describe("Facturación electrónica · CUFE y XML UBL 2.1", () => {
  it("genera un CUFE SHA-384 determinista de 96 caracteres hex", () => {
    const cufe = calculateCufe(draft());
    expect(cufe).toMatch(/^[a-f0-9]{96}$/);
    expect(calculateCufe(draft())).toBe(cufe);

    const other = calculateCufe(
      draft({ numbering: { ...draft().numbering, number: 990000002 } }),
    );
    expect(other).not.toBe(cufe);
  });

  it("usa la fecha y hora de Bogotá en el documento", () => {
    expect(formatDate(ISSUE_DATE)).toBe("2026-03-15");
    expect(formatTime(ISSUE_DATE)).toBe("10:30:00-05:00");
  });

  it("construye el XML UBL 2.1 con emisor, adquiriente, IVA y QR", async () => {
    const artifact = await buildInvoiceArtifacts(draft());

    expect(artifact.xml).toContain("<Invoice");
    expect(artifact.xml).toContain("UBL 2.1");
    expect(artifact.xml).toContain("<cbc:ID>FEAR990000001</cbc:ID>");
    expect(artifact.xml).toContain(artifact.cufe);
    expect(artifact.xml).toContain("ARShop S.A.S. (DEMO)");
    expect(artifact.xml).toContain("Ana María Gómez");
    expect(artifact.xml).toContain("1020304050");
    expect(artifact.xml).toContain("119000.00");
    expect(artifact.xml).toContain("19000.00");
    expect(artifact.xml).toContain(
      'LineExtensionAmount currencyID="COP">100000.00',
    );
    expect(artifact.xml).toContain("Camisa Oxford");
    expect(artifact.qrContent).toBe(dianQrUrl(artifact.cufe));
  });

  it("emite AllowanceCharge con base gravable cuando hay descuento", async () => {
    const discounted = draft({
      lines: [
        {
          order_item_id: "item-1",
          description: "Camisa Oxford · M · Negro",
          quantity: 1,
          unit_price_cop: 119000,
          discount_cop: 10000,
          tax_rate: 19,
          tax_cop: 17403,
          line_total_cop: 109000,
          tax_scheme: "01",
        },
      ],
      totals: {
        subtotal_cop: 119000,
        discount_cop: 10000,
        taxable_base_cop: 91597,
        tax_cop: 17403,
        shipping_cost_cop: 0,
        shipping_tax_cop: 0,
        total_cop: 109000,
      },
    });

    const artifact = await buildInvoiceArtifacts(discounted);
    expect(artifact.xml).toContain("<cac:AllowanceCharge>");
    expect(artifact.xml).toContain(
      'AllowanceChargeReason>Descuento</cbc:AllowanceChargeReason>',
    );
    expect(artifact.xml).toContain('Amount currencyID="COP">8403.00');
    expect(artifact.xml).toContain(
      'LineExtensionAmount currencyID="COP">91597.00',
    );
  });

  it("incluye la cadena clave-valor del anexo técnico en el XML", () => {
    const d = draft();
    const cufe = calculateCufe(d);
    const qr = buildQrContent(d, cufe);
    expect(qr).toContain("NroFactura=FEAR990000001");
    expect(qr).toContain("NitOFE=9014821094");
    expect(qr).toContain("NumAdq=1020304050");
    expect(qr).toContain("ValFac=100000.00");
    expect(qr).toContain("TipoAmbiente=2");
    expect(qr).toContain(`CUFE=${cufe}`);
  });

  it("genera una nota crédito referenciando la factura original", () => {
    const note = buildCreditNoteXml({
      invoice: {
        full_number: "FEAR990000001",
        cufe: "a".repeat(96),
        total_cop: 119000,
        seller_snapshot: { legal_name: "ARShop", nit: "901482109", dv: "4" },
        buyer_snapshot: {
          legal_name: "Ana María Gómez",
          document_type: "CC",
          document_number: "1020304050",
        },
      },
      number: 991000001,
      prefix: "NCAR",
      amountCop: 119000,
      reason: "Devolución total",
      issueDate: ISSUE_DATE,
      technicalKey: null,
      environment: "HABILITACION",
    });

    expect(note.cufe).toMatch(/^[a-f0-9]{96}$/);
    expect(note.xml).toContain("<CreditNote");
    expect(note.xml).toContain(
      'xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    );
    expect(note.xml).toContain("NCAR991000001");
    expect(note.xml).toContain("FEAR990000001");
    expect(note.xml).toContain("Devolución total");
    expect(note.xml).toContain("119000.00");
  });
});

describe("Facturación electrónica · numeración", () => {
  it("asigna el consecutivo devuelto por la RPC atómica", async () => {
    const range = {
      id: "range-1",
      document_type: "FV",
      prefix: "FEAR",
      range_from: 990000000,
      range_to: 990999999,
      current_number: 990000004,
      technical_key: "tk",
      resolution_number: "res-1",
      active: true,
    };
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn(async () => ({ data: range, error: null })),
    };
    const supabase = {
      admin: {
        from: jest.fn(() => chain),
        rpc: jest.fn(async () => ({
          data: [
            {
              number: 990000005,
              prefix: "FEAR",
              technical_key: "tk",
              resolution_number: "res-1",
            },
          ],
          error: null,
        })),
      },
    };

    const service = new InvoiceNumberingService(supabase as any);
    const assignment = await service.next("FV");

    expect(supabase.admin.rpc).toHaveBeenCalledWith("next_invoice_number", {
      p_range_id: "range-1",
    });
    expect(assignment).toEqual({
      number: 990000005,
      prefix: "FEAR",
      technical_key: "tk",
      resolution_number: "res-1",
      resolution_date: null,
      valid_from: null,
      valid_to: null,
      range_from: 990000000,
      range_to: 990999999,
    });
  });
});

describe("Facturación electrónica · prorrateo de descuentos", () => {
  function buildService() {
    return new InvoicingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it("reparte el descuento por línea sin perder pesos y calcula IVA incluido", () => {
    const service = buildService() as any;
    const order = {
      id: "order-1",
      user_id: "user-1",
      status: "PAID",
      total_cop: 168500,
      subtotal_cop: 178500,
      discount_cop: 10000,
      shipping_cost_cop: 0,
      shipping_address: {},
      shipping_city: "Bogotá D.C.",
      shipping_department: "Cundinamarca",
      shipping_phone: "3001234567",
      billing_document_type: "CC",
      billing_document_number: "1020304050",
      billing_legal_name: "Ana María Gómez",
      billing_email: "ana@example.com",
      billing_municipality_code: "11001",
      created_at: ISSUE_DATE.toISOString(),
      items: [
        {
          id: "item-1",
          product_variant_id: "v-1",
          product_name_snapshot: "Camisa Oxford",
          variant_label: "M · Negro",
          unit_price_cop: 119000,
          quantity: 1,
        },
        {
          id: "item-2",
          product_variant_id: "v-2",
          product_name_snapshot: "Pantalón",
          variant_label: "32 · Azul",
          unit_price_cop: 59500,
          quantity: 1,
        },
      ],
    };

    const { lines, totals } = service.buildDraftLines(order);

    expect(lines.map((l: any) => l.discount_cop)).toEqual([6667, 3333]);
    expect(
      lines.reduce((sum: number, l: any) => sum + l.discount_cop, 0),
    ).toBe(10000);
    expect(totals.total_cop).toBe(168500);
    expect(totals.tax_cop).toBe(26904);
    expect(totals.taxable_base_cop).toBe(141596);
  });
});
