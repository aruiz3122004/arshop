# ARShop · API

API NestJS 10 + Supabase + Stripe + BullMQ + Resend. Contiene toda la lógica de negocio del e-commerce: autenticación, catálogo, inventario, pagos, entregas, reseñas, facturación e integraciones.

> Para la visión completa del producto, la instalación desde cero y el frontend, consulta el [README raíz](../README.md).

## Stack

| Pieza | Librería |
|---|---|
| Framework | NestJS 10 (Express) |
| DB + Auth | Supabase (Postgres + Auth) via `@supabase/supabase-js` |
| Pagos | Stripe PaymentIntents + webhooks firmados |
| Correo | Resend |
| Colas | BullMQ sobre Redis (con fallback directo en desarrollo) |
| Rate limiting | `@nestjs/throttler` |
| Validación | `class-validator` + `class-transformer` |
| Config | `@nestjs/config` + Zod |

## Setup

Desde la raíz del monorepo:

```bash
pnpm install
cp backend/.env.example backend/.env
# Edita backend/.env con Supabase, Stripe y Resend
pnpm dev:all
```

También puedes levantar sólo la API:

```bash
pnpm dev:backend
# → http://localhost:4000
# → GET /health devuelve 200
```

Si quieres Redis local:

```bash
cd backend
docker compose up -d redis
```

Sin Redis, la API arranca igual y usa el fallback en memoria (login, lockout, rate limiting, MFA y envío directo de correos).

### Variables de entorno

Todas están documentadas en [`backend/.env.example`](./.env.example) y validadas con Zod en [`src/config/env.validation.ts`](./src/config/env.validation.ts). Las críticas son:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM`
- `REDIS_HOST`, `REDIS_PORT`
- `QR_HMAC_SECRET` (obligatorio y aleatorio en producción)

### Stripe webhook en local

```bash
stripe listen --forward-to localhost:4000/payments/webhook
# copia el whsec_... que imprime a STRIPE_WEBHOOK_SECRET en backend/.env
```

## Módulos

```text
src/
├── main.ts                      # bootstrap, helmet, raw body, guards globales
├── app.module.ts                # módulos, throttler, BullMQ
├── config/                      # validación Zod de variables de entorno
├── common/                      # decorators, guards, filters, interceptors, logger Pino
├── supabase/                    # cliente admin (service_role) + Auth
├── redis/                       # caché y rate limit con fallback a memoria
└── modules/
    ├── auth/                    # login, cookies httpOnly, refresh, MFA, verify/resend
    ├── users/                   # perfiles, direcciones, CRUD admin
    ├── products/                # catálogo, variantes, drops, imágenes
    ├── inventory/               # reservas FOR UPDATE + limpieza de expiradas
    ├── orders/                  # checkout, estados, RMA/retracto (Ley 1480)
    ├── payments/                # PaymentIntents, webhooks, reembolsos, disputas
    ├── delivery/                # QR/PIN, bonos, asignación, provisioning
    ├── reviews/                 # reseñas verificadas y moderación
    ├── guest/                   # tokens HMAC para compras sin cuenta
    ├── invoicing/               # DIAN: emisión, numeración, XML/CUFE, notas crédito
    ├── notifications/           # BullMQ + Resend (templates/ y processors/)
    ├── push/                    # Web Push (VAPID)
    ├── search/                  # Elasticsearch o motor full-text en memoria
    ├── qr/                      # firma y consumo de QR de entrega
    ├── uploads/                 # signed URLs de Supabase Storage
    ├── exchange-rates/          # tasas COP/USD/EUR
    ├── audit-logs/              # auditoría administrativa
    └── health/                  # liveness
```

## Comportamientos clave

- **Autenticación**: cookies `httpOnly` con refresh rotation y refresh transparente en servidor. El guard valida HS256 y ES256 (JWKS de Supabase) en local, con fallback remoto.
- **MFA**: TOTP, código por email y códigos de respaldo. La sesión pendiente dura 15 minutos y se cifra con AES-256-GCM, por lo que sobrevive reinicios y cold starts.
- **Resiliencia**: si Redis/BullMQ no está disponible, los correos se envían directo por Resend y la indexación de catálogo se ejecuta inline. El servicio de Redis conmuta a memoria sin devolver 500.
- **Webhooks**: Stripe se verifica con firma HMAC y transición de estado antes de ejecutar reembolsos o notas crédito.
- **Idempotencia**: `Idempotency-Key` en checkout, `jobId` determinista en correos y `unique(order_id)` en facturas.
- **Facturación**: `DIAN_SIMULATED` por defecto; nunca bloquea el pago. Ver [`docs/FACTURACION_DIAN.md`](../docs/FACTURACION_DIAN.md).

## Pruebas

```bash
pnpm --filter @arshop/api test
pnpm --filter @arshop/api typecheck
```

Suite actual: **19 suites · 90 pruebas** (Jest + Supertest). Ver el detalle en el [README raíz](../README.md#pruebas).

## Observaciones

- El **webhook de Stripe** usa el `rawBody` que expone `NestFactory.create({ rawBody: true })`. Si pones un reverse proxy delante, evita que re-serialice el cuerpo o la firma no coincidirá.
- El decremento de stock vive en **RPCs SQL** (`decrement_variant_stock`, `reserve_variant_stock`) para garantizar atomicidad con `SELECT ... FOR UPDATE`.
- `AuditLogsService.record` es best-effort: si falla el insert, se loguea y la operación principal sigue.
- Los logs son NDJSON (Pino) con `x-request-id` y redacción de campos sensibles.
