-- ═══════════════════════════════════════════════════════════════════════════
-- assign_delivery: locks a nivel de fila con SKIP LOCKED
--
-- Problema previo: dos llamadas concurrentes a assign_delivery con pool
-- pequeño podían elegir al mismo domiciliario por azar del `ORDER BY random()`,
-- aunque hubiera otros libres. Pésima distribución; además queda frágil
-- ante cualquier futura regla "N pedidos máximos por domiciliario".
--
-- Fix: `FOR UPDATE OF d SKIP LOCKED` en los dos SELECT que eligen candidato.
-- Si otra transacción ya tomó una fila, Postgres salta a la siguiente —
-- no espera, no reintenta, no da deadlock. El `LIMIT 1` se cumple con la
-- siguiente fila disponible.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.assign_delivery(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_dept text;
  v_city text;
  v_delivery record;
  v_bono_base integer := 30000;
  v_free_radius numeric := 15;
  v_lat_order double precision;
  v_lng_order double precision;
  v_km numeric;
  v_bono integer;
begin
  select shipping_department, shipping_city
    into v_dept, v_city
    from public.orders where id = p_order_id;
  if v_dept is null then
    raise exception 'order % not found or missing shipping_department', p_order_id;
  end if;

  -- 1) Match exacto departamento + ciudad (lock por fila para distribución justa)
  select d.id into v_delivery
    from public.domiciliarios d
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
     and lower(d.ciudad) = lower(v_city)
   order by random()
   limit 1
   for update of d skip locked;

  if found then
    update public.orders
       set delivery_id = v_delivery.id,
           delivery_status = 'ASSIGNED',
           delivery_warning = null,
           delivery_city = v_city,
           estimated_delivery_at = public.add_business_days(current_date, 10)
     where id = p_order_id;

    return jsonb_build_object(
      'delivery_id', v_delivery.id,
      'status', 'ASSIGNED',
      'estimated_delivery_at', public.add_business_days(current_date, 10),
      'warning', null,
      'km_extra', 0,
      'bono_cop', 0,
      'motivo', 'match_exacto'
    );
  end if;

  -- 2) Mismo departamento, ciudad distinta — el más cercano (lock por fila de d)
  select c.lat, c.lng into v_lat_order, v_lng_order
    from public.co_city_centroids c
   where lower(c.departamento) = lower(v_dept) and lower(c.ciudad) = lower(v_city)
   limit 1;

  select d.id,
         c.lat, c.lng,
         public.haversine_km(coalesce(v_lat_order, c.lat), coalesce(v_lng_order, c.lng), c.lat, c.lng) as dist
    into v_delivery
    from public.domiciliarios d
    left join public.co_city_centroids c
      on lower(c.departamento) = lower(d.departamento) and lower(c.ciudad) = lower(d.ciudad)
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
   order by dist nulls last
   limit 1
   for update of d skip locked;

  if found then
    if v_lat_order is null or v_delivery.lat is null then
      v_km := 20;
    else
      v_km := public.haversine_km(v_lat_order, v_lng_order, v_delivery.lat, v_delivery.lng);
    end if;

    if v_km <= v_free_radius then
      v_bono := 0;
    else
      v_bono := v_bono_base * ceil(v_km - v_free_radius)::integer;
    end if;

    update public.orders
       set delivery_id = v_delivery.id,
           delivery_status = 'REASSIGNED_DEPT',
           delivery_warning = 'La entrega puede llegar con 2-3 días de retraso',
           delivery_city = v_city,
           estimated_delivery_at = public.add_business_days(current_date, 13)
     where id = p_order_id;

    if v_bono > 0 then
      insert into public.delivery_bonos (domiciliario_id, order_id, base_cop, km_extra, bono_cop, motivo)
      values (v_delivery.id, p_order_id, v_bono_base, round(v_km::numeric, 2), v_bono,
              format('Reasignación entre ciudades del depto %s', v_dept))
      on conflict (order_id) do nothing;
    end if;

    return jsonb_build_object(
      'delivery_id', v_delivery.id,
      'status', 'REASSIGNED_DEPT',
      'estimated_delivery_at', public.add_business_days(current_date, 13),
      'warning', 'La entrega puede llegar con 2-3 días de retraso',
      'km_extra', round(v_km::numeric, 2),
      'bono_cop', v_bono,
      'motivo', 'reasignacion_depto'
    );
  end if;

  -- 3) Ningún domiciliario disponible
  update public.orders
     set delivery_id = null,
         delivery_status = 'UNASSIGNED',
         delivery_warning = 'Tu pedido está en espera de asignación de domiciliario',
         delivery_city = v_city,
         estimated_delivery_at = public.add_business_days(current_date, 13)
   where id = p_order_id;

  return jsonb_build_object(
    'delivery_id', null,
    'status', 'UNASSIGNED',
    'estimated_delivery_at', public.add_business_days(current_date, 13),
    'warning', 'Tu pedido está en espera de asignación de domiciliario',
    'km_extra', 0,
    'bono_cop', 0,
    'motivo', 'sin_disponibilidad'
  );
end;
$$;

grant execute on function public.assign_delivery(uuid) to service_role;
-- ═══════════════════════════════════════════════════════════════════════════
-- Reserva de stock con TTL
--
-- Problema: hoy OrdersService.create solo CHEQUEA stock; el decremento
-- ocurre en el webhook de Stripe. Entre ambos pasos, dos usuarios pueden
-- aceptar precios y empezar a pagar sobre el mismo stock=1 → al confirmarse
-- el segundo, falla el decremento (cobro sin producto).
--
-- Solución: al crear PENDING_PAYMENT reservamos stock N minutos. El stock
-- disponible mostrado al público = stock físico − reservas activas.
-- Si no se paga en 15 min, la reserva expira y el stock vuelve a estar libre.
-- Al pagar, convertimos la reserva en decremento real.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.stock_reservations (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  order_id   uuid not null references public.orders(id) on delete cascade,
  qty        integer not null check (qty > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (order_id, variant_id)
);

create index if not exists idx_stock_reservations_variant_expires
  on public.stock_reservations (variant_id, expires_at);
create index if not exists idx_stock_reservations_order
  on public.stock_reservations (order_id);

-- ───────────────────────── reserve_variant_stock ─────────────────────────
-- Lock por fila sobre la variante (FOR UPDATE) para serializar reservas
-- concurrentes. Si el disponible (stock − reservas activas de OTRAS órdenes)
-- es menor que lo pedido, levanta 'insufficient stock' y aborta todo.
--
-- Idempotente respecto a (p_order_id, variant_id): un reintento con la
-- misma orden reemplaza la reserva previa.
create or replace function public.reserve_variant_stock(
  p_order_id uuid,
  p_items jsonb,
  p_ttl_minutes integer default 15
) returns void
language plpgsql
security definer
as $$
declare
  item jsonb;
  v_variant_id uuid;
  v_qty int;
  v_current int;
  v_reserved int;
  v_available int;
  v_expires timestamptz;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes <= 0 then
    raise exception 'p_ttl_minutes must be positive';
  end if;

  v_expires := now() + make_interval(mins => p_ttl_minutes);

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (item->>'variant_id')::uuid;
    v_qty := (item->>'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid qty for variant %', v_variant_id;
    end if;

    -- Lock de la variante para serializar
    select stock into v_current
      from public.product_variants
     where id = v_variant_id
     for update;
    if v_current is null then
      raise exception 'variant % not found', v_variant_id;
    end if;

    -- Reservas activas de OTRAS órdenes (la propia no cuenta, para
    -- permitir reintentos de la misma orden sin inflar el reservado)
    select coalesce(sum(qty), 0) into v_reserved
      from public.stock_reservations
     where variant_id = v_variant_id
       and order_id <> p_order_id
       and expires_at > now();

    v_available := v_current - v_reserved;
    if v_available < v_qty then
      raise exception 'insufficient stock for variant % (available %, need %)',
        v_variant_id, v_available, v_qty;
    end if;

    insert into public.stock_reservations (variant_id, order_id, qty, expires_at)
    values (v_variant_id, p_order_id, v_qty, v_expires)
    on conflict (order_id, variant_id)
      do update set qty = excluded.qty, expires_at = excluded.expires_at;
  end loop;
end;
$$;

-- ───────────────────────── confirm_reservation ─────────────────────────
-- Convierte las reservas de una orden en decremento real.
-- Si la reserva expiró (raro: webhook muy tarde) o el stock físico
-- bajó por mano del admin, lanza 'insufficient stock on confirm' y
-- aborta — el controlador debe disparar el auto-refund.
create or replace function public.confirm_reservation(
  p_order_id uuid
) returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select variant_id, qty from public.stock_reservations
     where order_id = p_order_id
     for update
  loop
    update public.product_variants
       set stock = stock - r.qty
     where id = r.variant_id
       and stock >= r.qty;
    if not found then
      raise exception 'insufficient stock on confirm for variant %', r.variant_id;
    end if;
  end loop;
  delete from public.stock_reservations where order_id = p_order_id;
end;
$$;

-- ───────────────────────── release_reservation ─────────────────────────
-- Elimina las reservas sin tocar stock. Para cancelaciones de órdenes
-- aún no cobradas y para el camino de auto-refund en el webhook.
create or replace function public.release_reservation(
  p_order_id uuid
) returns void
language plpgsql
security definer
as $$
begin
  delete from public.stock_reservations where order_id = p_order_id;
end;
$$;

grant execute on function public.reserve_variant_stock(uuid, jsonb, integer) to service_role;
grant execute on function public.confirm_reservation(uuid) to service_role;
grant execute on function public.release_reservation(uuid) to service_role;
-- ═══════════════════════════════════════════════════════════════════════════
-- Flash sales / drops limitados
--
-- Columnas drop_starts_at/drop_ends_at para delimitar ventana de venta.
-- Vista product_variants_available expone stock disponible real
-- (físico menos reservas activas) para el UI "quedan N".
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.products
  add column if not exists drop_starts_at timestamptz,
  add column if not exists drop_ends_at   timestamptz;

-- Check: si ambas están, start < end
alter table public.products drop constraint if exists products_drop_window_valid;
alter table public.products add constraint products_drop_window_valid
  check (
    drop_starts_at is null
    or drop_ends_at is null
    or drop_starts_at < drop_ends_at
  );

create index if not exists idx_products_drop_window
  on public.products (drop_ends_at)
  where drop_ends_at is not null;

-- Vista: stock disponible = físico − reservas activas.
-- Usada por el endpoint /products/:slug/availability y, en el futuro,
-- por los filtros "solo con stock" del catálogo.
create or replace view public.product_variants_available as
select pv.id,
       pv.product_id,
       pv.size,
       pv.color_name,
       pv.color_hex,
       pv.sku,
       pv.stock as physical_stock,
       pv.stock - coalesce((
         select sum(sr.qty)
         from public.stock_reservations sr
         where sr.variant_id = pv.id and sr.expires_at > now()
       ), 0) as available_stock,
       pv.created_at
from public.product_variants pv;

grant select on public.product_variants_available to anon, authenticated, service_role;
-- ═══════════════════════════════════════════════════════════════════════════
-- Backorder / notify-when-available
--
-- Tabla simple: cada fila es una suscripción activa (notified_at NULL) o
-- consumida (notified_at timestamp). Un usuario sólo puede tener UNA
-- suscripción activa por variante — enforced con índice único parcial.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.stock_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);

create unique index if not exists uniq_stock_notifications_active
  on public.stock_notifications (user_id, variant_id)
  where notified_at is null;

create index if not exists idx_stock_notifications_variant_pending
  on public.stock_notifications (variant_id)
  where notified_at is null;
