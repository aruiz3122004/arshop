-- 025: ventana de confirmación de entregas simuladas
--
-- Una entrega simulada (el repartidor no obtuvo QR ni el código del cliente)
-- queda en `delivery_confirmation = 'PENDING_CLIENT'`. Antes, al vencer el
-- plazo el pedido se auto-aceptaba. Ahora el plazo tiene dos hitos:
--
--   * `delivery_reminder_at`      → 24 h: recordatorio push al cliente.
--   * `delivery_auto_confirm_at`  → 48 h: sin respuesta, pasa a DISPUTED y
--                                    lo revisa un administrador.
--
-- `delivery_reminder_sent_at` evita reenviar el recordatorio en cada barrido
-- del cron (que corre cada 10 min).

alter table public.orders
  add column if not exists delivery_reminder_at timestamptz,
  add column if not exists delivery_reminder_sent_at timestamptz,
  add column if not exists delivery_pin_skipped boolean not null default false;

comment on column public.orders.delivery_reminder_at is
  'Momento en que se envía el recordatorio al cliente (simulación + 24 h por defecto).';
comment on column public.orders.delivery_reminder_sent_at is
  'Cuándo se envió el recordatorio; null = pendiente. Guarda contra duplicados.';
comment on column public.orders.delivery_pin_skipped is
  'La entrega se simuló sin el PIN del repartidor (solo datos del receptor).';

-- El barrido de recordatorios filtra por estado + fecha + "aún no enviado":
-- sin este índice es un seq scan sobre toda la tabla cada 10 minutos.
create index if not exists orders_pending_client_reminder_idx
  on public.orders (delivery_reminder_at)
  where delivery_confirmation = 'PENDING_CLIENT'
    and delivery_reminder_sent_at is null;

-- La consulta de escalado (vencimiento de las 48 h) reutiliza
-- idx_orders_pending_auto_confirm, creado en 012 sobre las mismas columnas.
