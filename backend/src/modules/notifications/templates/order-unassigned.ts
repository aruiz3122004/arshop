import { esc } from "./_escape";

export function orderUnassignedHtml(opts: {
  orderId: string;
  city: string;
  department: string;
  customerEmail: string | null;
  appUrl: string;
}): string {
  const short = esc(opts.orderId.slice(0, 8));
  const url = `${opts.appUrl.replace(/\/$/, "")}/admin/pedidos`;
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="font-weight: 500; margin: 0 0 12px; color: #b45309;">⚠ Pedido sin domiciliario asignado</h2>
    <p style="line-height: 1.6; margin: 0 0 12px;">
      El pedido <strong>#${short}</strong> fue pagado pero el sistema no encontró ningún domiciliario
      <strong>DISPONIBLE</strong> en el departamento ni en ninguna ciudad cercana.
    </p>
    <table style="border-collapse: collapse; margin: 12px 0;">
      <tr><td style="padding: 4px 10px; color: #555;">Zona</td><td style="padding: 4px 10px;"><strong>${esc(opts.city)}, ${esc(opts.department)}</strong></td></tr>
      <tr><td style="padding: 4px 10px; color: #555;">Cliente</td><td style="padding: 4px 10px;">${esc(opts.customerEmail) || "—"}</td></tr>
      <tr><td style="padding: 4px 10px; color: #555;">Estado</td><td style="padding: 4px 10px;">UNASSIGNED</td></tr>
    </table>
    <p style="line-height: 1.6; margin: 12px 0;">
      Acciones recomendadas:
    </p>
    <ol style="line-height: 1.7; padding-left: 20px; margin: 0 0 12px;">
      <li>Contratar o activar un domiciliario en esta zona desde <a href="${opts.appUrl}/admin/domiciliarios" style="color:#111">/admin/domiciliarios</a>.</li>
      <li>Reasignar manualmente desde el panel de pedidos.</li>
      <li>Avisar al cliente del retraso previsto.</li>
    </ol>
    <p style="margin: 20px 0;">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;text-decoration:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Ver pedido</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #888;">ARShop · Alerta operativa.</p>
  </div>
  `;
}
