import { esc } from "./_escape";

export function orderDisputedHtml(opts: {
  orderId: string;
  city: string;
  department: string;
  customerEmail: string | null;
  deliveryName: string | null;
  reason: string | null;
  appUrl: string;
}): string {
  const short = esc(opts.orderId.slice(0, 8));
  const url = `${opts.appUrl.replace(/\/$/, "")}/admin/disputas`;
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="font-weight: 500; margin: 0 0 12px; color: #b91c1c;">⚠ Disputa de entrega — pedido #${short}</h2>
    <p style="line-height: 1.6; margin: 0 0 12px;">
      El cliente reportó que <strong>no recibió</strong> este pedido, a pesar de que el domiciliario lo marcó como entregado (entrega simulada).
    </p>
    <table style="border-collapse: collapse; margin: 12px 0;">
      <tr><td style="padding: 4px 10px; color: #555;">Zona</td><td style="padding: 4px 10px;"><strong>${esc(opts.city)}, ${esc(opts.department)}</strong></td></tr>
      <tr><td style="padding: 4px 10px; color: #555;">Cliente</td><td style="padding: 4px 10px;">${esc(opts.customerEmail) || "—"}</td></tr>
      <tr><td style="padding: 4px 10px; color: #555;">Domiciliario</td><td style="padding: 4px 10px;">${esc(opts.deliveryName) || "—"}</td></tr>
      <tr><td style="padding: 4px 10px; color: #555;">Motivo</td><td style="padding: 4px 10px; white-space:pre-wrap;">${esc(opts.reason) || "(sin motivo)"}</td></tr>
    </table>
    <p style="line-height: 1.6; margin: 12px 0;">
      Resuelve la disputa dando la razón al cliente (reembolso automático) o al domiciliario (marcar entregado) desde la bandeja de disputas.
    </p>
    <p style="margin: 20px 0;">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;text-decoration:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Resolver disputa</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #888;">ARShop · Operación de entregas.</p>
  </div>
  `;
}
