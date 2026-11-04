-- ═══════════════════════════════════════════════════════════════════════════
-- Backorder / notify-when-available
--
-- Tabla simple: cada fila es una suscripción activa (notified_at NULL) o
-- consumida (notified_at timestamp). Un usuario sólo puede tener UNA
-- suscripción activa por variante — enforced con índice único parcial.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.stock_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);

create unique index if not exists uniq_stock_notifications_active
  on public.stock_notifications (user_id, variant_id)
  where notified_at is null;

create index if not exists idx_stock_notifications_variant_pending
  on public.stock_notifications (variant_id)
  where notified_at is null;
