-- ═══════════════════════════════════════════════════════════════════════════
-- 030_guest_checkout.sql — Compra sin cuenta (guest checkout)
--
-- Antes: `orders.user_id` era NOT NULL → imposible comprar sin registrarse.
-- Ahora: la orden puede pertenecer a `auth.users` O a un invitado identificado
-- por email. El acceso del invitado a su pedido se hace con un token firmado
-- (HMAC) que se envía por correo y vive en la URL de seguimiento; no se guarda
-- en la base, por lo que no hay tokens en claro persistidos.
--
-- Idempotente. Pegar en Supabase SQL Editor y correr una vez.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders alter column user_id drop not null;

alter table public.orders add column if not exists guest_email text;
alter table public.orders add column if not exists guest_name  text;
alter table public.orders add column if not exists is_guest    boolean not null default false;

-- Búsqueda operativa: "pedidos de este correo" en admin/soporte.
create index if not exists idx_orders_guest_email
  on public.orders (guest_email)
  where guest_email is not null;

-- Toda orden debe tener un dueño: cuenta o email de invitado. Evita filas
-- huérfanas si un bug futuro inserta sin identidad.
do $$ begin
  alter table public.orders add constraint orders_identity_required
    check (user_id is not null or guest_email is not null);
exception when duplicate_object then null; end $$;

-- RLS no cambia: el invitado nunca lee `orders` directo con anon key.
-- El backend valida el token firmado y consulta con service_role.

comment on column public.orders.guest_email is
  'Email del comprador invitado (sin cuenta). Null si user_id está presente.';
comment on column public.orders.guest_name is
  'Nombre snapshot del comprador invitado, usado en factura y emails.';
comment on column public.orders.is_guest is
  'true si la orden se creó sin sesión. Se mantiene aunque luego se vincule.';
