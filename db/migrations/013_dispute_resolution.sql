-- ═══════════════════════════════════════════════════════════════════════════
-- 013_dispute_resolution.sql — Resolución de disputas de entrega simulada
--
-- Añade columnas para que un admin pueda cerrar una disputa dando la razón
-- al cliente (reembolso + CANCELLED) o al repartidor (DELIVERED forzado).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists delivery_dispute_resolution      text,
  add column if not exists delivery_dispute_resolved_at     timestamptz,
  add column if not exists delivery_dispute_resolved_by     uuid references auth.users(id) on delete set null,
  add column if not exists delivery_dispute_resolution_note text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_dispute_resolution_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_dispute_resolution_check
      check (
        delivery_dispute_resolution is null
        or delivery_dispute_resolution in ('REFUNDED', 'FORCED_ACCEPTED')
      );
  end if;
end $$;

-- Lista rápida para la bandeja de disputas pendientes del admin.
create index if not exists idx_orders_disputed_pending
  on public.orders (delivery_disputed_at desc)
  where delivery_confirmation = 'DISPUTED'
    and delivery_dispute_resolution is null;
