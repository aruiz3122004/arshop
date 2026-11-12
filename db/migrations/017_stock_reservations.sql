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
  v_current int;
  v_other_reserved int;
  v_available int;
  v_count int := 0;
begin
  for r in
    select product_variant_id as variant_id, sum(quantity)::int as qty
      from public.order_items
     where order_id = p_order_id
     group by product_variant_id
     order by product_variant_id
  loop
    v_count := v_count + 1;

    select stock into v_current
      from public.product_variants
     where id = r.variant_id
     for update;

    if v_current is null then
      raise exception 'variant % not found', r.variant_id;
    end if;

    select coalesce(sum(qty), 0) into v_other_reserved
      from public.stock_reservations
     where variant_id = r.variant_id
       and order_id <> p_order_id
       and expires_at > now();

    v_available := v_current - v_other_reserved;
    if v_available < r.qty then
      raise exception 'insufficient stock on confirm for variant % (available %, need %)',
        r.variant_id, v_available, r.qty;
    end if;

    update public.product_variants
       set stock = stock - r.qty
     where id = r.variant_id;
  end loop;

  if v_count = 0 then
    raise exception 'order % has no order_items to confirm', p_order_id;
  end if;

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
