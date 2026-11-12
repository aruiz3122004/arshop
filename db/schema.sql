-- ═══════════════════════════════════════════════════════════════════════════
-- ARShop — schema inicial
-- Objetivo: Supabase (Postgres 15+). Compatible con Postgres estándar si no
-- usas Auth (en ese caso cambia `auth.users` por tu propia tabla).
-- Ejecutar: psql <conn> -f schema.sql   (o Supabase SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ───── Enums ─────
-- user_role incluye REPARTIDOR (agregado en migración 010_delivery_schema).
-- schema.sql refleja el estado FINAL que debería tener la DB tras aplicar
-- todas las migraciones. Si estás creando una DB nueva, este archivo basta.
do $$ begin
  create type user_role as enum ('CUSTOMER', 'ADMIN', 'REPARTIDOR');
exception when duplicate_object then null; end $$;

-- Para instalaciones viejas donde el enum ya existe sin REPARTIDOR
do $$ begin
  alter type user_role add value if not exists 'REPARTIDOR';
exception when others then null; end $$;

do $$ begin
  create type product_gender as enum ('hombre', 'mujer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'
  );
exception when duplicate_object then null; end $$;

-- Tipo de documento colombiano estándar
do $$ begin
  create type document_type as enum ('CC', 'CE', 'PP', 'NIT');
exception when duplicate_object then null; end $$;

-- Etiqueta libre pero acotada para que la UI pueda mostrar íconos
do $$ begin
  create type address_label as enum ('casa', 'oficina', 'otro');
exception when duplicate_object then null; end $$;

-- ───── profiles ──
-- Espeja a auth.users. El trigger on_auth_user_created lo mantiene en sync.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  full_name          text,
  phone              text,
  document_type      document_type,
  document_number    text,
  stripe_customer_id text unique,
  role               user_role not null default 'CUSTOMER',
  blocked            boolean   not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Columnas nuevas (idempotente para instalaciones existentes)
alter table public.profiles add column if not exists email              text;
alter table public.profiles add column if not exists document_type      document_type;
alter table public.profiles add column if not exists document_number    text;
alter table public.profiles add column if not exists stripe_customer_id text;

do $$ begin
  alter table public.profiles add constraint profiles_stripe_customer_id_key unique (stripe_customer_id);
exception when duplicate_object then null; end $$;

-- Un mismo documento no debería repetirse entre usuarios
create unique index if not exists uq_profiles_document
  on public.profiles (document_type, document_number)
  where document_number is not null;

-- Backfill email desde auth.users para instalaciones ya existentes
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and p.email is distinct from u.email;

-- Mantiene updated_at al día
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Al crear usuario en auth, insertamos su fila en profiles (con email)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do update
    set email = excluded.email
    where public.profiles.email is distinct from excluded.email;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantener profiles.email sincronizado cuando el usuario cambia el correo
-- en Supabase Auth (p.ej. flujo de change-email).
create or replace function public.handle_user_email_update()
returns trigger as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email
     where id = new.id;
  end if;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- ───── addresses ──
-- Direcciones de envío/facturación. Un usuario puede tener varias; una sola
-- marcada como default (garantizado por índice único parcial + trigger).
create table if not exists public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  label          address_label not null default 'casa',
  recipient_name text,
  line1          text not null,
  line2          text,
  neighborhood   text not null,
  city           text not null,
  department     text not null,
  postal_code    text,
  country        text not null default 'CO',
  phone          text not null,
  notes          text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_addresses_user
  on public.addresses (user_id, created_at desc);

-- Solo una dirección default por usuario
create unique index if not exists uq_addresses_default_per_user
  on public.addresses (user_id)
  where is_default = true;

drop trigger if exists trg_addresses_updated_at on public.addresses;
create trigger trg_addresses_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- Si se marca una dirección como default, desmarcar las demás del mismo usuario
-- (el índice único parcial solo *bloquea* duplicados; este trigger los *evita*).
create or replace function public.enforce_single_default_address()
returns trigger as $$
begin
  if new.is_default = true then
    update public.addresses
       set is_default = false
     where user_id = new.user_id
       and id <> new.id
       and is_default = true;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_addresses_single_default on public.addresses;
create trigger trg_addresses_single_default
  before insert or update of is_default on public.addresses
  for each row when (new.is_default = true)
  execute function public.enforce_single_default_address();

-- Si no queda ninguna default y el usuario tiene direcciones, promover la más reciente.
create or replace function public.promote_default_address_on_delete()
returns trigger as $$
begin
  if old.is_default = true then
    update public.addresses
       set is_default = true
     where id = (
       select id from public.addresses
        where user_id = old.user_id
        order by created_at desc
        limit 1
     );
  end if;
  return old;
end; $$ language plpgsql;

drop trigger if exists trg_addresses_promote_default on public.addresses;
create trigger trg_addresses_promote_default
  after delete on public.addresses
  for each row execute function public.promote_default_address_on_delete();

-- ───── products ──
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  brand        text not null,
  description  text not null default '',
  gender       product_gender not null,
  category     text not null,
  price_cop    integer not null check (price_cop >= 0),
  currency     text not null default 'COP',
  images       text[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_products_category_gender
  on public.products (category, gender) where active;
create index if not exists idx_products_price_cop
  on public.products (price_cop) where active;
create index if not exists idx_products_name_trgm
  on public.products using gin (name gin_trgm_ops);


drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ───── product_variants ──
create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  size        text not null,
  color_name  text not null,
  color_hex   text not null,
  sku         text unique not null,
  stock       integer not null default 0 check (stock >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists idx_variants_product on public.product_variants (product_id);

-- ───── orders ──
create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete restrict,
  total_cop                 integer not null check (total_cop >= 0),
  currency                  text not null default 'COP',
  status                    order_status not null default 'PENDING_PAYMENT',
  shipping_address          jsonb not null,
  shipping_city             text not null,
  shipping_department       text not null,
  shipping_phone            text not null,
  notes                     text,
  habeas_data_accepted      boolean not null,
  stripe_payment_intent_id  text unique,
  created_at                timestamptz not null default now(),
  paid_at                   timestamptz,
  shipped_at                timestamptz,
  delivered_at              timestamptz,
  updated_at                timestamptz not null default now(),
  constraint habeas_required check (habeas_data_accepted = true)
);
-- Costo de envío capturado en la orden (0 = gratis)
alter table public.orders add column if not exists shipping_cost_cop integer not null default 0;

-- Moneda en que Stripe realizó el cobro real (para auditoría y reembolsos)
alter table public.orders add column if not exists charge_currency text not null default 'COP';

create index if not exists idx_orders_user on public.orders (user_id, created_at desc);
create index if not exists idx_orders_status on public.orders (status) where status in ('PAID','SHIPPED');

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ───── order_items ──
create table if not exists public.order_items (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders(id) on delete cascade,
  product_variant_id       uuid not null references public.product_variants(id) on delete restrict,
  product_name_snapshot    text not null,
  variant_label            text not null,
  unit_price_cop           integer not null check (unit_price_cop >= 0),
  quantity                 integer not null check (quantity > 0),
  created_at               timestamptz not null default now()
);
create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_variant on public.order_items (product_variant_id);

-- ───── shipping_rates ──
-- Tarifas de envío por departamento colombiano.
-- Si el departamento no aparece en la tabla se usa una tarifa por defecto.
create table if not exists public.shipping_rates (
  department       text    primary key,
  cost_cop         integer not null default 18000,
  free_above_cop   integer not null default 450000
);

-- Datos iniciales (idempotente)
insert into public.shipping_rates (department, cost_cop, free_above_cop) values
  ('Bogotá D.C.',         10000, 350000),
  ('Cundinamarca',        12000, 350000),
  ('Antioquia',           14000, 400000),
  ('Valle del Cauca',     14000, 400000),
  ('Atlántico',           16000, 400000),
  ('Santander',           16000, 450000),
  ('Tolima',              16000, 400000),
  ('Norte de Santander',  16000, 450000),
  ('Risaralda',           14000, 400000),
  ('Caldas',              14000, 400000),
  ('Quindío',             14000, 400000),
  ('Bolívar',             18000, 450000),
  ('Córdoba',             18000, 450000),
  ('Meta',                18000, 450000),
  ('Huila',               18000, 450000),
  ('Cesar',               18000, 450000),
  ('Magdalena',           18000, 450000),
  ('Nariño',              20000, 500000),
  ('Cauca',               20000, 500000),
  ('La Guajira',          22000, 600000),
  ('Chocó',               22000, 600000),
  ('Putumayo',            22000, 600000),
  ('Amazonas',            25000, 600000),
  ('Vichada',             25000, 600000),
  ('Guainía',             25000, 600000),
  ('Vaupés',              25000, 600000)
on conflict (department) do nothing;

-- ───── audit_logs ──
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target      text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_actor on public.audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_action on public.audit_logs (action, created_at desc);

-- ───── user_mfa ──
create table if not exists public.user_mfa (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users(id) on delete cascade,
  totp_secret             text,
  mfa_enabled             boolean not null default false,
  email_code              text,
  email_code_expires_at   timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_user_mfa_user on public.user_mfa (user_id);
