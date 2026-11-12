-- ═══════════════════════════════════════════════════════════════════════════
-- 029_product_reviews.sql — Reseñas verificadas de producto
--
-- Cada reseña queda atada a una línea de pedido (`order_items`) pagada o
-- entregada. Eso garantiza "compra verificada" sin depender de moderación
-- manual: si no compraste esa variante, la API no te deja reseñar.
--
-- Reglas:
--   · Una reseña por línea de pedido (índice único).
--   · `user_id` es nullable para no romper el histórico si se borra la cuenta
--     (y para que el día que exista guest checkout se pueda ampliar).
--   · `author_name` es snapshot: el nombre mostrado no cambia si el usuario
--     edita su perfil después.
--   · `status` permite moderación administrativa sin borrar la fila.
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.product_reviews (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  order_id        uuid not null references public.orders(id) on delete cascade,
  order_item_id   uuid not null references public.order_items(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  title           text,
  body            text not null check (char_length(body) between 20 and 2000),
  author_name     text not null,
  status          text not null default 'APPROVED'
                    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  moderation_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una sola reseña por línea comprada. Evita spam y dobles envíos.
create unique index if not exists uq_product_reviews_order_item
  on public.product_reviews (order_item_id);

create index if not exists idx_product_reviews_product
  on public.product_reviews (product_id, created_at desc)
  where status = 'APPROVED';

create index if not exists idx_product_reviews_status
  on public.product_reviews (status, created_at desc);

create index if not exists idx_product_reviews_user
  on public.product_reviews (user_id, created_at desc);

drop trigger if exists trg_product_reviews_updated_at on public.product_reviews;
create trigger trg_product_reviews_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

-- ───────────────────── Resumen agregado por producto ─────────────────────
-- Vista pública para no recalcular la distribución en cada request.
-- `security_invoker` respeta las políticas RLS de la tabla subyacente.
create or replace view public.product_rating_summary
with (security_invoker = true) as
select
  product_id,
  round(avg(rating)::numeric, 2)      as average_rating,
  count(*)::int                       as review_count,
  count(*) filter (where rating = 5)::int as five_star,
  count(*) filter (where rating = 4)::int as four_star,
  count(*) filter (where rating = 3)::int as three_star,
  count(*) filter (where rating = 2)::int as two_star,
  count(*) filter (where rating = 1)::int as one_star
from public.product_reviews
where status = 'APPROVED'
group by product_id;

-- ───────────────────── RLS ─────────────────────
alter table public.product_reviews enable row level security;

-- Lectura pública: sólo reseñas aprobadas.
drop policy if exists "reviews public read approved" on public.product_reviews;
create policy "reviews public read approved"
  on public.product_reviews for select
  using (status = 'APPROVED');

-- Admin: lectura total y moderación.
drop policy if exists "reviews admin read all" on public.product_reviews;
create policy "reviews admin read all"
  on public.product_reviews for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'ADMIN'
    )
  );

drop policy if exists "reviews admin update" on public.product_reviews;
create policy "reviews admin update"
  on public.product_reviews for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'ADMIN'
    )
  );

-- Escritura: sólo el backend con service_role (bypassa RLS). El cliente
-- nunca inserta directo: la API valida la compra contra `orders`.
revoke insert, update, delete on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;

-- La vista es de lectura pública.
grant select on public.product_rating_summary to anon, authenticated;
