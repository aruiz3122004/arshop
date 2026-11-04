interface BackInStockData {
  productName: string;
  productSlug: string;
  size: string;
  colorName: string;
  siteUrl: string;
}

export function backInStockHtml(data: BackInStockData): string {
  const pdp = `${data.siteUrl}/product/${encodeURIComponent(data.productSlug)}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Volvió a estar disponible — ARShop</title>
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
                Volvió lo que esperabas
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:14px;color:#222222;line-height:1.6;">
                <strong>${escapeHtml(data.productName)}</strong><br/>
                <span style="color:#727272;">Talla ${escapeHtml(data.size)} · ${escapeHtml(data.colorName)}</span>
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#727272;line-height:1.6;">
                Vuelve a estar disponible. Confirma antes de que vuelva a agotarse — el stock de los drops es limitado.
              </p>
              <a href="${pdp}" style="display:inline-block;background:#222222;color:#ffffff;padding:14px 24px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;">
                Ver producto
              </a>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
