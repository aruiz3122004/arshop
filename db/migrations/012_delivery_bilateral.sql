-- ═══════════════════════════════════════════════════════════════════════════
-- 012_delivery_bilateral.sql — Confirmación bilateral de entrega
--
-- Añade:
--   1. Código numérico dinámico de 4 dígitos (equivalente al QR, por si el
--      cliente puede dictarlo pero no mostrar el QR).
--   2. Estado de confirmación cuando el repartidor simula la entrega:
--      cliente dispone de 48 h para aceptar / disputar; si no responde el
--      scheduler marca AUTO_ACCEPTED.
--
-- Idempotente. Pegar en Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Columnas en orders
alter table public.orders
  add column if not exists client_code_hash         text,
  add column if not exists client_code_exp          timestamptz,
  add column if not exists delivery_confirmation    text,
  add column if not exists delivery_simulated_at    timestamptz,
  add column if not exists delivery_auto_confirm_at timestamptz,
  add column if not exists delivery_disputed_at     timestamptz,
  add column if not exists delivery_dispute_reason  text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_confirmation_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_confirmation_check
      check (
        delivery_confirmation is null
        or delivery_confirmation in (
          'PENDING_CLIENT',
          'ACCEPTED',
          'AUTO_ACCEPTED',
          'DISPUTED'
        )
      );
  end if;
end $$;

-- Índice parcial para el scheduler de auto-aceptación: sólo filas pendientes.
create index if not exists idx_orders_pending_auto_confirm
  on public.orders (delivery_auto_confirm_at)
  where delivery_confirmation = 'PENDING_CLIENT';

-- 2) Consumo atómico del código de 4 dígitos (análogo a consume_order_qr).
-- Recibe el hash ya calculado por el backend (sha256(code || order_id || secret)).
-- Si coincide con client_code_hash y no está expirado, marca el QR como
-- consumido (reutilizando qr_consumed_at para no duplicar lógica) y limpia
-- el código. Devuelve true en el primer consumo, false si ya se consumió o
-- hash/exp no coinciden.
create or replace function public.consume_order_client_code(
  p_order_id uuid,
  p_hash     text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_rows integer;
begin
  update public.orders
     set qr_consumed_at   = now(),
         client_code_hash = null,
         client_code_exp  = null
   where id = p_order_id
     and client_code_hash = p_hash
     and client_code_exp is not null
     and client_code_exp > now()
     and qr_consumed_at is null;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

grant execute on function public.consume_order_client_code(uuid, text) to service_role;
