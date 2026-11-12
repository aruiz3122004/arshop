interface OrderItem {
  product_name_snapshot: string;
  variant_label: string;
  quantity: number;
  unit_price_cop: number;
}

interface OrderData {
  id: string;
  total_cop: number;
  shipping_city: string;
  shipping_department: string;
  items: OrderItem[];
  /** Presente sólo en pedidos de invitado: seguimiento sin cuenta. */
  trackingUrl?: string | null;
}

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
});

/** HTML minimalista, inline styles (clientes de correo son hostiles al CSS). */
export function orderConfirmationHtml(order: OrderData): string {
  const rows = order.items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e6e6e6;color:#222">
          ${escape(it.product_name_snapshot)}<br/>
          <span style="color:#727272;font-size:12px">${escape(it.variant_label)} · x${it.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e6e6e6;text-align:right;color:#222">
          ${fmt.format(it.unit_price_cop * it.quantity)}
        </td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px">
      <tr><td style="padding-bottom:32px;text-align:center">
        <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0;letter-spacing:0.02em">ARShop</h1>
      </td></tr>

      <tr><td style="padding-bottom:24px">
        <p style="margin:0 0 8px 0;color:#727272;text-transform:uppercase;letter-spacing:0.14em;font-size:11px">Pedido confirmado</p>
        <h2 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px">Gracias por tu compra</h2>
      </td></tr>

      <tr><td style="padding-bottom:24px;color:#222;font-size:14px;line-height:1.5">
        Hemos recibido el pago de tu pedido <strong>#${order.id.slice(0, 8)}</strong>.
        Estamos preparando tu envío a ${escape(order.shipping_city)}, ${escape(order.shipping_department)}.
      </td></tr>

      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td style="padding-top:16px;color:#222;font-weight:bold">Total</td>
              <td style="padding-top:16px;text-align:right;color:#222;font-weight:bold">${fmt.format(order.total_cop)}</td>
            </tr>
          </tfoot>
        </table>
      </td></tr>

      ${
        order.trackingUrl
          ? `<tr><td style="padding:28px 0 0 0">
        <a href="${escape(order.trackingUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Seguir mi pedido</a>
        <p style="margin:12px 0 0 0;color:#727272;font-size:12px;line-height:1.5">
          Guarda este correo: el enlace es tu acceso al pedido, sin crear cuenta.
          Vence en 30 días.
        </p>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:40px 0 0 0;color:#727272;font-size:12px;line-height:1.5">
        ARShop · Moda oculta, sin sede física.
      </td></tr>
    </table>
  </body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
