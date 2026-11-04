-- ═══════════════════════════════════════════════════════════════════════════
-- 010_delivery_schema.sql — Sistema de domiciliarios (REPARTIDOR)
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- Requiere que schema.sql ya esté aplicado.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Asegurar enums necesarios. Si schema.sql no fue aplicado todavía,
--    creamos los tipos aquí para que esta migración sea autosuficiente.

-- user_role: lo creamos completo si no existe, o solo le añadimos el valor nuevo.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('CUSTOMER', 'ADMIN', 'REPARTIDOR');
  elsif not exists (
    select 1 from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'REPARTIDOR'
  ) then
    alter type user_role add value 'REPARTIDOR';
  end if;
end $$;

-- document_type: usado por la tabla recibido más abajo.
do $$ begin
  create type document_type as enum ('CC', 'CE', 'PP', 'NIT');
exception when duplicate_object then null; end $$;

-- Helper set_updated_at: lo esperamos de schema.sql pero lo recreamos
-- idempotentemente por si esta migración se corre antes del schema base.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

-- 2) Enum para estados del asignamiento
do $$ begin
  create type delivery_assignment_status as enum (
    'ASSIGNED',          -- asignado al domiciliario que corresponde por depto+ciudad
    'REASSIGNED_DEPT',   -- reasignado dentro del mismo depto a otra ciudad
    'UNASSIGNED'         -- sin domiciliario disponible en todo el país
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_disponibilidad as enum ('DISPONIBLE', 'OCUPADO', 'INACTIVO');
exception when duplicate_object then null; end $$;

-- 3) Tabla domiciliarios
create table if not exists public.domiciliarios (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  nombre_completo  text not null,
  departamento     text not null,
  ciudad           text not null,
  vehiculo         text not null,
  placa            text not null,
  ciudad_placa     text not null,
  disponibilidad   delivery_disponibilidad not null default 'DISPONIBLE',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_domiciliarios_depto_ciudad
  on public.domiciliarios (departamento, ciudad)
  where disponibilidad = 'DISPONIBLE';

drop trigger if exists trg_domiciliarios_updated_at on public.domiciliarios;
create trigger trg_domiciliarios_updated_at
  before update on public.domiciliarios
  for each row execute function public.set_updated_at();

-- 4) PIN del repartidor (hash bcrypt). WebAuthn opcional en otra tabla si se añade.
create table if not exists public.delivery_pin (
  domiciliario_id  uuid primary key references public.domiciliarios(id) on delete cascade,
  pin_hash         text not null,
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_delivery_pin_updated_at on public.delivery_pin;
create trigger trg_delivery_pin_updated_at
  before update on public.delivery_pin
  for each row execute function public.set_updated_at();

-- 5) Centroides geográficos CO para cálculo Haversine
create table if not exists public.co_city_centroids (
  departamento  text not null,
  ciudad        text not null,
  lat           double precision not null,
  lng           double precision not null,
  primary key (departamento, ciudad)
);

-- 6) Datos de recepción (QR o manual) — complementa orders.delivered_at
create table if not exists public.recibido (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null unique references public.orders(id) on delete cascade,
  domiciliario_id   uuid references public.domiciliarios(id) on delete set null,
  nombre_receptor   text not null,
  tipo_documento    document_type not null,
  numero_documento  text not null,
  qr_consumido      boolean not null default false,
  fuente            text not null default 'manual' check (fuente in ('qr','manual','simulated','cliente')),
  hora              time not null default (now()::time),
  fecha             date not null default (now()::date),
  created_at        timestamptz not null default now()
);

create index if not exists idx_recibido_domiciliario on public.recibido (domiciliario_id, created_at desc);

-- 7) Bonos de reasignación
create table if not exists public.delivery_bonos (
  id                 uuid primary key default gen_random_uuid(),
  domiciliario_id    uuid not null references public.domiciliarios(id) on delete cascade,
  order_id           uuid not null unique references public.orders(id) on delete cascade,
  base_cop           integer not null,
  km_extra           numeric(6,2) not null,
  bono_cop           integer not null,
  motivo             text not null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_bonos_domiciliario on public.delivery_bonos (domiciliario_id, created_at desc);

-- 8) Suscripciones a Web Push (clientes y repartidores)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_user on public.push_subscriptions (user_id);

-- 9) Extender orders con los campos de delivery
alter table public.orders add column if not exists delivery_id uuid references public.domiciliarios(id) on delete set null;
alter table public.orders add column if not exists delivery_status delivery_assignment_status;
alter table public.orders add column if not exists estimated_delivery_at date;
alter table public.orders add column if not exists delivery_warning text;        -- texto para el cliente ("retraso 2-3 días")
alter table public.orders add column if not exists qr_jti text unique;           -- id único del QR vigente
alter table public.orders add column if not exists qr_consumed_at timestamptz;   -- cuando el QR fue escaneado y aceptado
alter table public.orders add column if not exists delivery_city text;           -- ciudad del envío (snapshot ya existe shipping_city, lo dejamos sincronizado)
alter table public.orders add column if not exists delivery_notified_today boolean not null default false;
alter table public.orders add column if not exists receiver_prefilled jsonb;     -- datos de receptor diligenciados por el cliente antes de la entrega

create index if not exists idx_orders_delivery on public.orders (delivery_id, status);
create index if not exists idx_orders_eta on public.orders (estimated_delivery_at) where status in ('PAID','SHIPPED');

-- ═══════════════════════════════════════════════════════════════════════════
-- Funciones auxiliares
-- ═══════════════════════════════════════════════════════════════════════════

-- Haversine en kilómetros
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians((lng2 - lng1) / 2)), 2)
  ));
$$;

-- Suma N días hábiles (lunes a viernes) a una fecha dada. Sin feriados.
create or replace function public.add_business_days(start_date date, n integer)
returns date
language plpgsql immutable as $$
declare
  d date := start_date;
  added integer := 0;
begin
  while added < n loop
    d := d + 1;
    -- dow: 0 = domingo, 6 = sábado
    if extract(dow from d) not in (0, 6) then
      added := added + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- Asignación de domiciliario para una orden.
-- Prioridad:
--   1) Domiciliario DISPONIBLE con mismo departamento Y ciudad → ASSIGNED
--   2) Domiciliario DISPONIBLE con mismo departamento (ciudad distinta, más cercano por haversine) → REASSIGNED_DEPT + bono
--   3) Ninguno → UNASSIGNED (admin recibe aviso)
-- Devuelve jsonb con { delivery_id, status, warning, km_extra, bono_cop, motivo }
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
  v_lat_dom double precision;
  v_lng_dom double precision;
  v_km numeric;
  v_bono integer;
  v_result jsonb;
begin
  select shipping_department, shipping_city
    into v_dept, v_city
    from public.orders where id = p_order_id;
  if v_dept is null then
    raise exception 'order % not found or missing shipping_department', p_order_id;
  end if;

  -- 1) Match exacto departamento + ciudad
  select d.id into v_delivery
    from public.domiciliarios d
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
     and lower(d.ciudad) = lower(v_city)
   order by random()
   limit 1;

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

  -- 2) Mismo departamento, ciudad distinta — elegimos el más cercano
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
   limit 1;

  if found then
    -- Calcular km extra y bono
    if v_lat_order is null or v_delivery.lat is null then
      v_km := 20; -- fallback cuando falta centroide
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
grant execute on function public.haversine_km(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.add_business_days(date, integer) to authenticated, service_role;

-- Consumo atómico de un QR (anti doble-escaneo)
create or replace function public.consume_order_qr(
  p_order_id uuid,
  p_jti text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_rows integer;
begin
  update public.orders
     set qr_consumed_at = now()
   where id = p_order_id
     and qr_jti = p_jti
     and qr_consumed_at is null;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

grant execute on function public.consume_order_qr(uuid, text) to service_role;
