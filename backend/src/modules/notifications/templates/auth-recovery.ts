import { esc } from "./_escape";

/**
 * Correo de recuperación de contraseña, emitido por la propia API vía Resend
 * (dominio verificado `no-reply@arshop.arc03.online`).
 *
 * Reemplaza al correo por defecto de Supabase Auth ("Reset your password"),
 * que salía en inglés, con branding de Supabase y desde su IP compartida.
 */
export function authRecoveryHtml(opts: {
  actionUrl: string;
  minutes: number;
  siteUrl: string;
}): string {
  const actionUrl = esc(opts.actionUrl);
  const siteUrl = esc(opts.siteUrl.replace(/\/$/, ""));

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Restablece tu contraseña · ARShop</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e6;">
            <tr>
              <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e6e6e6;">
                <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#727272;">ARShop</p>
                <h1 style="margin:6px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:24px;color:#222222;">Restablece tu contraseña</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#222222;">
                  Recibimos una solicitud para restablecer la contraseña de tu cuenta ARShop.
                  Elige una nueva con el botón de abajo. El enlace expira en
                  <strong>${opts.minutes} minutos</strong> y sólo puede usarse una vez.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                  <tr>
                    <td style="background:#222222;">
                      <a href="${actionUrl}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;">
                        Elegir nueva contraseña
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#727272;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin:0 0 20px 0;font-size:11px;line-height:1.6;color:#727272;word-break:break-all;font-family:'Courier New',monospace;">
                  ${actionUrl}
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#727272;">
                  Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.
                  Nadie puede acceder a tu cuenta sin el enlace.
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
