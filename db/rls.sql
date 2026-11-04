-- ═══════════════════════════════════════════════════════════════════════════
-- Row-Level Security — políticas por tabla.
-- Supabase: service_role bypassa RLS automáticamente (backend lo usa).
-- Las políticas aquí protegen lo que llega vía anon o authenticated.
-- ═══════════════════════════════════════════════════════════════════════════

-- Habilitar RLS en todas las tablas que exponen datos
alter table public.profiles         enable row level security;
alter table public.addresses        enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.audit_logs       enable row level security;

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN' and not blocked
  );
$$;

-- ───────────────────────── profiles ─────────────────────────
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ( id = auth.uid() or public.is_admin() );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ( id = auth.uid() ) with check ( id = auth.uid() );

-- Insert lo hace el trigger handle_new_user con security definer; no se
-- necesita policy de insert para el cliente.

-- ───────────────────────── addresses ─────────────────────────
drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
  for select using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
  for insert with check ( user_id = auth.uid() );

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
  for update using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses
  for delete using ( user_id = auth.uid() or public.is_admin() );

-- ───────────────────────── products ─────────────────────────
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using ( active = true or public.is_admin() );

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ───────────────────────── product_variants ─────────────────────────
drop policy if exists "variants_public_read" on public.product_variants;
create policy "variants_public_read" on public.product_variants
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.active = true or public.is_admin())
    )
  );

drop policy if exists "variants_admin_write" on public.product_variants;
create policy "variants_admin_write" on public.product_variants
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ───────────────────────── orders ─────────────────────────
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check ( user_id = auth.uid() );

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update using ( public.is_admin() ) with check ( public.is_admin() );

-- ───────────────────────── order_items ─────────────────────────
drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- ───────────────────────── audit_logs ─────────────────────────
drop policy if exists "audit_admin_read" on public.audit_logs;
create policy "audit_admin_read" on public.audit_logs
  for select using ( public.is_admin() );

-- Inserts a audit_logs los hace el backend con service_role → RLS bypassed.
