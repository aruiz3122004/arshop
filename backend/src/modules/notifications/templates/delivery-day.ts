import { esc } from "./_escape";

export function deliveryDayHtml(opts: {
  orderId: string;
  city: string;
  appUrl: string;
}): string {
  const short = esc(opts.orderId.slice(0, 8));
  const url = `${opts.appUrl.replace(/\/$/, "")}/cuenta/pedidos/${encodeURIComponent(opts.orderId)}/qr`;
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="font-weight: 500; margin: 0 0 12px;">Tu pedido llega hoy</h2>
    <p style="line-height: 1.6; margin: 0 0 16px;">
      Hola. Tu pedido <strong>#${short}</strong> llegará en el transcurso del día de hoy a
      <strong>${esc(opts.city)}</strong>. El domiciliario tendrá acceso a tu número telefónico;
      por favor mantente pendiente de tus canales de atención.
    </p>
    <h3 style="font-weight: 500; margin: 24px 0 8px;">Ten listo tu código QR</h3>
    <ol style="line-height: 1.7; padding-left: 20px; margin: 0 0 16px;">
      <li>Entra a tu <a href="${url}" style="color: #111; text-decoration: underline;">historial de pedidos</a> y toca <em>Ver detalle</em>.</li>
      <li>Toca el botón <strong>QR</strong>.</li>
      <li>Diligencia los campos: <em>¿Quién recibió?</em>, <em>tipo de documento</em>, <em>número de documento</em>.</li>
      <li>Si recibes tú mismo, usa el botón <em>Diligenciar automáticamente</em> para traer tus datos guardados.</li>
    </ol>
    <p style="line-height: 1.6; margin: 0 0 16px; color: #555; font-size: 14px;">
      El repartidor verificará los datos con el receptor por política de entrega.
    </p>
    <p style="margin: 32px 0 0; font-size: 12px; color: #888;">ARShop · Moda oculta.</p>
  </div>
  `;
}
