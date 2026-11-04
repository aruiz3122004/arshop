-- ═══════════════════════════════════════════════════════════════════════════
-- assign_delivery: locks a nivel de fila con SKIP LOCKED
--
-- Problema previo: dos llamadas concurrentes a assign_delivery con pool
-- pequeño podían elegir al mismo domiciliario por azar del `ORDER BY random()`,
-- aunque hubiera otros libres. Pésima distribución; además queda frágil
-- ante cualquier futura regla "N pedidos máximos por domiciliario".
--
-- Fix: `FOR UPDATE OF d SKIP LOCKED` en los dos SELECT que eligen candidato.
-- Si otra transacción ya tomó una fila, Postgres salta a la siguiente —
-- no espera, no reintenta, no da deadlock. El `LIMIT 1` se cumple con la
-- siguiente fila disponible.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_km numeric;
  v_bono integer;
begin
  select shipping_department, shipping_city
    into v_dept, v_city
    from public.orders where id = p_order_id;
  if v_dept is null then
    raise exception 'order % not found or missing shipping_department', p_order_id;
  end if;

  -- 1) Match exacto departamento + ciudad (lock por fila para distribución justa)
  select d.id into v_delivery
    from public.domiciliarios d
   where d.disponibilidad = 'DISPONIBLE'
     and lower(d.departamento) = lower(v_dept)
     and lower(d.ciudad) = lower(v_city)
   order by random()
   limit 1
   for update of d skip locked;

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

  -- 2) Mismo departamento, ciudad distinta — el más cercano (lock por fila de d)
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
   limit 1
   for update of d skip locked;

  if found then
    if v_lat_order is null or v_delivery.lat is null then
      v_km := 20;
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
