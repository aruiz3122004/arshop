import { Injectable } from "@nestjs/common";

interface SnapshotAddress {
  line1?: string;
  line2?: string;
  neighborhood?: string;
  city?: string;
  department?: string;
  phone?: string;
}

export interface InvoiceRepresentationLine {
  description: string;
  quantity: number;
  unit_price_cop: number;
  discount_cop: number;
  tax_rate: number;
  tax_cop: number;
  line_total_cop: number;
}

export interface InvoiceRepresentationInput {
  id: string;
  full_number: string | null;
  prefix: string | null;
  number: number | null;
  cufe: string | null;
  status: string;
  provider: string;
  environment: string;
  issue_date: string;
  accepted_at: string | null;
  dian_status_code: string | null;
  dian_message: string | null;
  taxable_base_cop: number;
  tax_cop: number;
  total_cop: number;
  currency: string;
  qr_data_url: string | null;
  seller_snapshot: Record<string, unknown>;
  buyer_snapshot: Record<string, unknown>;
  order?: {
    id: string;
    created_at: string;
    shipping_address?: SnapshotAddress | null;
    shipping_city?: string | null;
    shipping_department?: string | null;
    shipping_phone?: string | null;
  } | null;
  lines: InvoiceRepresentationLine[];
}

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
});

@Injectable()
export class InvoiceRepresentationService {
  render(invoice: InvoiceRepresentationInput): string {
    const seller = invoice.seller_snapshot as {
      legal_name?: string;
      trade_name?: string;
      nit?: string;
      dv?: string;
      address?: string;
      municipality?: string;
      department?: string;
      email?: string;
      phone?: string;
    };
    const buyer = invoice.buyer_snapshot as {
      legal_name?: string;
      document_type?: string;
      document_number?: string;
      email?: string;
      address?: string;
      municipality?: string;
      department?: string;
      phone?: string;
    };

    const number =
      invoice.full_number?.trim() ||
      `${invoice.prefix ?? ""}${invoice.number ?? ""}`.trim() ||
      "SIN NÚMERO";
    const isDemo =
      invoice.provider === "DIAN_SIMULATED" || invoice.environment === "HABILITACION";
    const issueDate = new Date(invoice.issue_date).toLocaleString("es-CO", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Bogota",
    });

    const rows = invoice.lines
      .map(
        (line, idx) => `
        <tr>
          <td class="num">${idx + 1}</td>
          <td>
            <div class="strong">${esc(line.description)}</div>
          </td>
          <td class="center">${line.quantity}</td>
          <td class="right mono">${fmt.format(line.unit_price_cop)}</td>
          <td class="right mono">${line.discount_cop ? `-${fmt.format(line.discount_cop)}` : "—"}</td>
          <td class="right mono">${fmt.format(line.tax_cop)}</td>
          <td class="right mono strong">${fmt.format(line.line_total_cop)}</td>
        </tr>`,
      )
      .join("");

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factura ${esc(number)} — ${esc(seller.trade_name ?? "ARShop")}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f5f5; color: #181818; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 12px; line-height: 1.45; }
  .toolbar { max-width: 190mm; margin: 18px auto 10px; display: flex; justify-content: flex-end; gap: 8px; }
  .toolbar button { border: 1px solid #222; background: #222; color: #fff; padding: 9px 14px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; }
  .sheet { max-width: 190mm; margin: 0 auto 24px; background: #fff; border: 1px solid #d8d8d8; padding: 26px 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 14px; }
  .brand { font-family: Georgia, "Times New Roman", serif; font-size: 27px; font-weight: 700; letter-spacing: .03em; }
  .doc-type { margin-top: 3px; font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; color: #666; }
  .number-box { text-align: right; }
  .number-box .label { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: #666; }
  .number-box .value { font-family: "Courier New", monospace; font-size: 17px; font-weight: 700; margin-top: 2px; }
  .badge { display: inline-block; margin-top: 6px; border: 1px solid #222; padding: 2px 7px; font-size: 8.5px; letter-spacing: .14em; text-transform: uppercase; }
  .demo { margin: 14px 0 0; border: 1px solid #222; background: #fafafa; padding: 9px 12px; font-size: 9.5px; line-height: 1.45; letter-spacing: .02em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .box { border: 1px solid #d8d8d8; padding: 10px 13px; }
  .box-label { font-size: 8.5px; letter-spacing: .14em; text-transform: uppercase; color: #666; font-weight: 700; margin-bottom: 4px; }
  .box-value { font-size: 12px; font-weight: 600; }
  .muted { color: #666; font-weight: 400; font-size: 10.5px; }
  .section-title { margin: 18px 0 7px; font-size: 9.5px; letter-spacing: .15em; text-transform: uppercase; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th { border-top: 1.5px solid #222; border-bottom: 1.5px solid #222; padding: 7px 6px; text-align: left; font-size: 8.5px; letter-spacing: .11em; text-transform: uppercase; color: #444; }
  td { border-bottom: 1px solid #e6e6e6; padding: 8px 6px; vertical-align: top; }
  .num { width: 26px; color: #666; font-family: monospace; }
  .center { text-align: center; }
  .right { text-align: right; }
  .mono { font-family: "Courier New", monospace; }
  .strong { font-weight: 600; }
  .totals { margin-left: auto; margin-top: 12px; width: 62%; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 1.5px solid #222; margin-top: 5px; padding-top: 8px; font-size: 14px; font-weight: 700; }
  .dian { margin-top: 20px; border-top: 1px solid #d8d8d8; padding-top: 14px; display: grid; grid-template-columns: 82px 1fr; gap: 14px; align-items: start; }
  .dian img { width: 82px; height: 82px; border: 1px solid #e6e6e6; }
  .cufe { font-family: "Courier New", monospace; font-size: 9.5px; word-break: break-all; color: #333; }
  .footer { margin-top: 18px; border-top: 1px solid #d8d8d8; padding-top: 10px; color: #666; font-size: 9px; line-height: 1.5; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { border: 0; margin: 0; max-width: none; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <main class="sheet">
    <div class="header">
      <div>
        <div class="brand">${esc(seller.trade_name ?? "ARShop")}</div>
        <div class="doc-type">Factura Electrónica de Venta</div>
        <div class="muted" style="margin-top:6px">${esc(seller.legal_name ?? "")}<br/>NIT ${esc(seller.nit ?? "")}-${esc(seller.dv ?? "")} · ${esc(seller.address ?? "")}<br/>${esc(seller.municipality ?? "")}, ${esc(seller.department ?? "")} · ${esc(seller.email ?? "")} · ${esc(seller.phone ?? "")}</div>
      </div>
      <div class="number-box">
        <div class="label">Número</div>
        <div class="value">${esc(number)}</div>
        <div class="badge">${esc(statusLabel(invoice.status))}</div>
      </div>
    </div>

    ${isDemo
      ? `<div class="demo"><strong>DOCUMENTO DE DEMOSTRACIÓN.</strong> Generado por ARShop en ambiente de habilitación. No fue firmado con certificado acreditado ni transmitido a la DIAN; no tiene validez fiscal.</div>`
      : ""}

    <div class="grid">
      <div class="box">
        <div class="box-label">Adquiriente</div>
        <div class="box-value">${esc(buyer.legal_name ?? "Consumidor final")}</div>
        <div class="muted">${esc(buyer.document_type ?? "CC")} ${esc(buyer.document_number ?? "")}<br/>${esc(buyer.email ?? "")}${buyer.phone ? ` · ${esc(buyer.phone)}` : ""}</div>
      </div>
      <div class="box">
        <div class="box-label">Datos del documento</div>
        <div class="box-value">${esc(issueDate)}</div>
        <div class="muted">Pedido #${esc(invoice.order?.id?.slice(0, 8) ?? invoice.id.slice(0, 8))}<br/>Moneda ${esc(invoice.currency)} · ${esc(invoice.provider)} · ${esc(invoice.environment)}</div>
      </div>
    </div>

    <div class="section-title">Detalle de la factura</div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Descripción</th>
          <th class="center">Cant.</th>
          <th class="right">Valor unit.</th>
          <th class="right">Descuento</th>
          <th class="right">IVA 19%</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span class="mono">${fmt.format(invoice.taxable_base_cop + invoice.tax_cop)}</span></div>
      <div><span>Base gravable</span><span class="mono">${fmt.format(invoice.taxable_base_cop)}</span></div>
      <div><span>IVA (19% incluido)</span><span class="mono">${fmt.format(invoice.tax_cop)}</span></div>
      <div class="grand"><span>Total a pagar</span><span class="mono">${fmt.format(invoice.total_cop)}</span></div>
    </div>

    <div class="dian">
      ${invoice.qr_data_url ? `<img src="${invoice.qr_data_url}" alt="QR DIAN" />` : `<div class="muted">QR no disponible</div>`}
      <div>
        <div class="box-label">CUFE</div>
        <div class="cufe">${esc(invoice.cufe ?? "Pendiente de asignación por la DIAN")}</div>
        ${invoice.dian_status_code ? `<div class="muted" style="margin-top:6px">Código DIAN: ${esc(invoice.dian_status_code)}${invoice.dian_message ? ` — ${esc(invoice.dian_message)}` : ""}</div>` : ""}
      </div>
    </div>

    <div class="footer">
      ${esc(seller.legal_name ?? "")} · NIT ${esc(seller.nit ?? "")}-${esc(seller.dv ?? "")} · Responsabilidades ${esc(
        (invoice.seller_snapshot.fiscal_responsibilities as string[] | undefined)?.join(", ") ?? "O-48",
      )}<br/>
      Documento generado por ARShop · Software ID ${esc((invoice.seller_snapshot.software_id as string | undefined) ?? "ARSHOP-DEMO-001")} · ${esc(invoice.provider)} · ${esc(invoice.environment)}<br/>
      Conserve este documento y el XML asociado. En un entorno productivo debe validarse en el portal de la DIAN.
    </div>
  </main>
</body>
</html>`;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ISSUED":
      return "Emitida";
    case "PENDING_MANUAL":
      return "Pendiente de radicar";
    case "REJECTED":
      return "Rechazada";
    case "FAILED":
      return "Fallida";
    case "VOID":
      return "Anulada";
    default:
      return "Pendiente";
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
