# ARShop · Base de datos

Esquema para Supabase (PostgreSQL 15+).

## Estructura de archivos

| Archivo | Propósito |
|---|---|
| `schema.sql` | **Estado FINAL** de tablas, enums, índices, triggers (resultado tras aplicar todas las migraciones). Si creas una DB nueva, con este basta. |
| `functions.sql` | RPCs base (decremento atómico de stock, etc.) |
| `rls.sql` | Políticas Row-Level Security |
| `seed.sql` | Catálogo mínimo para probar la API |
| `data/co_city_centroids.sql` | Centroides de ciudades para asignación de domiciliarios |
| `migrations/*.sql` | Deltas incrementales. Aplicarlos en orden si tu DB ya existe. |

## Cómo instalar

### DB nueva (recomendado)

```bash
psql $DATABASE_URL -f schema.sql
psql $DATABASE_URL -f functions.sql
psql $DATABASE_URL -f rls.sql
psql $DATABASE_URL -f data/co_city_centroids.sql
# migraciones que agregan tablas/funciones no incluidas aún en schema.sql:
psql $DATABASE_URL -f migrations/010_delivery_schema.sql
psql $DATABASE_URL -f migrations/011_delivery_rls.sql
psql $DATABASE_URL -f migrations/012_delivery_bilateral.sql
psql $DATABASE_URL -f migrations/013_dispute_resolution.sql
psql $DATABASE_URL -f migrations/014_verify_code_lockout.sql
psql $DATABASE_URL -f migrations/015_product_images_unsplash.sql
psql $DATABASE_URL -f migrations/016_assign_delivery_skip_locked.sql
psql $DATABASE_URL -f migrations/017_stock_reservations.sql
psql $DATABASE_URL -f migrations/018_flash_drops.sql
psql $DATABASE_URL -f migrations/019_stock_notifications.sql
psql $DATABASE_URL -f migrations/020_bono_on_delivered.sql
psql $DATABASE_URL -f migrations/021_sync_product_variants.sql
psql $DATABASE_URL -f seed.sql   # opcional
```

Luego promueve al menos un admin:
```sql
update public.profiles set role = 'ADMIN' where id = '<uuid>';
```

### DB existente

Aplica solo las migraciones nuevas desde la última ejecutada. Las migraciones son **idempotentes** (usan `create … if not exists`, `add column if not exists`, `drop policy if exists`), así que reaplicarlas es seguro.

## Historial de migraciones

| # | Nombre | Qué introduce |
|---|---|---|
| 001 | `shipping_rates` | Tabla `shipping_rates` con tarifas por departamento |
| 002 | `charge_currency` | Columna `orders.charge_currency` (COP/USD/EUR real cobrada) |
| 003 | `user_mfa` | Tabla para TOTP + email code MFA |
| 010 | `delivery_schema` | Tablas `domiciliarios`, `recibido`; agrega `REPARTIDOR` al enum `user_role`; columnas delivery_* en `orders` |
| 011 | `delivery_rls` | RLS para repartidores |
| 012 | `delivery_bilateral` | Flujo de disputa cliente ↔ repartidor |
| 013 | `dispute_resolution` | Columnas de resolución admin para disputas |
| 014 | `verify_code_lockout` | Lockout por intentos fallidos del código 4 dígitos |
| 015 | `product_images_unsplash` | Backfill de imágenes |
| 016 | `assign_delivery_skip_locked` | RPC `assign_delivery` con `SKIP LOCKED` |
| 017 | `stock_reservations` | Tabla + RPCs `reserve/confirm/release_reservation` para evitar oversell |
| 018 | `flash_drops` | Columnas `drop_starts_at` / `drop_ends_at` |
| 019 | `stock_notifications` | Suscripciones "avísame cuando regrese" |
| 020 | `bono_on_delivered` | Cálculo automático de bono para repartidor al marcar DELIVERED |
| 021 | `sync_product_variants` | RPC transaccional para sincronizar variantes del admin |

**Numeración:** 004–009 están reservadas intencionalmente para refactors que nunca se materializaron. `_apply_016_to_019.sql` es un bundle que agrupa las migraciones 016–019 para aplicar en una sola corrida (útil cuando la Supabase SQL Editor no acepta múltiples archivos).

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

- **profiles**: usuario lee/actualiza el suyo · admin lee todos
- **addresses**: usuario CRUD sobre las suyas · admin lee todas
- **products / product_variants**: anónimo lee activos · admin CRUD
- **orders / order_items**: usuario lee los suyos · insert solo con `user_id = auth.uid()` y `habeas_data_accepted = true` · admin lee todos y actualiza estado
- **audit_logs**: solo admin lee; inserts los hace el backend con `service_role`
- **domiciliarios, recibido, delivery_bonos, delivery_pin, stock_reservations, stock_notifications**: según rol (ver `migrations/011_delivery_rls.sql`)

El cliente `service_role` del backend bypassa RLS — nunca exponer esa key al frontend.

## RPCs clave

- `decrement_variant_stock(p_items jsonb)` — decremento atómico con `FOR UPDATE`. Usado por el webhook legacy y refunds.
- `reserve_variant_stock(p_order_id, p_items, p_ttl_minutes)` — reserva con TTL al crear la orden.
- `confirm_reservation(p_order_id)` — convierte reservas en decremento real tras payment success.
- `release_reservation(p_order_id)` — libera reservas sin tocar stock (cancelaciones / payment failed).
- `restore_variant_stock(p_items jsonb)` — espejo de decrement, para refunds.
- `consume_order_qr(p_order_id, p_jti)` — marca QR consumido en una sola operación atómica.
- `consume_order_client_code(p_order_id, p_hash)` — alterna QR cuando el cliente dicta código.
- `assign_delivery(p_order_id)` — asigna domiciliario respetando geografía, usando `SKIP LOCKED` para evitar race con múltiples checkouts.
- `sync_product_variants(p_product_id, p_items jsonb)` — upsert transaccional de variantes para el admin.
