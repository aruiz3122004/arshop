import { esc } from "./_escape";

/**
 * Correo de confirmación de cuenta, emitido por la API vía Resend (dominio
 * propio), igual que el de recuperación. Así Supabase Auth sólo genera el
 * token (`generateLink`) y nunca manda correos con su remitente.
 *
 * Incluye además el código OTP en claro: si el usuario abre el enlace en otro
 * dispositivo (o el cliente de correo rompe el botón), puede escribirlo a mano
 * en /verificar.
 */
export function authVerifyHtml(opts: {
  actionUrl: string;
  code?: string;
  siteUrl: string;
  hours: number;
}): string {
  const actionUrl = esc(opts.actionUrl);
  const siteUrl = esc(opts.siteUrl.replace(/\/$/, ""));

  const codeBlock = opts.code
    ? `<tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#727272;">
                  ¿Abriste este correo en otro dispositivo? Escribe este código en la página de verificación:
                </p>
                <p style="margin:0;padding:12px 16px;background:#f5f5f5;border:1px solid #e6e6e6;font-family:'Courier New',monospace;font-size:20px;letter-spacing:0.3em;color:#222222;">${esc(opts.code)}</p>
              </td>
            </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Confirma tu cuenta · ARShop</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e6;">
            <tr>
              <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e6e6e6;">
                <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#727272;">ARShop</p>
                <h1 style="margin:6px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:24px;color:#222222;">Confirma tu cuenta</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#222222;">
                  Ya casi está lista tu cuenta ARShop. Confirma que este correo es tuyo con el botón de abajo
                  para poder iniciar sesión. El enlace caduca en <strong>${opts.hours} horas</strong>.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                  <tr>
                    <td style="background:#222222;">
                      <a href="${actionUrl}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;">
                        Confirmar mi correo
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#727272;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin:0;font-size:11px;line-height:1.6;color:#727272;word-break:break-all;font-family:'Courier New',monospace;">
                  ${actionUrl}
                </p>
              </td>
            </tr>
            ${codeBlock}
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#727272;">
                  Si no creaste esta cuenta, ignora este correo: sin confirmación no se puede usar.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e6e6e6;background:#f5f5f5;">
                <p style="margin:0;font-size:11px;color:#b6b6b6;letter-spacing:0.1em;">
                  Correo automático · no responder · <a href="${siteUrl}" style="color:#727272;text-decoration:none;">arshop.co</a>
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
