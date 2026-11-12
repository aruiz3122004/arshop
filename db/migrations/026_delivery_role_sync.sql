-- 026: consistencia entre profiles.role = 'REPARTIDOR' y la fila operativa
--      en public.domiciliarios.
--
-- Problema reportado: subir el rol a REPARTIDOR desde SQL (o desde el panel de
-- usuarios) mostraba el botón "Domiciliario", pero TODOS los endpoints
-- /delivery/* exigen una fila en public.domiciliarios
-- (`requireMyDomiciliario` → 404 "No tienes perfil de domiciliario").
-- Eran dos fuentes de verdad que sólo el panel de admin mantenía juntas.
--
-- Ahora la sincronización es del lado de la base: cualquier camino (panel,
-- SQL, import masivo) deja el estado consistente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Helper: garantiza la fila operativa con valores provisionales.
--    disponibilidad = 'INACTIVO' para que el repartidor no reciba pedidos
--    hasta que complete ciudad/vehículo/placa por su cuenta.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ensure_domiciliario_row(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domiciliarios (
    user_id,
    nombre_completo,
    departamento,
    ciudad,
    vehiculo,
    placa,
    ciudad_placa,
    disponibilidad
  )
  select
    p.id,
    coalesce(nullif(p.full_name, ''), p.email, 'Repartidor'),
    'Sin asignar',
    'Sin asignar',
    'Sin asignar',
    'SIN-PLACA',
    'Sin asignar',
    'INACTIVO'
  from public.profiles p
  where p.id = p_user_id
  on conflict (user_id) do nothing;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) profiles.role → 'REPARTIDOR' ⇒ crea el perfil operativo si falta.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_profile_role_to_domiciliario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_domiciliario_row(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profile_role_to_domiciliario on public.profiles;
create trigger trg_profile_role_to_domiciliario
  after update of role on public.profiles
  for each row
  when (new.role = 'REPARTIDOR' and old.role is distinct from new.role)
  execute function public.trg_profile_role_to_domiciliario();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) INSERT en domiciliarios ⇒ promueve profiles.role (camino inverso: crear
--    primero la ficha operativa desde SQL).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_domiciliario_to_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set role = 'REPARTIDOR'
   where id = new.user_id
     and role <> 'REPARTIDOR';
  return new;
end;
$$;

drop trigger if exists trg_domiciliario_to_profile_role on public.domiciliarios;
create trigger trg_domiciliario_to_profile_role
  after insert on public.domiciliarios
  for each row
  execute function public.trg_domiciliario_to_profile_role();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Deja de ser REPARTIDOR ⇒ se marca INACTIVO (no se borra: conserva el
--    histórico de entregas y bonos).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_profile_role_leave_domiciliario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.domiciliarios
     set disponibilidad = 'INACTIVO'
   where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_profile_role_leave_domiciliario on public.profiles;
create trigger trg_profile_role_leave_domiciliario
  after update of role on public.profiles
  for each row
  when (old.role = 'REPARTIDOR' and new.role <> 'REPARTIDOR')
  execute function public.trg_profile_role_leave_domiciliario();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Reparar los casos ya existentes (rol sin ficha operativa).
-- ─────────────────────────────────────────────────────────────────────────────
select public.ensure_domiciliario_row(p.id)
  from public.profiles p
 where p.role = 'REPARTIDOR';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Hardening: `profiles_update_own` permitía a cualquier usuario autenticado
--    hacer PATCH /rest/v1/profiles con la anon key pública y cambiarse
--    role='ADMIN' (o blocked=false). El front nunca escribe profiles directo:
--    todo pasa por el backend con service_role. Revocamos el UPDATE de la API.
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.profiles from anon, authenticated;
