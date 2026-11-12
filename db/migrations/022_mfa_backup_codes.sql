-- ═══════════════════════════════════════════════════════════════════════════
-- Backup codes para MFA
--
-- Cuando el usuario activa MFA puede generar 8 códigos de respaldo single-use.
-- Guardamos un hash scrypt de cada código (nunca el código en claro). Al usar
-- uno en el login, se elimina de la lista en una sola operación atómica
-- (`consume_mfa_backup_code`). Si quedan 0, el usuario puede regenerar la
-- tanda — eso invalida los 8 anteriores de un solo golpe.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_mfa
  add column if not exists backup_codes      text[]      not null default '{}',
  add column if not exists backup_codes_at   timestamptz;

-- RPC: consume atómico de un backup code
-- Recibe el hash candidato. Si matchea alguno guardado, lo elimina del array
-- y devuelve true. Si no, devuelve false. Lock FOR UPDATE sobre la fila del
-- usuario para evitar que dos requests concurrentes consuman el mismo code.
create or replace function public.consume_mfa_backup_code(
  p_user_id uuid,
  p_hash text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_codes text[];
  v_matched boolean := false;
begin
  select backup_codes into v_codes
    from public.user_mfa
   where user_id = p_user_id
   for update;

  if v_codes is null then
    return false;
  end if;

  if p_hash = any(v_codes) then
    update public.user_mfa
       set backup_codes = array_remove(v_codes, p_hash)
     where user_id = p_user_id;
    v_matched := true;
  end if;

  return v_matched;
end;
$$;

grant execute on function public.consume_mfa_backup_code(uuid, text) to service_role;
