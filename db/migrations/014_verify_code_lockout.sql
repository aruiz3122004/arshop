-- ═══════════════════════════════════════════════════════════════════════════
-- 014_verify_code_lockout.sql — Lockout por orden del código de 4 dígitos
--
-- Un domiciliario malicioso (ya autenticado y con la orden asignada) podría
-- probar los 10 000 códigos durante la ventana TTL. Añadimos contador +
-- bloqueo temporal análogo al PIN de simulación.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists verify_code_failed_attempts integer not null default 0,
  add column if not exists verify_code_locked_until    timestamptz;
