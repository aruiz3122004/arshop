-- ═══════════════════════════════════════════════════════════════════
-- Migración 001: tarifas de envío + columna shipping_cost_cop en orders
-- Ejecutar en Supabase SQL Editor (o psql) UNA SOLA VEZ en instalaciones
-- que ya tengan el schema inicial aplicado.
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columna de costo de envío en la orden
alter table public.orders
  add column if not exists shipping_cost_cop integer not null default 0;

-- 2. Tabla de tarifas por departamento colombiano
create table if not exists public.shipping_rates (
  department       text    primary key,
  cost_cop         integer not null default 18000,
  free_above_cop   integer not null default 450000
);

-- 3. Datos iniciales
insert into public.shipping_rates (department, cost_cop, free_above_cop) values
  ('Bogotá D.C.',         10000, 350000),
  ('Cundinamarca',        12000, 350000),
  ('Antioquia',           14000, 400000),
  ('Valle del Cauca',     14000, 400000),
  ('Atlántico',           16000, 400000),
  ('Santander',           16000, 450000),
  ('Tolima',              16000, 400000),
  ('Norte de Santander',  16000, 450000),
  ('Risaralda',           14000, 400000),
  ('Caldas',              14000, 400000),
  ('Quindío',             14000, 400000),
  ('Bolívar',             18000, 450000),
  ('Córdoba',             18000, 450000),
  ('Meta',                18000, 450000),
  ('Huila',               18000, 450000),
  ('Cesar',               18000, 450000),
  ('Magdalena',           18000, 450000),
  ('Nariño',              20000, 500000),
  ('Cauca',               20000, 500000),
  ('La Guajira',          22000, 600000),
  ('Chocó',               22000, 600000),
  ('Putumayo',            22000, 600000),
  ('Amazonas',            25000, 600000),
  ('Vichada',             25000, 600000),
  ('Guainía',             25000, 600000),
  ('Vaupés',              25000, 600000)
on conflict (department) do nothing;
