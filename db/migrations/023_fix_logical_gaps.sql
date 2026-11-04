-- ═══════════════════════════════════════════════════════════════════════════
-- 023_fix_logical_gaps.sql — Corrección de vacíos argumentales y transaccionales (A–E)
--
-- 1) Vacío A: confirm_reservation ahora lee desde order_items y valida que
--    (stock físico − reservas activas de otras órdenes) cubra la cantidad,
--    incluso si la reserva original de 15 min ya había expirado y fue
--    barrida por el cron. Evita que pagos tardíos queden PAID sin descontar
--    stock físico.
-- 2) Vacío E: assign_delivery implementa balanceo de carga real (Least-Loaded:
--    prioriza al domiciliario DISPONIBLE con menos órdenes activas en PAID o
--    SHIPPED), limita la reasignación inter-ciudad (REASSIGNED_DEPT) a un
--    radio máximo de 60 km y aplica un tope máximo de bono de $150.000 COP.
-- 3) Vacío E: award_delivery_bono aplica el mismo tope máximo de $150.000 COP.
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1. confirm_reservation ─────────────────────────
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
  -- Iteramos sobre order_items (ordenados por variant_id para evitar deadlocks)
  -- en lugar de depender exclusivamente de que stock_reservations siga viva.
  for r in
    select product_variant_id as variant_id, sum(quantity)::int as qty
      from public.order_items
     where order_id = p_order_id
     group by product_variant_id
     order by product_variant_id
  loop
    v_count := v_count + 1;

    -- Lock explícito sobre la variante para serializar confirmaciones y reservas
    select stock into v_current
      from public.product_variants
     where id = r.variant_id
     for update;

    if v_current is null then
      raise exception 'variant % not found', r.variant_id;
    end if;

    -- Reservas activas de OTRAS órdenes (no contamos la propia si aún existe)
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

grant execute on function public.confirm_reservation(uuid) to service_role;

-- ───────────────────────── 2. assign_delivery ─────────────────────────
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
  v_max_radius numeric := 60;
  v_max_bono integer := 150000;
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

  -- 1) Match exacto departamento + ciudad
  --    Balanceo Least-Loaded: elige al domiciliario DISPONIBLE con menos
  --    pedidos activos (PAID/SHIPPED), desempatando aleatoriamente.
  select d.id into v_delivery
    from public.domiciliarios d
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
     and lower(d.ciudad) = lower(v_city)
   order by (
     select count(*)
       from public.orders o
      where o.delivery_id = d.id
        and o.status in ('PAID', 'SHIPPED')
   ) asc, random()
   limit 1
   for update of d skip locked;

  if found then
    update public.orders
       set delivery_id = v_delivery.id,
           delivery_status = 'ASSIGNED',
           delivery_warning = null,
           delivery_city = v_city,
           delivery_km_extra = null,
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

  -- 2) Mismo departamento, ciudad distinta dentro del radio máximo regional (<= 60 km)
  select c.lat, c.lng into v_lat_order, v_lng_order
    from public.co_city_centroids c
   where lower(c.departamento) = lower(v_dept) and lower(c.ciudad) = lower(v_city)
   limit 1;

  select d.id,
         c.lat, c.lng,
         case
           when v_lat_order is not null and c.lat is not null then
             public.haversine_km(v_lat_order, v_lng_order, c.lat, c.lng)
           else 20.0
         end as dist
    into v_delivery
    from public.domiciliarios d
    left join public.co_city_centroids c
      on lower(c.departamento) = lower(d.departamento) and lower(c.ciudad) = lower(d.ciudad)
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
     and (
       case
         when v_lat_order is not null and c.lat is not null then
           public.haversine_km(v_lat_order, v_lng_order, c.lat, c.lng)
         else 20.0
       end
     ) <= v_max_radius
   order by dist asc, (
     select count(*)
       from public.orders o
      where o.delivery_id = d.id
        and o.status in ('PAID', 'SHIPPED')
   ) asc, random()
   limit 1
   for update of d skip locked;

  if found then
    v_km := coalesce(v_delivery.dist, 20);

    if v_km <= v_free_radius then
      v_bono := 0;
    else
      v_bono := least(v_bono_base * ceil(v_km - v_free_radius)::integer, v_max_bono);
    end if;

    update public.orders
       set delivery_id = v_delivery.id,
           delivery_status = 'REASSIGNED_DEPT',
           delivery_warning = 'La entrega puede llegar con 2-3 días de retraso',
           delivery_city = v_city,
           delivery_km_extra = round(v_km::numeric, 2),
           estimated_delivery_at = public.add_business_days(current_date, 13)
     where id = p_order_id;

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

  -- 3) Ningún domiciliario disponible dentro del radio permitido
  update public.orders
     set delivery_id = null,
         delivery_status = 'UNASSIGNED',
         delivery_warning = 'Tu pedido está en espera de asignación de domiciliario',
         delivery_city = v_city,
         delivery_km_extra = null,
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

-- ───────────────────────── 3. award_delivery_bono ─────────────────────────
create or replace function public.award_delivery_bono(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_bono_base integer := 30000;
  v_free_radius numeric := 15;
  v_max_bono integer := 150000;
  v_order record;
  v_km numeric;
  v_bono integer;
begin
  select id, status, delivery_id, delivery_status, delivery_km_extra, shipping_department
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if v_order.status <> 'DELIVERED' then
    return jsonb_build_object('ok', false, 'reason', 'order_not_delivered');
  end if;
  if v_order.delivery_status is distinct from 'REASSIGNED_DEPT' then
    return jsonb_build_object('ok', false, 'reason', 'not_reassigned');
  end if;
  if v_order.delivery_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_delivery_id');
  end if;

  v_km := coalesce(v_order.delivery_km_extra, 20);
  if v_km <= v_free_radius then
    return jsonb_build_object('ok', false, 'reason', 'within_free_radius', 'km_extra', v_km);
  end if;
  v_bono := least(v_bono_base * ceil(v_km - v_free_radius)::integer, v_max_bono);

  insert into public.delivery_bonos (domiciliario_id, order_id, base_cop, km_extra, bono_cop, motivo)
  values (
    v_order.delivery_id,
    v_order.id,
    v_bono_base,
    v_km,
    v_bono,
    format('Reasignación entre ciudades del depto %s (entrega completada)', v_order.shipping_department)
  )
  on conflict (order_id) do nothing;

  return jsonb_build_object('ok', true, 'bono_cop', v_bono, 'km_extra', v_km);
end;
$$;

grant execute on function public.award_delivery_bono(uuid) to service_role;
