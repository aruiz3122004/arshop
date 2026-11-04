# ARShop · API

NestJS modular + Supabase + Stripe + BullMQ + Resend. Toda la lógica de negocio del e-commerce vive aquí.

## Stack

| Pieza | Librería |
|---|---|
| Framework | NestJS 10 (Express) |
| DB + Auth | Supabase (Postgres + Auth) via `@supabase/supabase-js` |
| Pagos | Stripe PaymentIntents + webhooks firmados |
| Correo | Resend |
| Colas | BullMQ sobre Redis |
| Rate limiting | `@nestjs/throttler` |
| Validación | `class-validator` + `class-transformer` |
| Config | `@nestjs/config` + Zod |

## Setup

```bash
# 1. Dependencias
pnpm install   # o npm install / yarn install

# 2. Copia el .env
cp .env.example .env
# Edita .env con tus credenciales de Supabase/Stripe/Resend

# 3. Aplica el schema a Supabase
#    (ver /db/README.md)

# 4. Levanta Redis
docker compose up -d redis

# 5. Arranca la API
pnpm start:dev
# → http://localhost:4000
# → GET /health devuelve 200
```

### Variables de entorno

Todas documentadas en `.env.example`. Las críticas son:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM`
- `REDIS_HOST`, `REDIS_PORT`

El validador Zod (`src/config/env.validation.ts`) tira error al arrancar si falta cualquiera.

### Stripe webhook en local

```bash
# instala el CLI de Stripe
stripe listen --forward-to localhost:4000/payments/webhook
# copia el whsec_... que te imprime a STRIPE_WEBHOOK_SECRET en .env
```

## Rutas

Todas requieren JWT Bearer salvo las marcadas con `@Public()`.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/health` | público | Liveness |
| POST | `/auth/sign-up` | público · 5/min | Registro |
| POST | `/auth/sign-in` | público · 5/min | Login (devuelve access + refresh tokens) |
| POST | `/auth/refresh` | público · 10/min | Refresh access token |
| POST | `/auth/sign-out` | auth | Cierra sesión del Bearer actual |
| GET | `/users/me` | auth | Perfil del usuario |
| PATCH | `/users/me` | auth | Actualiza nombre/teléfono |
| GET | `/users` | admin | Lista todos (cursor pagination) |
| PATCH | `/users/:id/block` | admin | Bloquea una cuenta |
| PATCH | `/users/:id/unblock` | admin | Desbloquea |
| GET | `/products` | público | Lista con filtros `gender`, `category`, `q`, `minPrice`, `maxPrice`, `limit`, `cursor` |
| GET | `/products/:slug` | público | Detalle + variantes |
| POST | `/products` | admin | Crea producto + variantes |
| PATCH | `/products/:id` | admin | Actualiza |
| DELETE | `/products/:id` | admin | Elimina |
| POST | `/orders` | auth · 5/min | Crea orden (requiere `habeasDataAccepted: true`) |
| GET | `/orders/mine` | auth | Mis órdenes |
| GET | `/orders/:id` | auth | Detalle de orden propia |
| GET | `/orders` | admin | Todas las órdenes |
| PATCH | `/orders/:id/ship` | admin | Marca ENVIADA |
| PATCH | `/orders/:id/deliver` | admin | Marca ENTREGADA |
| POST | `/payments/intent` | auth | Crea PaymentIntent para una orden propia |
| POST | `/payments/webhook` | público · firma | Stripe webhook (verifica stripe-signature) |
| GET | `/audit-logs` | admin | Registro de auditoría |

## Flujo del checkout

```
Frontend                 API                        Supabase       Stripe        Resend
   │                      │                            │             │             │
   │ POST /orders         │                            │             │             │
   │ (habeasData=true)    │ insert orders+items        │             │             │
   │ ◄──── 201 ────────── │ ──────────► PENDING_PAYMENT│             │             │
   │                      │                            │             │             │
   │ POST /payments/intent│                            │             │             │
   │ ◄── clientSecret ─── │ ──────── create intent ──► │             │             │
   │                      │                            │             │             │
   │ Stripe Elements      │                            │             │             │
   │ confirms card ─────────────────────────────────────────────►   │             │
   │                      │                            │             │             │
   │                      │ ◄── webhook payment_intent.succeeded ──  │             │
   │                      │ verify stripe-signature                  │             │
   │                      │ update order → PAID                      │             │
   │                      │ call RPC decrement_variant_stock         │             │
   │                      │ enqueue(email)                           │             │
   │                      │                            │             │             │
   │                      │ Worker consume job ──────────────────────────────────► │
   │                      │                            │             │   send mail │
```

## Estructura

```
src/
├── main.ts                      # bootstrap, pipes, guards, helmet, raw body
├── app.module.ts                # importa todo + ThrottlerModule + BullModule
├── config/
│   └── env.validation.ts        # Zod schema → fail-fast
├── common/
│   ├── decorators/              # @Public, @Roles, @CurrentUser
│   ├── guards/                  # SupabaseAuthGuard, RolesGuard
│   ├── filters/                 # AllExceptionsFilter
│   ├── interceptors/            # LoggingInterceptor
│   └── types/                   # AuthenticatedUser
├── supabase/
│   └── supabase.service.ts      # cliente admin (service_role) + user-scoped
└── modules/
    ├── health/                  # /health
    ├── auth/                    # sign-up/in/out/refresh
    ├── users/                   # /users/me + admin block
    ├── products/                # list/detail + admin CRUD
    ├── inventory/               # decrementStock via RPC
    ├── orders/                  # create + my/list + admin ship/deliver
    ├── payments/                # PaymentIntent + webhook con firma
    ├── notifications/           # BullMQ queue + Resend processor + templates
    └── audit-logs/              # record() + admin list
```

## Observaciones

- El **webhook de Stripe** usa el `rawBody` que expone `NestFactory.create({ rawBody: true })`. Si pones un reverse proxy delante, asegúrate de que no re-serialice el cuerpo (o la firma no coincidirá).
- `SupabaseAuthGuard` valida JWT llamando a Supabase (`auth.getUser(token)`). Esto hace una red por request. Si la latencia molesta, se puede verificar localmente con `jsonwebtoken` + `SUPABASE_JWT_SECRET`.
- El decremento de stock vive en la **RPC SQL** (`decrement_variant_stock`) para que la transacción incluya `SELECT ... FOR UPDATE`. En Node no se puede garantizar esa atomicidad fácil.
- `AuditLogsService.record` es best-effort — si falla el insert, se loguea y la operación principal sigue. No es aceptable que una auditoría rompa un checkout.
- `createUser` en el signUp usa el admin API con `email_confirm: false`. En producción quizá quieras `true` + flujo de verificación.
