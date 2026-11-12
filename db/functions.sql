-- ═══════════════════════════════════════════════════════════════════════════
-- Funciones RPC callable desde el backend
-- ═══════════════════════════════════════════════════════════════════════════

-- Decremento atómico de stock para un lote de variantes.
-- Entrada: p_items jsonb -> [{ "variant_id": uuid, "qty": int }, ...]
-- Comportamiento:
--   - Toma row-level locks sobre cada variante (FOR UPDATE).
--   - Si cualquier variante no tiene stock suficiente, levanta excepción
--     'insufficient stock for variant <id>' y aborta la transacción entera.
--   - Garantiza consistencia bajo concurrencia (dos checkouts simultáneos).
create or replace function public.decrement_variant_stock(p_items jsonb)
returns void
language plpgsql
security definer
as $$
declare
  item jsonb;
  v_variant_id uuid;
  v_qty int;
  v_current int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (item->>'variant_id')::uuid;
    v_qty := (item->>'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid qty for variant %', v_variant_id;
    end if;

    -- lock explícito + verificación atómica
    select stock into v_current
    from public.product_variants
    where id = v_variant_id
    for update;

    if v_current is null then
      raise exception 'variant % not found', v_variant_id;
    end if;

    if v_current < v_qty then
      raise exception 'insufficient stock for variant % (have %, need %)',
        v_variant_id, v_current, v_qty;
    end if;

    update public.product_variants
      set stock = stock - v_qty
      where id = v_variant_id;
  end loop;
end;
$$;

grant execute on function public.decrement_variant_stock(jsonb) to authenticated, service_role;

-- Incremento de stock para reposición al cancelar/reembolsar una orden.
-- Mismo formato de entrada que decrement_variant_stock.
create or replace function public.restore_variant_stock(p_items jsonb)
returns void
language plpgsql
security definer
as $$
declare
  item jsonb;
  v_variant_id uuid;
  v_qty int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (item->>'variant_id')::uuid;
    v_qty := (item->>'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid qty for variant %', v_variant_id;
    end if;

    update public.product_variants
      set stock = stock + v_qty
      where id = v_variant_id;

    if not found then
      raise exception 'variant % not found', v_variant_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.restore_variant_stock(jsonb) to authenticated, service_role;
