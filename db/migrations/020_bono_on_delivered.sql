-- ═══════════════════════════════════════════════════════════════════════════
-- 020_bono_on_delivered.sql — Bono de reasignación se abona al ENTREGAR
--
-- Problema: assign_delivery() creaba la fila en delivery_bonos al momento
-- de asignar al repartidor. Si la orden se cancela, se refunda o nunca se
-- entrega, el repartidor ya figuraba con el bono acumulado. Mal: el bono
-- es por completar la entrega reasignada, no por recibirla.
--
-- Fix:
--   1) Guardar km_extra en orders.delivery_km_extra al asignar (snapshot).
--   2) Dejar de insertar en delivery_bonos dentro de assign_delivery().
--   3) Función award_delivery_bono(order_id) que inserta la fila cuando
--      la orden está DELIVERED y fue REASSIGNED_DEPT, idempotente.
--   4) Trigger on UPDATE OF status que la invoca al pasar a DELIVERED.
--
-- Mantiene base = 30 000 COP y la fórmula ceil(km_extra − 15 km gratis).
-- Idempotente. Pegar en SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Columna snapshot en orders — se rellena en assign_delivery cuando
--    la orden entra como REASSIGNED_DEPT. NULL para match exacto o
--    sin asignación.
alter table public.orders
  add column if not exists delivery_km_extra numeric(6,2);

-- 2) Reescribir assign_delivery sin inserción inmediata en delivery_bonos.
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

  -- 1) Match exacto departamento + ciudad (balanceo Least-Loaded + lock por fila)
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

  -- 2) Mismo departamento, ciudad distinta — el más cercano dentro de 60 km
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

    -- Nota: la fila en delivery_bonos se crea en award_delivery_bono()
    -- cuando la orden pase a DELIVERED. Aquí sólo dejamos el snapshot.

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

-- 3) award_delivery_bono: inserta la fila en delivery_bonos si corresponde.
--    Idempotente por el UNIQUE (order_id) existente en la tabla.
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

  v_km := coalesce(v_order.delivery_km_extra, 20);  -- fallback por si quedó sin snapshot
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

-- 4) Trigger: cuando orders.status pasa a DELIVERED, intentar abonar el bono.
--    Se ejecuta AFTER UPDATE para que award_delivery_bono vea la fila final.
--    Sólo dispara en la transición (OLD distinto de NEW), evitando trabajo en
--    updates ajenos a status. Errores en el bono no deben revertir la entrega:
--    los capturamos y los dejamos en el log de Postgres.
create or replace function public.trg_award_delivery_bono()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'DELIVERED'
     and (old.status is distinct from new.status)
     and new.delivery_status = 'REASSIGNED_DEPT' then
    begin
      perform public.award_delivery_bono(new.id);
    exception when others then
      raise warning 'award_delivery_bono(%) falló: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_award_delivery_bono on public.orders;
create trigger trg_orders_award_delivery_bono
  after update of status on public.orders
  for each row execute function public.trg_award_delivery_bono();

-- 5) Limpieza de bonos huérfanos: filas creadas por el flujo anterior cuya
--    orden quedó en PENDING_PAYMENT/CANCELLED/REFUNDED se eliminan. Las que
--    pertenecen a órdenes ya DELIVERED se conservan (bono legítimo retroactivo).
delete from public.delivery_bonos b
 using public.orders o
 where b.order_id = o.id
   and o.status <> 'DELIVERED';

-- 6) Backfill del snapshot delivery_km_extra para órdenes REASSIGNED_DEPT
--    que todavía están en vuelo (PAID/SHIPPED). Para órdenes ya DELIVERED,
--    si tienen bono previo lo tomamos de ahí; si no, dejamos NULL.
update public.orders o
   set delivery_km_extra = b.km_extra
  from public.delivery_bonos b
 where b.order_id = o.id
   and o.delivery_km_extra is null;
