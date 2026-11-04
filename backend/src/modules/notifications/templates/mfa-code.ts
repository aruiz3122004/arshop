/**
 * Template HTML del correo con el código 2FA de respaldo.
 * Diseño minimalista alineado con la paleta del admin (carbon/paper/stone).
 */
export function mfaCodeHtml({ code, minutes }: { code: string; minutes: number }) {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Tu código de acceso ARShop</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e6;">
            <tr>
              <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e6e6e6;">
                <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#727272;">ARShop</p>
                <h1 style="margin:6px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:22px;color:#222222;">Código de verificación</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#222222;">
                  Usa este código para completar tu inicio de sesión. Expira en <strong>${minutes} minutos</strong>.
                </p>
                <div style="background:#f5f5f5;border:1px solid #e6e6e6;padding:20px;text-align:center;font-family:'Courier New',monospace;font-size:28px;letter-spacing:0.4em;color:#222222;">
                  ${code}
                </div>
                <p style="margin:20px 0 0 0;font-size:12px;line-height:1.5;color:#727272;">
                  Si no intentaste iniciar sesión, puedes ignorar este correo. Nadie podrá acceder sin este código.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e6e6e6;background:#f5f5f5;">
                <p style="margin:0;font-size:11px;color:#b6b6b6;letter-spacing:0.1em;">
                  Correo automático — no responder.
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
