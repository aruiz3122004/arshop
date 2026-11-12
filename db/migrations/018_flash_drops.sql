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
