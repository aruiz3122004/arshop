-- ═══════════════════════════════════════════════════════════════════════════
-- 028_electronic_invoicing.sql — Facturación electrónica DIAN (modo demo)
--
-- Implementa el modelo de datos de facturación electrónica descrito en
-- docs/FACTURACION_DIAN.md:
--   1. Configuración fiscal de la empresa (singleton).
--   2. Rangos de numeración con asignación atómica (FOR UPDATE).
--   3. Facturas, líneas, eventos y notas crédito.
--   4. Snapshot fiscal del comprador y desglose tributario en orders.
--
-- IMPORTANTE: el seed deja la facturación en modo DIAN_SIMULATED /
-- HABILITACION. No se transmite nada a la DIAN. Para producción real hay que
-- cambiar proveedor/ambiente, registrar el software y cargar el certificado.
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────── 1. Configuración fiscal (singleton) ─────────────────────
create table if not exists public.company_fiscal_settings (
  id                       boolean primary key default true check (id),
  legal_name               text not null default 'ARShop S.A.S. (DEMO)',
  trade_name               text not null default 'ARShop',
  nit                      text not null default '901482109',
  dv                       text not null default '4',
  tax_regime               text not null default 'RESPONSABLE_IVA',
  fiscal_responsibilities  text[] not null default array['O-48', 'O-13'],
  address                  text not null default 'Calle 93 # 11-45',
  municipality_code        text not null default '11001',
  municipality             text not null default 'Bogotá D.C.',
  department               text not null default 'Cundinamarca',
  email                    text not null default 'facturacion@arshop.co',
  phone                    text not null default '+57 601 000 0000',
  logo_url                 text,
  invoice_provider         text not null default 'DIAN_SIMULATED'
                             check (invoice_provider in ('DIAN_SIMULATED', 'DIAN_FREE', 'DIAN_OWN', 'FACTUS')),
  environment              text not null default 'HABILITACION'
                             check (environment in ('HABILITACION', 'PRODUCCION')),
  enabled                  boolean not null default true,
  demo_mode                boolean not null default true,
  software_id              text default 'ARSHOP-DEMO-001',
  software_pin_enc         text,
  certificate_path         text,
  certificate_password_enc text,
  last_test_at             timestamptz,
  last_test_ok             boolean,
  updated_at               timestamptz not null default now()
);

insert into public.company_fiscal_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists trg_company_fiscal_settings_updated_at on public.company_fiscal_settings;
create trigger trg_company_fiscal_settings_updated_at
  before update on public.company_fiscal_settings
  for each row execute function public.set_updated_at();

-- ───────────────────── 2. Numeración (resoluciones DIAN) ─────────────────────
create table if not exists public.invoice_numbering_ranges (
  id                 uuid primary key default gen_random_uuid(),
  document_type      text not null check (document_type in ('FV', 'NC', 'ND', 'POS')),
  prefix             text not null,
  resolution_number  text,
  resolution_date    date,
  range_from         bigint not null check (range_from > 0),
  range_to           bigint not null check (range_to >= range_from),
  current_number     bigint not null default 0 check (current_number >= 0),
  valid_from         date,
  valid_to           date,
  technical_key      text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (document_type, prefix, range_from)
);

create index if not exists idx_invoice_numbering_active
  on public.invoice_numbering_ranges (document_type, active);

insert into public.invoice_numbering_ranges
  (document_type, prefix, resolution_number, resolution_date, range_from, range_to,
   current_number, valid_from, valid_to, technical_key, active)
values
  ('FV', 'FEAR', '18764000001234', '2025-01-15', 990000000, 990999999,
   0, '2025-01-15', '2027-01-15',
   'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', true),
  ('NC', 'NCAR', '18764000001235', '2025-01-15', 991000000, 991999999,
   0, '2025-01-15', '2027-01-15',
   'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1', true)
on conflict (document_type, prefix, range_from) do nothing;

/**
 * Asigna el siguiente consecutivo de un rango bloqueando la fila con
 * FOR UPDATE. Devuelve number + prefix. No reutiliza números.
 */
create or replace function public.next_invoice_number(p_range_id uuid)
returns table (number bigint, prefix text, technical_key text, resolution_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_range record;
begin
  select *
    into v_range
    from public.invoice_numbering_ranges
   where id = p_range_id
     for update;

  if not found then
    raise exception 'Rango de numeración % no encontrado', p_range_id;
  end if;

  if not v_range.active then
    raise exception 'El rango de numeración % está inactivo', v_range.prefix;
  end if;

  if v_range.valid_to is not null and v_range.valid_to < current_date then
    raise exception 'El rango de numeración % está vencido', v_range.prefix;
  end if;

  if v_range.current_number >= v_range.range_to then
    raise exception 'El rango de numeración % está agotado', v_range.prefix;
  end if;

  update public.invoice_numbering_ranges
     set current_number = greatest(v_range.current_number + 1, v_range.range_from),
         updated_at = now()
   where id = v_range.id
   returning current_number into v_range.current_number;

  return query
    select v_range.current_number,
           v_range.prefix,
           v_range.technical_key,
           v_range.resolution_number;
end;
$$;

revoke all on function public.next_invoice_number(uuid) from public, anon, authenticated;
grant execute on function public.next_invoice_number(uuid) to service_role;

-- ───────────────────── 3. Facturas ─────────────────────
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references public.orders(id) on delete cascade,
  number             bigint,
  prefix             text,
  full_number        text,
  cufe               text,
  status             text not null default 'PENDING'
                       check (status in ('PENDING', 'PENDING_MANUAL', 'ISSUED', 'REJECTED', 'FAILED', 'VOID')),
  provider           text not null,
  environment        text not null default 'HABILITACION'
                       check (environment in ('HABILITACION', 'PRODUCCION')),
  issue_date         timestamptz not null default now(),
  accepted_at        timestamptz,
  xml_content        text,
  xml_url            text,
  pdf_url            text,
  qr_data_url        text,
  dian_track_id      text,
  dian_status_code   text,
  dian_message       text,
  taxable_base_cop   integer not null default 0,
  tax_cop            integer not null default 0,
  total_cop          integer not null default 0,
  currency           text not null default 'COP',
  payment_method     text not null default 'PAYMENT_CARD',
  seller_snapshot    jsonb not null default '{}'::jsonb,
  buyer_snapshot     jsonb not null default '{}'::jsonb,
  retry_count        integer not null default 0,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists uq_invoices_prefix_number
  on public.invoices (prefix, number)
  where number is not null;

create index if not exists idx_invoices_status_created
  on public.invoices (status, created_at desc);

create index if not exists idx_invoices_cufe on public.invoices (cufe);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete cascade,
  order_item_id  uuid references public.order_items(id) on delete set null,
  position       integer not null default 0,
  description    text not null,
  quantity       integer not null default 1 check (quantity > 0),
  unit_price_cop integer not null default 0,
  discount_cop   integer not null default 0,
  tax_rate       numeric(5, 2) not null default 19.00,
  tax_cop        integer not null default 0,
  line_total_cop integer not null default 0,
  tax_scheme     text not null default '01',
  created_at     timestamptz not null default now()
);

create index if not exists idx_invoice_lines_invoice
  on public.invoice_lines (invoice_id);

create table if not exists public.invoice_events (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  type        text not null
                check (type in ('CREATED', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY',
                                'MANUAL_MARK', 'CREDIT_NOTE', 'VOID')),
  payload     jsonb not null default '{}'::jsonb,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_invoice_events_invoice
  on public.invoice_events (invoice_id, created_at desc);

create table if not exists public.credit_notes (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  order_id     uuid not null references public.orders(id) on delete cascade,
  number       bigint,
  prefix       text,
  full_number  text,
  cufe         text,
  status       text not null default 'ISSUED'
                 check (status in ('PENDING', 'ISSUED', 'REJECTED', 'FAILED')),
  reason       text not null,
  amount_cop   integer not null check (amount_cop >= 0),
  xml_content  text,
  created_by   uuid references auth.users(id) on delete set null,
  issued_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_credit_notes_invoice
  on public.credit_notes (invoice_id, created_at desc);

-- ───────────────────── 4. Snapshot fiscal y tributario en orders ─────────────────────
alter table public.orders
  add column if not exists billing_document_type   text,
  add column if not exists billing_document_number text,
  add column if not exists billing_legal_name      text,
  add column if not exists billing_email           text,
  add column if not exists billing_address         jsonb,
  add column if not exists billing_municipality_code text,
  add column if not exists invoice_status          text,
  add column if not exists taxable_base_cop        integer,
  add column if not exists shipping_tax_cop        integer;

create index if not exists idx_orders_invoice_status
  on public.orders (invoice_status);

-- ───────────────────── 5. Seguridad ─────────────────────
alter table public.company_fiscal_settings  enable row level security;
alter table public.invoice_numbering_ranges enable row level security;
alter table public.invoices                 enable row level security;
alter table public.invoice_lines            enable row level security;
alter table public.invoice_events           enable row level security;
alter table public.credit_notes             enable row level security;

revoke all on public.company_fiscal_settings  from anon, authenticated;
revoke all on public.invoice_numbering_ranges from anon, authenticated;
revoke all on public.invoices                 from anon, authenticated;
revoke all on public.invoice_lines            from anon, authenticated;
revoke all on public.invoice_events           from anon, authenticated;
revoke all on public.credit_notes             from anon, authenticated;

grant all on public.company_fiscal_settings  to service_role;
grant all on public.invoice_numbering_ranges to service_role;
grant all on public.invoices                 to service_role;
grant all on public.invoice_lines            to service_role;
grant all on public.invoice_events           to service_role;
grant all on public.credit_notes             to service_role;

notify pgrst, 'reload schema';
