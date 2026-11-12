-- 027: cerrar escrituras directas del cliente sobre `orders`.
--
-- Contexto: la app nunca escribe en Supabase desde el navegador (todo pasa por
-- NestJS con service_role). Pero la policy `orders_repartidor_update`
-- (migración 011) permitía a un repartidor autenticado hacer
-- `PATCH /rest/v1/orders?id=eq.<su orden>` con la anon key pública y cambiar
-- CUALQUIER columna de sus órdenes asignadas — incluido `status = 'DELIVERED'` —
-- saltándose el QR/PIN, el código del cliente y la ventana de confirmación que
-- valida el backend.
--
-- RLS no puede limitar columnas, así que se revoca el privilegio de UPDATE:
-- la policy queda inerte y el único camino de escritura es el backend.

revoke update on public.orders from anon, authenticated;
