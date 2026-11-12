# Cold start del backend y carga de la zona de login

## El problema

El backend corre en **Render free**, que apaga la instancia a los ~15 minutos
sin tráfico. La primera request después del apagón paga el arranque completo
(Nest + Supabase + Redis): **20–50 s**.

Eso se sentía especialmente mal en `/cuenta`, porque el `AuthProvider` no
pintaba nada hasta resolver `GET /users/me`:

```
Usuario entra a /cuenta
   └─ "Cargando cuenta..."  ← 20-50s esperando a que Render despierte
        └─ recién ahí veía el formulario de login
```

Peor aún: quien *no* tenía sesión también disparaba `GET /users/me` +
`POST /auth/refresh` contra una instancia dormida, sin necesidad.

## Qué cambió

| # | Cambio | Archivo |
|---|---|---|
| 1 | **Cookie testigo `arshop_auth`** (legible por JS): el front sabe si hay sesión sin preguntarle al backend | `backend/src/modules/auth/auth-cookies.ts` |
| 2 | **Bootstrap sin red**: sin cookie → el formulario de login aparece de inmediato y la sesión se revalida en background | `apps/web/src/lib/auth.tsx` |
| 3 | **Perfil cacheado** (`localStorage`): con cookie testigo se hidrata la cuenta al instante y luego se revalida | `apps/web/src/lib/session-cache.ts` |
| 4 | **Warm-up desde el HTML**: un script inline dispara `GET /health` durante el parseo, antes de hidratar React | `apps/web/src/app/layout.tsx` |
| 5 | **Keep-alive de pestaña**: ráfaga de pings con hasta 3 reintentos (25 s por intento) cada 10 min y al volver a la pestaña | `apps/web/src/lib/backend-warmup.ts` |
| 6 | **Aviso de espera**: si el login tarda > 3 s, se explica ("Despertando el servidor…") en vez de un spinner mudo | `apps/web/src/app/cuenta/page.tsx` |
| 7 | **Redirects protegidos** esperan al probe de sesión (`sessionChecked`), así un `user` nulo transitorio no expulsa al admin/repartidor | `apps/web/src/app/admin/layout.tsx`, `apps/web/src/app/domiciliario/layout.tsx` |
| 8 | **Cron de keep-alive** en GitHub Actions cada 10 min | `.github/workflows/keepalive.yml` |

Reglas de diseño que quedaron:

- La sesión cacheada **no es fuente de verdad**: si `/users/me` responde
  401/403 se limpia todo. Un 500, un timeout o un cold start **no**
  desconecta al usuario.
- `apiFetch` ahora adjunta `err.status` para poder distinguir "sin sesión" de
  "fallo transitorio".
- Nunca se bloquea la UI por una request que puede tardar 40 s.

## Configuración necesaria (1 minuto)

En GitHub → **Settings → Secrets and variables → Actions → Variables**:

| Nombre | Valor |
|---|---|
| `BACKEND_HEALTH_URL` | `https://<tu-servicio>.onrender.com/health` |

Sin esa variable el workflow termina sin error (sólo avisa por warning). Es la
pieza que elimina el cold start de raíz: Render duerme a los 15 min y el cron
lo toca cada 10, así que nunca se apaga.

> Nota: el cron de GitHub Actions es *best-effort* (puede demorarse unos
> minutos bajo carga y se desactiva tras 60 días sin actividad en el repo).
> Si necesitas garantía total, un Cloudflare Worker con Cron Trigger cada 5
> min hace lo mismo con más precisión, o directamente se sube Render a
> **Starter** (sin sleep).

### Sobre el proxy de Vercel

El warm-up pega contra `/api/health` (same-origin) y Vercel lo reescribe a
`BACKEND_URL`. Si la función de Vercel corta la request antes de que Render
termine de arrancar, **la instancia sigue despertando igual**; por eso el
warm-up reintenta hasta 3 veces (25 s por intento) en vez de darse por vencido.
El script inline del layout hace un primer disparo sin reintentos y el
`AuthProvider` arranca la ráfaga completa al montar.

## Cómo verificarlo

1. **Sin sesión**: abrir `/cuenta` con el backend dormido → el formulario de
   login debe aparecer de inmediato (sin "Cargando cuenta...").
2. **Con sesión**: primer login, recargar `/cuenta` → la cuenta se pinta con
   el perfil cacheado y se refresca sola.
3. **Cold start**: enviar el login con el backend dormido → a los 3 s debe
   aparecer "Despertando el servidor…".
4. **Cron**: Actions → *Backend keep-alive* → *Run workflow* y ver el `200`.
