# ARShop · Base de datos

Esquema para Supabase (PostgreSQL 15+).

## Estructura de archivos

| Archivo | Propósito |
|---|---|
| `schema.sql` | Esquema base reproducible: tablas, enums, índices y triggers iniciales. |
| `functions.sql` | RPCs base (decremento/restauración atómica de stock, etc.). |
| `rls.sql` | Políticas Row-Level Security iniciales. |
| `seed.sql` | Catálogo mínimo para probar la API (opcional). |
| `data/co_city_centroids.sql` | Centroides de ciudades para asignación de repartidores. |
| `migrations/*.sql` | Deltas incrementales `001-030`. Se aplican en orden y son idempotentes. |

> `schema.sql` **no** contiene el estado final de todas las migraciones. Para una base nueva hay que aplicarlo como base y después ejecutar todas las migraciones.

## Cómo instalar

### DB nueva (recomendado)

`DATABASE_URL` es la cadena de conexión directa de Postgres (Supabase → *Settings → Database*), no la URL de la API.

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f functions.sql
psql "$DATABASE_URL" -f rls.sql
psql "$DATABASE_URL" -f data/co_city_centroids.sql

for f in $(ls migrations/[0-9]*.sql | sort); do
  psql "$DATABASE_URL" -f "$f"
done

psql "$DATABASE_URL" -f seed.sql   # opcional
```

En PowerShell:

```powershell
psql $env:DATABASE_URL -f schema.sql
psql $env:DATABASE_URL -f functions.sql
psql $env:DATABASE_URL -f rls.sql
psql $env:DATABASE_URL -f data/co_city_centroids.sql

Get-ChildItem migrations/[0-9]*.sql | Sort-Object Name | ForEach-Object {
  psql $env:DATABASE_URL -f $_.FullName
}

psql $env:DATABASE_URL -f seed.sql   # opcional
```

También puedes pegar cada archivo en el **SQL Editor** de Supabase. Aplica los archivos en el orden numérico; `_apply_016_to_019.sql` es un bundle opcional y no debe ejecutarse si ya aplicaste las migraciones individuales.

Luego promueve al menos un admin:

```sql
update public.profiles set role = 'ADMIN' where id = '<uuid>';
```

### DB existente

Aplica sólo las migraciones nuevas desde la última ejecutada. Las migraciones son **idempotentes** (usan `create … if not exists`, `add column if not exists`, `drop policy if exists`), así que reaplicarlas es seguro.

## Historial de migraciones

| # | Nombre | Qué introduce |
|---|---|---|
| 001 | `shipping_rates` | Tabla `shipping_rates` con tarifas por departamento |
| 002 | `charge_currency` | Columna `orders.charge_currency` (COP/USD/EUR real cobrada) |
| 003 | `user_mfa` | Tabla para TOTP + email code MFA |
| 010 | `delivery_schema` | Tablas `domiciliarios`, `recibido`, `delivery_pin`, `delivery_bonos`, `push_subscriptions`, `co_city_centroids`; agrega `REPARTIDOR` al enum `user_role`; columnas `delivery_*` en `orders` |
| 011 | `delivery_rls` | RLS para repartidores |
| 012 | `delivery_bilateral` | Flujo de disputa cliente ↔ repartidor |
| 013 | `dispute_resolution` | Columnas de resolución admin para disputas |
| 014 | `verify_code_lockout` | Lockout por intentos fallidos del código de 4 dígitos |
| 015 | `product_images_unsplash` | Backfill de imágenes |
| 016 | `assign_delivery_skip_locked` | RPC `assign_delivery` con `SKIP LOCKED` |
| 017 | `stock_reservations` | Tabla + RPCs `reserve/confirm/release_reservation` para evitar oversell |
| 018 | `flash_drops` | Columnas `drop_starts_at` / `drop_ends_at` |
| 019 | `stock_notifications` | Suscripciones "avísame cuando regrese" |
| 020 | `bono_on_delivered` | Cálculo automático de bono para repartidor al marcar `DELIVERED` |
| 021 | `sync_product_variants` | RPC transaccional para sincronizar variantes del admin |
| 022 | `mfa_backup_codes` | Códigos de respaldo MFA |
| 023 | `fix_logical_gaps` | Reasignación geográfica, pago tardío y reparación de huecos lógicos |
| 024 | `commercial_gaps` | Cupones, devoluciones/RMA, guías de transportadora y desglose de IVA |
| 025 | `delivery_confirmation_window` | Ventana de confirmación de entregas simuladas (24/48 h) |
| 026 | `delivery_role_sync` | Triggers `profiles.role ↔ domiciliarios` y revocación de escrituras sobre `profiles` |
| 027 | `revoke_client_order_writes` | Revocación de `UPDATE` sobre `orders` para `anon`/`authenticated` |
| 028 | `electronic_invoicing` | Tablas de facturación DIAN, RPC de numeración y columnas fiscales en `orders` |
| 029 | `product_reviews` | Reseñas verificadas por línea de pedido, vista `product_rating_summary` y RLS |
| 030 | `guest_checkout` | `orders.user_id` nullable + `guest_email`, `guest_name`, `is_guest` y check de identidad |

**Numeración:** 004–009 están reservadas intencionalmente para refactors que nunca se materializaron. `_apply_016_to_019.sql` agrupa las migraciones 016–019 para aplicarlas en una sola corrida cuando el SQL Editor no acepta múltiples archivos.

## Convenciones

- Todas las tablas en el schema `public`.
- IDs son `uuid` con `gen_random_uuid()` (requiere `pgcrypto`).
- Precios siempre en **COP enteros** (`price_cop`, `total_cop`, `unit_price_cop`) — sin decimales, sin ambigüedad de moneda.
- `created_at`/`updated_at` en todas las tablas donde tiene sentido; `updated_at` mantenido por trigger.
- Fechas en `timestamptz`.
- Cuando una variante se referencia desde una línea histórica (`order_items`) hacemos **snapshot** del nombre y precio en el momento (`product_name_snapshot`, `unit_price_cop`). Así cambios futuros al catálogo no deforman historial.

## Enums

- `user_role` — `CUSTOMER`, `ADMIN`, `REPARTIDOR`
- `product_gender` — `hombre`, `mujer`
- `order_status` — `PENDING_PAYMENT`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`
- `document_type` — `CC`, `CE`, `PP`, `NIT`
- `address_label` — `casa`, `oficina`, `otro`

## RLS resumen

- **profiles**: usuario lee/actualiza el suyo · admin lee todos · sin escrituras directas desde el cliente
- **addresses**: usuario CRUD sobre las suyas · admin lee todas
- **products / product_variants**: anónimo lee activos · admin CRUD
- **orders / order_items**: usuario lee los suyos · insert sólo con `user_id = auth.uid()` y `habeas_data_accepted = true` · admin lee todos y actualiza estado · sin `UPDATE` directo desde `anon`/`authenticated`
- **audit_logs**: sólo admin lee; inserts los hace el backend con `service_role`
- **domiciliarios, recibido, delivery_bonos, delivery_pin, stock_reservations, stock_notifications**: según rol (ver `migrations/011_delivery_rls.sql`)

El cliente `service_role` del backend bypassa RLS — nunca exponer esa key al frontend.

## RPCs clave

- `decrement_variant_stock(p_items jsonb)` — decremento atómico con `FOR UPDATE`.
- `reserve_variant_stock(p_order_id, p_items, p_ttl_minutes)` — reserva con TTL al crear la orden.
- `confirm_reservation(p_order_id)` — convierte reservas en decremento real tras payment success.
- `release_reservation(p_order_id)` — libera reservas sin tocar stock (cancelaciones / payment failed).
- `restore_variant_stock(p_items jsonb)` — espejo de decrement, para refunds.
- `consume_order_qr(p_order_id, p_jti)` — marca QR consumido en una sola operación atómica.
- `consume_order_client_code(p_order_id, p_hash)` — alterna QR cuando el cliente dicta código.
- `assign_delivery(p_order_id)` — asigna domiciliario respetando geografía, usando `SKIP LOCKED`.
- `sync_product_variants(p_product_id, p_items jsonb)` — upsert transaccional de variantes.
- `next_invoice_number(...)` — consecutivo fiscal atómico para facturación.
