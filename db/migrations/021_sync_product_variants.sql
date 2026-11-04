-- ═══════════════════════════════════════════════════════════════════════════
-- sync_product_variants: aplica el delta de variantes de un producto en una
-- sola transacción.
--
-- Problema: ProductsService.syncVariants hacía delete → update → insert desde
-- el app, SIN transacción. Si el insert fallaba (SKU duplicado al mover una
-- variante entre productos, por ejemplo), ya se habían borrado las viejas y
-- el producto quedaba parcialmente modificado — imposible de rollback desde
-- Node porque Supabase no abre transacciones explícitas vía PostgREST.
--
-- Esta función toma la lista deseada en jsonb y:
--   1. Hace DELETE de las variantes no presentes (si tienen pedidos → stock=0)
--   2. Hace UPSERT de las presentes (match por id, fallback por sku)
--
-- Retorna un jsonb con los SKUs archivados (los que no se pudieron borrar).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sync_product_variants(
  p_product_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_item jsonb;
  v_match_id uuid;
  v_match_sku text;
  v_existing record;
  v_archived text[] := array[]::text[];
  v_matched_ids uuid[] := array[]::uuid[];
  v_restocked uuid[] := array[]::uuid[];
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  -- Chequeo rápido de SKUs duplicados en el input (barato antes de tocar DB)
  if (
    select count(*) <> count(distinct trim(x->>'sku'))
    from jsonb_array_elements(p_items) x
  ) then
    raise exception 'duplicate SKU in input';
  end if;

  -- 1) UPSERT: para cada item, intentar match por id o por sku; si matchea
  --    update, si no insert. Guardamos qué ids tocamos para después borrar
  --    los que no están.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_match_id := nullif(v_item->>'id', '')::uuid;
    v_match_sku := trim(v_item->>'sku');

    -- Resolver match
    if v_match_id is not null then
      select id, stock into v_existing
        from public.product_variants
       where id = v_match_id and product_id = p_product_id
       for update;
    end if;

    if v_existing.id is null then
      select id, stock into v_existing
        from public.product_variants
       where sku = v_match_sku
       for update;
    end if;

    if v_existing.id is not null then
      -- UPDATE
      update public.product_variants
         set size = trim(v_item->>'size'),
             color_name = trim(v_item->>'colorName'),
             color_hex = v_item->>'colorHex',
             sku = v_match_sku,
             stock = (v_item->>'stock')::int
       where id = v_existing.id;

      -- Detectar reposición 0 → >0 (notifyBackInStock)
      if coalesce(v_existing.stock, 0) = 0
         and (v_item->>'stock')::int > 0 then
        v_restocked := v_restocked || v_existing.id;
      end if;

      v_matched_ids := v_matched_ids || v_existing.id;
    else
      -- INSERT
      insert into public.product_variants (
        product_id, size, color_name, color_hex, sku, stock
      ) values (
        p_product_id,
        trim(v_item->>'size'),
        trim(v_item->>'colorName'),
        v_item->>'colorHex',
        v_match_sku,
        (v_item->>'stock')::int
      );
    end if;

    v_existing := row(null, null)::record;
  end loop;

  -- 2) DELETE de las variantes que ya no están en el input
  for v_existing in
    select id, sku
      from public.product_variants
     where product_id = p_product_id
       and id <> all(v_matched_ids)
  loop
    begin
      delete from public.product_variants where id = v_existing.id;
    exception when foreign_key_violation then
      -- Tiene pedidos: no se puede borrar sin romper el histórico.
      -- La archivamos con stock=0 para que deje de venderse.
      update public.product_variants
         set stock = 0
       where id = v_existing.id;
      v_archived := v_archived || v_existing.sku;
    end;
  end loop;

  return jsonb_build_object(
    'archived', v_archived,
    'restocked', v_restocked
  );
end;
$$;

grant execute on function public.sync_product_variants(uuid, jsonb) to service_role;
