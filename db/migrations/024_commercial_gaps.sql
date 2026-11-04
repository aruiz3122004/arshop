-- ═══════════════════════════════════════════════════════════════════════════
-- 024_commercial_gaps.sql — Gaps Comerciales y Legales (G1–G6)
--
-- G1: Tabla order_returns (Derecho de Retracto Ley 1480, Cambio de talla, Garantía)
-- G2: Soporte de cancelación pre-envío (PENDING_PAYMENT y PAID)
-- G3: Despacho por transportadora nacional (shipping_carrier, tracking_number, tracking_url)
-- G4: Tabla coupons + redeem_coupon RPC + compare_at_price_cop en products
-- G5: fit y size_guide en products
-- G6: Desglose tributario en orders (subtotal_cop, discount_cop, tax_cop IVA 19%)
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────── 1. Extensiones en products (G4 & G5) ─────────────────────
alter table public.products
  add column if not exists compare_at_price_cop integer check (compare_at_price_cop is null or compare_at_price_cop >= 0),
  add column if not exists fit                  text check (fit is null or fit in ('slim', 'regular', 'relaxed', 'oversize')),
  add column if not exists size_guide           jsonb;

-- ───────────────────── 2. Tabla coupons y RPC redeem_coupon (G4) ─────────────────────
create table if not exists public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  discount_type     text not null check (discount_type in ('PERCENT', 'FIXED_COP')),
  discount_value    integer not null check (discount_value > 0),
  min_subtotal_cop  integer not null default 0 check (min_subtotal_cop >= 0),
  max_discount_cop  integer check (max_discount_cop is null or max_discount_cop > 0),
  max_uses          integer check (max_uses is null or max_uses > 0),
  used_count        integer not null default 0 check (used_count >= 0),
  expires_at        timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists idx_coupons_code on public.coupons (upper(code));

-- Cupones iniciales de ejemplo (idempotente)
insert into public.coupons (code, discount_type, discount_value, min_subtotal_cop, max_discount_cop, max_uses, active)
values
  ('BIENVENIDO10', 'PERCENT',   10, 150000, 80000,  null, true),
  ('DROP15',       'PERCENT',   15, 300000, 120000, 200,  true),
  ('ARSHOP30K',    'FIXED_COP', 30000, 250000, null, null, true)
on conflict (code) do nothing;

-- Redención atómica de cupón con bloqueo FOR UPDATE
create or replace function public.redeem_coupon(
  p_code text,
  p_subtotal_cop integer
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_coupon record;
  v_discount integer;
begin
  select *
    into v_coupon
    from public.coupons
   where upper(code) = upper(trim(p_code))
     for update;

  if not found or not v_coupon.active then
    raise exception 'Cupón "%" inválido o inactivo', p_code;
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    raise exception 'El cupón "%" ha expirado', v_coupon.code;
  end if;

  if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
    raise exception 'El cupón "%" agotó su límite de usos', v_coupon.code;
  end if;

  if p_subtotal_cop < v_coupon.min_subtotal_cop then
    raise exception 'El cupón "%" requiere una compra mínima de $% COP',
      v_coupon.code, v_coupon.min_subtotal_cop;
  end if;

  if v_coupon.discount_type = 'PERCENT' then
    v_discount := round((p_subtotal_cop::numeric * v_coupon.discount_value) / 100.0)::integer;
    if v_coupon.max_discount_cop is not null then
      v_discount := least(v_discount, v_coupon.max_discount_cop);
    end if;
  else
    v_discount := least(v_coupon.discount_value, p_subtotal_cop);
  end if;

  update public.coupons
     set used_count = used_count + 1
   where id = v_coupon.id;

  return jsonb_build_object(
    'code', v_coupon.code,
    'discount_cop', v_discount,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value
  );
end;
$$;

grant execute on function public.redeem_coupon(text, integer) to service_role;

-- ───────────────────── 3. Extensiones en orders (G3, G4, G6) ─────────────────────
alter table public.orders
  add column if not exists subtotal_cop     integer,
  add column if not exists discount_cop     integer not null default 0,
  add column if not exists coupon_code      text,
  add column if not exists tax_cop          integer,
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number  text,
  add column if not exists tracking_url     text;

-- ───────────────────── 4. Tabla order_returns (G1 · RMA / Ley 1480) ─────────────────────
create table if not exists public.order_returns (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in ('RETRACT_REFUND', 'SIZE_EXCHANGE', 'DEFECTIVE')),
  reason          text not null,
  requested_size  text,
  status          text not null default 'REQUESTED' check (status in ('REQUESTED', 'APPROVED_REFUNDED', 'APPROVED_EXCHANGED', 'REJECTED')),
  admin_note      text,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_order_returns_status on public.order_returns (status, created_at desc);
create index if not exists idx_order_returns_user on public.order_returns (user_id, created_at desc);

drop trigger if exists trg_order_returns_updated_at on public.order_returns;
create trigger trg_order_returns_updated_at
  before update on public.order_returns
  for each row execute function public.set_updated_at();
