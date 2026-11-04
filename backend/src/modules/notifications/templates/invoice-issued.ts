const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
});

interface InvoiceEmailData {
  orderId: string;
  fullNumber: string | null;
  cufe: string | null;
  totalCop: number;
  legalName: string;
  appUrl: string;
}

export function invoiceIssuedHtml(data: InvoiceEmailData): string {
  const link = `${data.appUrl.replace(/\/$/, "")}/cuenta/pedidos/${data.orderId}`;
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px">
      <tr><td style="padding-bottom:28px;text-align:center">
        <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0;letter-spacing:0.02em">ARShop</h1>
      </td></tr>
      <tr><td style="padding-bottom:18px">
        <p style="margin:0 0 8px 0;color:#727272;text-transform:uppercase;letter-spacing:0.14em;font-size:11px">Factura electrónica</p>
        <h2 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px">Tu factura está disponible</h2>
      </td></tr>
      <tr><td style="padding-bottom:20px;color:#222;font-size:14px;line-height:1.55">
        Hola ${escape(data.legalName)}, emitimos la factura electrónica de tu pedido
        <strong>#${data.orderId.slice(0, 8)}</strong>.
      </td></tr>
      <tr><td style="border:1px solid #e6e6e6;padding:16px;font-size:13px;line-height:1.7">
        <div><span style="color:#727272">Número:</span> <strong>${escape(data.fullNumber ?? "—")}</strong></div>
        <div><span style="color:#727272">Total:</span> <strong>${fmt.format(data.totalCop)}</strong></div>
        <div style="word-break:break-all"><span style="color:#727272">CUFE:</span> ${escape(data.cufe ?? "—")}</div>
      </td></tr>
      <tr><td style="padding-top:22px">
        <a href="${escape(link)}" style="display:inline-block;background:#222;color:#fff;padding:12px 18px;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Ver factura</a>
      </td></tr>
      <tr><td style="padding:32px 0 0 0;color:#727272;font-size:11px;line-height:1.6">
        Documento generado en ambiente de habilitación/demostración. Consérvalo junto con el XML.
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
