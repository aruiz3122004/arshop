-- ═══════════════════════════════════════════════════════════════════════════
-- 011_delivery_rls.sql — RLS para dominio delivery
-- Admin bypassa vía service_role (backend). Las policies aquí protegen al
-- repartidor y al cliente cuando pegan vía anon/authenticated.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.domiciliarios     enable row level security;
alter table public.delivery_pin      enable row level security;
alter table public.recibido          enable row level security;
alter table public.delivery_bonos    enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.co_city_centroids enable row level security;

-- Helper: ¿el usuario actual es REPARTIDOR y vinculado a este domiciliario_id?
create or replace function public.is_repartidor() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'REPARTIDOR'
      and not p.blocked
  );
$$;

create or replace function public.my_domiciliario_id() returns uuid
language sql stable security definer as $$
  select id from public.domiciliarios where user_id = auth.uid() limit 1;
$$;

-- ───── domiciliarios ─────
drop policy if exists "dom_select_own_or_admin" on public.domiciliarios;
create policy "dom_select_own_or_admin" on public.domiciliarios
  for select using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "dom_update_own" on public.domiciliarios;
create policy "dom_update_own" on public.domiciliarios
  for update using ( user_id = auth.uid() or public.is_admin() )
         with check ( user_id = auth.uid() or public.is_admin() );

-- Insert/delete solo backend (service_role bypassa).

-- ───── delivery_pin ─────
drop policy if exists "pin_select_own" on public.delivery_pin;
create policy "pin_select_own" on public.delivery_pin
  for select using (
    domiciliario_id = public.my_domiciliario_id() or public.is_admin()
  );

drop policy if exists "pin_update_own" on public.delivery_pin;
create policy "pin_update_own" on public.delivery_pin
  for update using (
    domiciliario_id = public.my_domiciliario_id() or public.is_admin()
  );

-- ───── recibido ─────
drop policy if exists "recibido_select_related" on public.recibido;
create policy "recibido_select_related" on public.recibido
  for select using (
    public.is_admin()
    or domiciliario_id = public.my_domiciliario_id()
    or exists (
      select 1 from public.orders o
      where o.id = recibido.order_id and o.user_id = auth.uid()
    )
  );

-- ───── delivery_bonos ─────
drop policy if exists "bonos_select_own" on public.delivery_bonos;
create policy "bonos_select_own" on public.delivery_bonos
  for select using (
    public.is_admin() or domiciliario_id = public.my_domiciliario_id()
  );

-- ───── push_subscriptions ─────
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions
  for select using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own" on public.push_subscriptions
  for insert with check ( user_id = auth.uid() );

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own" on public.push_subscriptions
  for delete using ( user_id = auth.uid() or public.is_admin() );

-- ───── co_city_centroids (lectura pública) ─────
drop policy if exists "centroids_public_read" on public.co_city_centroids;
create policy "centroids_public_read" on public.co_city_centroids
  for select using ( true );

-- ───── orders — extender política de UPDATE para que el repartidor marque DELIVERED ─────
-- El UPDATE de admin ya existe en rls.sql. Añadimos permiso al repartidor
-- SOLO sobre sus órdenes asignadas, y SOLO para cambiar status a DELIVERED.
-- Nota: la validación fina (que el patch sea exactamente "DELIVERED" y
-- que todos los checks estén) la hace el backend; la RLS aquí es un
-- cinturón adicional por si algún día se expone al cliente.
drop policy if exists "orders_repartidor_update" on public.orders;
create policy "orders_repartidor_update" on public.orders
  for update using (
    public.is_repartidor()
    and delivery_id = public.my_domiciliario_id()
  ) with check (
    public.is_repartidor()
    and delivery_id = public.my_domiciliario_id()
  );

-- Lectura: el repartidor también lee las órdenes que tiene asignadas.
drop policy if exists "orders_select_repartidor" on public.orders;
create policy "orders_select_repartidor" on public.orders
  for select using (
    public.is_repartidor() and delivery_id = public.my_domiciliario_id()
  );

-- order_items: lectura para el repartidor dueño de la orden.
drop policy if exists "order_items_select_repartidor" on public.order_items;
create policy "order_items_select_repartidor" on public.order_items
  for select using (
    public.is_repartidor()
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.delivery_id = public.my_domiciliario_id()
    )
  );
