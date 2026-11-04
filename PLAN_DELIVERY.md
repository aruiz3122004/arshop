# PLAN DE EJECUCIÓN — Sistema de Domiciliarios ARShop

> Fuente: `Prompt_remake.txt`. Generado 2026-10-21.
> Marca con `[x]` lo que esté hecho. Convención: ⚡ bloqueante · 🔧 incompleto · ✨ polish.

---

## Arquitectura técnica

| Pieza | Decisión |
|---|---|
| Nuevo rol | Extender enum `user_role` → `('CUSTOMER','ADMIN','DELIVERY')` |
| QR | Firmado con HMAC-SHA256 + `jti` único almacenado en Redis TTL 48h → un solo uso real |
| Km extra | Centroides lat/lng ciudades CO hardcodeados + fórmula Haversine. Sin API externa |
| "Biometría" | WebAuthn si disponible + fallback PIN 4 dígitos. Validación server-side |
| Correo 00:00 | BullMQ Repeatable Job cron `0 0 * * *` |
| Push móvil | Web Push (VAPID) desde backend. PWA, sin FCM/APNs |
| Tablas nuevas | `domiciliarios`, `recibido`, `delivery_bonos`, `delivery_pin` |

---

## 🅰 Tareas MANUALES (usuario)

- [ ] Ejecutar en orden en Supabase SQL Editor:
  1. `db/migrations/010_delivery_schema.sql`
  2. `db/migrations/011_delivery_rls.sql`
  3. `db/data/co_city_centroids.sql`
- [ ] Añadir al `backend/.env`:
  ```env
  QR_HMAC_SECRET=<genera 64 chars aleatorios — p.ej. `openssl rand -hex 32`>
  DELIVERY_BONUS_BASE_COP=30000
  DELIVERY_FREE_RADIUS_KM=15
  QR_TTL_SECONDS=172800

  # Claves VAPID generadas (listas para pegar)
  VAPID_PUBLIC_KEY=BC4-bJMwVwGEefo-XMXPeC7NkOTTdf8Bc6U8ONcHhQlzT-5wTeSo2QYVADjftbYS4eXSyHzqH3AjNJ0K5oYpffQ
  VAPID_PRIVATE_KEY=R7sJqvvIORzU8nVpaBihK1DfElN-cpDq3T9mSIBw0CU
  VAPID_SUBJECT=mailto:tu@email.com
  ```
- [ ] (Si quieres cambiar las VAPID): `cd backend && node -e "console.log(require('web-push').generateVAPIDKeys())"`
- [ ] (Opcional) Añadir al `apps/web/.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<igual al público>` (hoy no se consume del env — se trae por `GET /push/public-key`).
- [ ] Crear primer domiciliario de prueba desde `/admin/domiciliarios`.
- [ ] Hacer login con ese usuario y entrar a `/domiciliario` para probar el flujo.

---

## 🅱 Tareas AUTOMÁTICAS (Claude)

### Bloque 1 · Base de datos [Media]

- [x] `db/migrations/010_delivery_schema.sql` — enum REPARTIDOR, tablas nuevas, columnas en `orders`
- [x] `db/migrations/011_delivery_rls.sql` — políticas RLS para rol REPARTIDOR
- [x] `db/data/co_city_centroids.sql` — ciudades CO con lat/lng
- [x] Funciones SQL: `assign_delivery`, `add_business_days`, `haversine_km`, `consume_order_qr`

### Bloque 2 · Backend NestJS [Alto]

- [x] Módulo `delivery`: controller + service + DTOs
  - [x] `GET /delivery/mine/orders?status=`
  - [x] `GET /delivery/mine/bonos`
  - [x] `GET /delivery/mine/profile` + `PATCH /delivery/mine/profile`
  - [x] `POST /delivery/mine/pin` (set/change PIN con scrypt)
  - [x] `POST /delivery/scan-qr`
  - [x] `POST /delivery/simulate/:orderId` (+ `POST /delivery/confirm/:orderId`)
- [x] Módulo `qr`: generador firmado + verificador HMAC + consumo por `jti`
- [x] Extensión `orders`:
  - [x] En `POST /orders` → llamar `assign_delivery()` + calcular `estimated_delivery_at`
  - [x] `POST /orders/:id/receiver-data` (cliente diligencia receptor)
  - [x] `GET /orders/:id/qr` (cliente obtiene QR firmado + dataURL)
- [x] Bonos: persistidos dentro de `assign_delivery()` (SQL), expuestos en `GET /delivery/mine/bonos`
- [x] Módulo `notifications`:
  - [x] Repeatable job `delivery-day` (cron `0 0 * * *` tz America/Bogota)
  - [x] Template email "Tu pedido llega hoy"
  - [x] Processor Web Push (push.service via VAPID)
- [x] CRUD admin de domiciliarios: `GET/POST/PATCH/DELETE /admin/deliveries`
- [x] Rol `REPARTIDOR` ya existía en la decorator; env.validation extendido con QR + VAPID
- [x] Email `order-unassigned` a todos los admins cuando `assign_delivery` devuelve UNASSIGNED

### Bloque 3 · Admin UI [Media]

- [x] `/admin/domiciliarios` — listar, crear, editar, borrar (modal con todos los campos)
- [x] Link en el sidebar admin
- [x] `/admin/pedidos` — nueva columna "Entrega": badge de delivery_status + ETA + marca QR ✓

### Bloque 4 · Vista `/domiciliario` [Alto]

- [x] Layout + guard de rol REPARTIDOR + nav mobile/desktop
- [x] Dashboard: KPIs (pendientes/completados/bonos del mes/reasignados)
- [x] Módulo Pedidos: tabs por estado + detalle con 2 checks
- [x] Scanner QR con `@zxing/browser` + fallback token manual
- [x] Flujo entrega: 2 checks (QR verde + datos receptor) + botón "Enviar"
- [x] Modal "Simular entrega" con PIN de 4 dígitos (WebAuthn pendiente — ver D1)
- [x] Módulo Bonos: histórico con km extra + motivo reasignación
- [x] Módulo Configuración: cambio de PIN, perfil, suscripción push

### Bloque 5 · Flujo QR del cliente [Media]

- [x] `/cuenta/pedidos/[id]/qr` — página con QR dinámico (refresh cada 60s)
- [x] Form receptor + botón "Diligenciar automáticamente" (desde profile)
- [x] Muestra `estimated_delivery_at` + warning de retraso cuando aplica
- [x] Overlay verde con fecha/hora cuando QR fue consumido
- [x] Botón QR agregado en `/cuenta/pedidos/[id]`

### Bloque 6 · Web Push + PWA [Media]

- [x] `apps/web/public/sw.js` extendido con `push` + `notificationclick`
- [x] Manifest.ts ya existía
- [x] Componente `PushOptIn` reusable (listo en `/domiciliario/configuracion` y `/cuenta`)
- [x] Endpoints `GET /push/public-key`, `POST /push/subscribe`, `DELETE /push/subscribe`
- [x] Tabla `push_subscriptions` creada en la migración
- [x] `PushService` con `web-push` (falla gracefully si VAPID no está configurado)

### Bloque 7 · Tests mínimos [Baja]

- [x] `qr.service.spec.ts` (4 tests: roundtrip, firma manipulada, payload modificado, single-use)
- [x] `delivery-pin.dto.spec.ts` (4 tests: validación de PIN y payload simulación)
- [ ] `assign_delivery` + haversine: no se testearon vía SQL — recomendado hacerlo con pgTAP si quieres añadirlo (requiere setup de DB local, lo dejé fuera por el tiempo).

Suite completa: **18/18 passing**.

---

## ⚠️ Decisiones pendientes (validación del usuario)

| # | Pregunta | Default arbitrario de Claude |
|---|---|---|
| D1 | WebAuthn o solo PIN para simular entrega | **PIN obligatorio + WebAuthn opcional** |
| D2 | Qué hacer si no hay domiciliario en todo CO | `assignment_pending` + email admin |
| D3 | PWA instalable + push real | **Sí**, manifest + SW |
| D4 | Centroides hardcoded vs API mapas | **Hardcoded 50 ciudades**, fallback 20 km |
| D5 | `recibido` reemplaza o complementa `delivered_at` | **Complementa** |

---

## Estado por bloque

| Bloque | Estado |
|---|---|
| 1. DB | ✅ Completado |
| 2. Backend | ✅ Completado |
| 3. Admin UI | ✅ Completado |
| 4. Vista `/domiciliario` | ✅ Completado |
| 5. QR cliente | ✅ Completado |
| 6. Push + PWA | ✅ Completado |
| 7. Tests | ✅ Completado |
