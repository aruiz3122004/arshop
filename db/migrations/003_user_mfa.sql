-- Migration 003: tabla user_mfa (TOTP + código email)
-- Idempotente: puede re-ejecutarse sin romper nada.
--
-- Guarda el secret TOTP por usuario y un código de email de respaldo.
-- Solo el service_role (backend) accede: RLS activa sin policies deja
-- la tabla cerrada para anon/authenticated por defecto.

create table if not exists public.user_mfa (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users(id) on delete cascade,
  totp_secret             text,
  mfa_enabled             boolean not null default false,
  email_code              text,
  email_code_expires_at   timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_user_mfa_user on public.user_mfa (user_id);

alter table public.user_mfa enable row level security;
