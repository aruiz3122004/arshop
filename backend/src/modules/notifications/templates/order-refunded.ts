const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
});

interface RefundData {
  id: string;
  total_cop: number;
}

export function orderRefundedHtml(order: RefundData): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reembolso procesado — ARShop</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e5;">
          <tr>
            <td style="padding:40px 40px 24px;border-bottom:1px solid #e5e5e5;">
              <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#727272;">ARShop</p>
              <h1 style="margin:12px 0 0;font-size:26px;font-weight:300;color:#222222;font-family:Georgia,serif;">
                Reembolso procesado
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:14px;color:#222222;line-height:1.6;">
                Hemos procesado el reembolso de tu pedido
                <strong>#${order.id.slice(0, 8)}</strong> por un total de
                <strong>${fmt.format(order.total_cop)}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:13px;color:#727272;line-height:1.6;">
                El importe se acreditará en tu método de pago original en un plazo de
                3–5 días hábiles según tu banco o entidad financiera.
              </p>
              <p style="margin:0;font-size:13px;color:#727272;line-height:1.6;">
                Si tienes alguna duda, responde a este correo o contáctanos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5;padding-top:24px;">
                <tr>
                  <td style="font-size:11px;color:#727272;letter-spacing:0.12em;text-transform:uppercase;">
                    Ref. pedido
                  </td>
                  <td align="right" style="font-size:11px;color:#727272;font-family:monospace;">
                    #${order.id.slice(0, 8)}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#727272;letter-spacing:0.12em;text-transform:uppercase;padding-top:8px;">
                    Total reembolsado
                  </td>
                  <td align="right" style="font-size:14px;color:#222222;font-weight:500;padding-top:8px;">
                    ${fmt.format(order.total_cop)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f5f5f5;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:11px;color:#727272;letter-spacing:0.1em;text-transform:uppercase;">
                ARShop &nbsp;·&nbsp; arshop.co
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
