# Correos transaccionales y de autenticación

Todo el correo saliente de ARShop debe salir desde el dominio verificado
`arshop.arc03.online` (Cloudflare DNS + Resend). Si algo se envía por fuera de
ese dominio, pierde branding y baja la entregabilidad.

## Quién envía qué

| Correo | Emisor | Cómo |
|---|---|---|
| Confirmación de pedido, reembolso, back-in-stock, aviso de entrega, alertas operativas, código 2FA por email | **API (Resend directo)** | `backend/src/modules/notifications/processors/email.processor.ts` usando `RESEND_FROM` |
| Recuperación de contraseña | **API (Resend directo)** | `auth.service.ts` → `generateLink()` + `AuthMailerService` (`templates/auth-recovery.ts`) |
| Confirmación de cuenta (`signup`) y reenvío | **API (Resend directo)** | `auth.service.ts` → `generateLink({type:"signup"})` + `AuthMailerService` (`templates/auth-verify.ts`). Sólo con `REQUIRE_EMAIL_VERIFY=true` |

> El correo de recuperación ya **no** lo manda Supabase. Antes llegaba como
> `Supabase Auth · "Reset your password"`, en inglés y desde la infraestructura
> compartida de Supabase. Ahora la API genera el enlace con la Admin API
> (`admin.generateLink`, que no envía nada) y lo despacha por Resend con
> `no-reply@arshop.arc03.online` y texto en español. Si `generateLink` o Resend
> fallan, se cae automáticamente al mailer de Supabase para no romper el flujo.
>
> La confirmación de cuenta sigue el mismo camino desde el fix de registro:
> `generateLink({type:"signup"})` + Resend, con enlace **y** código OTP (para
> abrirlo desde otro dispositivo en `/verificar`). Supabase no emite este correo.
> Ojo: el mailer por defecto de Supabase sólo entrega a miembros del equipo y
> está limitado a ~2 correos/hora; por eso se evita por completo.

## SMTP personalizado en Supabase (sólo si hace falta)

Si algún día algún flujo de Supabase Auth debe emitir correo por su cuenta
(magic links, invitaciones desde el dashboard), configura Resend como SMTP.
Para el alta normal y la recuperación **no es necesario**.

## SMTP personalizado en Supabase (para lo que aún envía Supabase)

Supabase → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) o `587` (STARTTLS) |
| Username | `resend` |
| Password | la misma `RESEND_API_KEY` del backend (`re_...`) |
| Sender email | `no-reply@arshop.arc03.online` |
| Sender name | `ARShop` |

Con eso, cualquier correo que siga emitiendo Supabase Auth (confirmación de
cuenta, magic links, invitaciones) sale por el dominio propio y con SPF/DKIM
válidos.

### Plantillas en español

En **Authentication → Emails → Templates** reemplaza el texto por defecto
(inglés) por estos. Todas deben conservar `{{ .ConfirmationURL }}`.

**Confirm signup** — asunto `Confirma tu cuenta · ARShop`

```html
<h2>Confirma tu cuenta</h2>
<p>Falta un paso para activar tu cuenta ARShop. Confirma tu correo con el botón de abajo.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi correo</a></p>
<p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
```

**Reset password** — asunto `Restablece tu contraseña · ARShop`

```html
<h2>Restablece tu contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta ARShop.</p>
<p><a href="{{ .ConfirmationURL }}">Elegir nueva contraseña</a></p>
<p>El enlace expira en 1 hora y sólo puede usarse una vez. Si no lo solicitaste, ignora este correo.</p>
```

> Nota: en el flujo normal este template no se usa (lo reemplaza el correo de
> Resend que envía la API), pero sirve como red de seguridad si se dispara el
> fallback.

## Variables de entorno

```env
RESEND_API_KEY=re_...
RESEND_FROM="ARShop <no-reply@arshop.arc03.online>"
# Opcional: redirige TODO el correo saliente a un buzón de pruebas.
RESEND_SANDBOX_TO=
# URL pública del frontend. Define a dónde apunta el enlace de recuperación.
APP_URL=http://localhost:3000
```

`RESEND_API_KEY` y `RESEND_FROM` son obligatorias (Zod falla el arranque si
faltan). `RESEND_SANDBOX_TO` prefija los asuntos con `[Sandbox → email]` para
que sea evidente que el destinatario real es otro.

### `APP_URL` y el enlace de recuperación

El enlace del correo es un `.../auth/v1/verify?token=...&type=recovery&redirect_to=...`.
El token lo valida Supabase y **después** redirige a `redirect_to`, que se arma
como `${APP_URL}/recuperar`. Por eso:

| Entorno | `APP_URL` |
|---|---|
| Local | `http://localhost:3000` → el enlace sólo abre en tu máquina |
| Producción (Render) | `https://arshop.co` (o el dominio real de Vercel) |

Además hay que **allowlistear** ese destino en Supabase →
**Authentication → URL Configuration → Redirect URLs** (`http://localhost:3000/**`
para dev y `https://arshop.co/**` en producción; `https://*.vercel.app/**` si
quieres probar previews). Si el destino no está permitido, Supabase ignora
`redirect_to` y manda al *Site URL*, que es la causa típica de "el enlace me
lleva a otra parte".

> Un enlace generado en local no sirve en otro dispositivo: el `verify` de
> Supabase sí abre, pero al final redirige a `localhost:3000` del dispositivo
> donde se abra. Para probar desde el celular, pon `APP_URL` con la IP de tu
> máquina en la LAN (`http://192.168.x.x:3000`) y agrega esa URL en Supabase.

## Checklist al desplegar

1. Dominio `arshop.arc03.online` verificado en Resend (DKIM/SPF/DMARC en
   Cloudflare en modo *DNS only*).
2. `RESEND_FROM` apuntando a ese dominio.
3. SMTP personalizado de Supabase configurado con la misma API key.
4. `APP_URL` con el dominio público del frontend y ese mismo destino en
   *Redirect URLs* de Supabase.
5. Enviar una prueba real de "olvidé mi contraseña" y verificar remitente,
   idioma y que el enlace abre `/recuperar` con el formulario de nueva
   contraseña.
