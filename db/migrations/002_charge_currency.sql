-- ═══════════════════════════════════════════════════════════════════
-- Migración 002: columna charge_currency en orders
-- Ejecutar en Supabase SQL Editor UNA SOLA VEZ en instalaciones existentes.
-- ═══════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists charge_currency text not null default 'COP';
