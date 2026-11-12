# Facturación electrónica DIAN en ARShop

> Documento de análisis y diseño. **No es asesoría tributaria.** Antes de emitir
> facturas reales, validar RUT, responsabilidades, numeración y tratamiento de
> IVA con un contador público.

---

## 1. Resumen ejecutivo

ARShop **ya calcula el IVA del 19 %** y genera un comprobante imprimible, pero
**no emite factura electrónica de venta (FEV)**. No existe hoy en el proyecto
un CUFE, un XML UBL 2.1, una firma XAdES-EPES ni una comunicación con la DIAN.

La DIAN **sí tiene una alternativa 100 % gratuita**: el servicio
**“Facturación Gratuita DIAN”**, que incluye software y certificado de firma
digital sin costo. El límite es que **no ofrece una API pública** para que un
e-commerce emita automáticamente: se opera desde el portal de la DIAN y, para
volumen, mediante sus plantillas de carga.

Por eso hay dos caminos gratuitos reales:

| Camino | Costo | Automatización | Encaje con ARShop |
|---|---|---|---|
| **A. Facturación Gratuita DIAN** | $0 (software + certificado) | Baja / semimanual (portal + plantillas) | Alto para bajo volumen o portafolio |
| **B. Software propio con `dian-kit` (MIT)** | $0 de licencia + certificado ONAC | Alta (XML, firma, SOAP, CUFE) | Alto para producción real |

**Recomendación:** implementar una **capa de proveedor de facturación** con dos
modos:

1. `DIAN_FREE` (gratuito, modo asistido): el admin genera el paquete/plantilla,
   lo sube al portal de la DIAN y registra el CUFE/número aceptado.
2. `DIAN_OWN` (software propio, automatizado): usa `dian-kit` para firmar y
   enviar a la DIAN, primero en habilitación y luego en producción.

Así se empieza **hoy con $0** y se puede pasar a automatización sin reescribir
el dominio. El modo `DIAN_FREE` es el que se acopla al panel de admin sin
comprar nada; el modo `DIAN_OWN` es el que convierte al proyecto en un
facturador electrónico autónomo.

---

## 2. Qué tiene hoy el proyecto (hallazgos)

### 2.1 Lo que ya sirve

- `orders` guarda `subtotal_cop`, `discount_cop`, `tax_cop`, `shipping_cost_cop`
  y `total_cop` (migración `024_commercial_gaps.sql`).
- `tax_cop = netItemsCop - round(netItemsCop / 1.19)`: IVA incluido sobre las
  prendas.
- `profiles` ya tiene `document_type` (`CC`, `CE`, `PP`, `NIT`) y
  `document_number`.
- El webhook de Stripe transiciona la orden a `PAID` y dispara el correo de
  confirmación (`payments.controller.ts`).
- Hay `audit_logs`, BullMQ + Resend, generación de QR y panel admin.
- El detalle del pedido genera un comprobante HTML imprimible con desglose de
  base gravable e IVA.

### 2.2 Lo que falta para una FEV real

- No hay CUFE, XML UBL 2.1, firma digital ni envío a la DIAN.
- El “comprobante fiscal” actual **no es una factura electrónica**: es un
  documento interno imprimible. Llamarlo “DIAN” en la UI puede inducir a error.
- No hay configuración fiscal de la empresa (NIT, DV, responsabilidades,
  dirección, municipio DANE, resolución de numeración).
- No hay tabla de facturas, numeración, notas crédito ni eventos DIAN.
- El checkout **no captura ni exige** tipo/número de documento del comprador;
  la orden no guarda un snapshot fiscal del adquiriente.
- La cancelación/reembolso no genera **nota crédito**.
- El IVA se calcula **solo sobre las prendas**, no sobre el envío cobrado.
- No hay control de certificado `.p12` ni de secretos de firma.
- No hay ambiente de habilitación vs. producción.

---

## 3. Marco legal mínimo (Colombia)

### 3.1 Normas principales

- **Art. 615 ET**: obligación de expedir factura.
- **Art. 616-1 ET** (modificado por la Ley 2010 de 2019): factura electrónica
  de venta.
- **Decreto 1625 de 2016** (DUR tributario), artículos 1.6.1.4.1 y siguientes.
- **Resolución DIAN 000165 de 2023**, modificada por las resoluciones
  **000008 de 2024**, **000119 de 2024**, **000189 de 2024** y
  **000202 de 2025**. Anexo técnico vigente de factura electrónica de venta.
- **Resolución 000085 de 2022** y normas de RADIAN (para facturas recibidas;
  no es necesario para emitir ventas, pero sí si se quiere gestionar compras).

### 3.2 Requisitos para poder facturar

1. **RUT actualizado** con la responsabilidad **“O-48 — Obligado a facturar
   electrónicamente”** (o la que corresponda).
2. **NIT y dígito de verificación** de la empresa.
3. **Instrumento de Firma Electrónica (IFE)** habilitado para autorizar
   rangos de numeración.
4. **Software de facturación**:
   - el **software gratuito de la DIAN**, o
   - **software propio** registrado en el portal de habilitación (ID y PIN del
     software). Si se vende el software a terceros, se requiere la calidad de
     **proveedor tecnológico**; para facturar solo las ventas propias no.
5. **Certificado de firma digital**:
   - **gratuito** si se usa el software “Facturación Gratuita DIAN”
     (vigencia de 2 años);
   - **de pago** (CA acreditada por ONAC: Andes SCD, Certicámara, GSE, etc.)
     si se usa software propio.
6. **Resolución de numeración** de factura electrónica y de contingencia, con
   prefijo, rango, clave técnica y fechas.
7. **Habilitación**: set de pruebas en el ambiente de habilitación, luego
   fecha de inicio de operación y paso a producción.
8. **Actualización del RUT** cuando corresponda.

### 3.3 Obligaciones operativas

- Emitir la factura **al momento de la venta/pago**; no es un documento
  opcional ni un “recibo” posterior.
- Entregar al comprador el **XML** y la **representación gráfica** (PDF) con
  **CUFE** y **QR** de validación.
- **Nota crédito** para devoluciones, retractos, descuentos posteriores o
  reembolsos; **nota débito** para cargos adicionales.
- **Conservar** XML, PDF, acuses y eventos **mínimo 5 años** (Art. 632 ET y
  normativa de facturación).
- Manejar **contingencia** si la DIAN no responde.
- Tratar los datos del comprador conforme a la **Ley 1581 de 2012** (Habeas
  Data), igual que ya hace el checkout.

### 3.4 Si el proyecto es solo portafolio/demo

Mientras no haya ventas reales **no hay obligación de emitir FEV**. En ese caso
lo correcto es:

- implementar y probar **solo en ambiente de habilitación/sandbox**;
- no afirmar en la UI que el comprobante actual es una “factura DIAN”;
- no usar el certificado ni la numeración reales.

---

## 4. Opciones evaluadas

### 4.1 Facturación Gratuita DIAN (recomendada para empezar con $0)

**Qué es:** software web de la DIAN + certificado de firma digital gratuito.
Permite emitir y recibir documentos sin límite, desde cualquier dispositivo.

**Ventajas:**

- Costo real **$0**.
- Legalmente válido.
- Incluye certificado y numeración.
- Tiene herramienta de **plantillas** para generar facturas de forma masiva.

**Límites:**

- No hay API pública documentada para integrar un e-commerce.
- El flujo es por el portal de la DIAN (carga/plantillas o captura manual).
- Menos control sobre PDF, correo y automatización.
- No sirve para emitir en tiempo real desde el checkout sin intervención.

**Cómo se acopla a ARShop:** modo **asistido**. El panel admin genera un
paquete con los datos de la orden (CSV/JSON + ficha imprimible), el operador lo
sube al portal, y luego registra en ARShop el número y CUFE aceptados (o sube el
XML de respuesta). El cliente recibe el PDF/XML desde la DIAN o desde ARShop.

### 4.2 Software propio con `dian-kit` (recomendada para producción)

**Qué es:** SDK open-source MIT para TypeScript/Node.js:
`@dian-kit/core` + `@dian-kit/sdk-node`. Genera UBL 2.1, firma XAdES-EPES,
calcula CUFE/CUDE y envía por SOAP con WS-Security a la DIAN.

**Ventajas:**

- **$0 de licencia**; sin intermediarios ni costo por documento.
- 100 % TypeScript/Node.js, encaja con NestJS.
- Pipeline completo: XML → firma → CUFE → SOAP → DIAN.
- Soporta factura, documento POS, nota crédito y nota débito.
- Se valida contra el sandbox de la DIAN.

**Costos/riesgos:**

- Certificado de firma digital de una CA acreditada (decenas a cientos de
  miles de COP al año, según CA y vigencia).
- Registro del software propio, set de pruebas y habilitación.
- Proyecto **joven** (v1.0.1, abril de 2026, ~20 estrellas). Hay que aislarlo
  detrás de una interfaz, probarlo contra sandbox y conservar los XML.
- La DIAN cambia anexos técnicos: hay que mantener el SDK actualizado.

**Cómo se acopla a ARShop:** modo **automático**. La orden `PAID` encola un job
idempotente que asigna número, construye el XML, firma, envía a la DIAN, guarda
CUFE/XML/PDF y envía el correo al cliente.

### 4.3 ERP open-source Nubicta (no recomendado para este repo)

Nubicta (Laravel + Vue, MIT) ya implementa FEV DIAN como software propio, pero
es un ERP completo en otro stack. Usarlo obligaría a duplicar la operación
(ventas, inventario, contabilidad) o a mantener dos sistemas. No se acopla al
monolito NestJS/Next.js.

### 4.4 Proveedores con API (si no se quiere mantener la firma)

Factus, Alegra, Siigo, Dataico, etc. ofrecen API REST y sandbox gratuito, pero
el servicio en producción suele ser pago por documento o por plan. Son la
opción si se prioriza **cero mantenimiento** sobre **cero costo**.

---

## 5. Arquitectura recomendada

```
Stripe webhook / admin
        │
        ▼
OrdersService (PAID)
        │  jobId = invoice:{orderId}
        ▼
BullMQ  ──►  InvoicingProcessor
                 │
                 ├─ 1. ¿Factura ya existe?  (idempotencia)
                 ├─ 2. Asignar número atómico (RPC FOR UPDATE)
                 ├─ 3. Construir payload fiscal (líneas, IVA, descuentos)
                 ├─ 4. Provider.issue()
                 │      ├─ DIAN_FREE  → paquete/plantilla + PENDING_MANUAL
                 │      ├─ DIAN_OWN   → dian-kit: XML + firma + SOAP
                 │      └─ FACTUS     → API REST (opcional)
                 ├─ 5. Guardar XML/PDF/CUFE/estado
                 └─ 6. Correo al cliente + auditoría
```

### 5.1 Principios

- **Nunca bloquear el pago** por un fallo de facturación. Si la DIAN falla, la
  orden sigue `PAID` y la factura queda `PENDING`/`FAILED` con reintento.
- **Idempotencia**: una orden = una factura. `jobId` determinista y restricción
  `unique(order_id)`.
- **Numeración atómica y sin huecos**: RPC con `FOR UPDATE`; no se reutiliza un
  número aceptado.
- **Trazabilidad**: guardar request, XML firmado, respuesta DIAN, CUFE, trackId,
  errores y usuario que intervino.
- **Secretos fuera del cliente**: `.p12` y contraseña solo en backend, cifrados
  en reposo; nunca en logs ni en el navegador.
- **Ambiente explícito**: `HABILITACION` vs `PRODUCCION`; el modo producción
  exige confirmación y no se activa por defecto.

### 5.2 Interfaz de proveedor

```ts
export type InvoiceProviderId = "DIAN_FREE" | "DIAN_OWN" | "FACTUS";

export interface IssueInvoiceInput {
  order: OrderWithItems;
  seller: CompanyFiscalSettings;
  numbering: InvoiceNumberingRange;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
}

export interface IssueInvoiceResult {
  status: "ISSUED" | "PENDING_MANUAL" | "REJECTED" | "FAILED";
  number?: string;
  cufe?: string;
  xml?: string;
  pdf?: Buffer;
  trackId?: string;
  dianStatusCode?: string;
  dianMessage?: string;
}

export interface InvoiceProvider {
  readonly id: InvoiceProviderId;
  issue(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  creditNote?(input: CreditNoteInput): Promise<IssueInvoiceResult>;
  getStatus?(trackId: string): Promise<IssueInvoiceResult>;
}
```

---

## 6. Modelo de datos propuesto (migración `028`)

> Convención del repo: migraciones numeradas, idempotentes, ejecutadas en
> Supabase SQL Editor. Todo el acceso de escritura pasa por NestJS con
> `service_role`.

### 6.1 `company_fiscal_settings` (singleton)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `boolean PK default true` | una sola fila |
| `legal_name` | `text` | razón social |
| `trade_name` | `text` | nombre comercial |
| `nit` | `text` | sin DV |
| `dv` | `text` | dígito de verificación |
| `tax_regime` | `text` | régimen / responsabilidad |
| `fiscal_responsibilities` | `text[]` | códigos DIAN |
| `address` | `text` | dirección fiscal |
| `municipality_code` | `text` | código DANE |
| `department` | `text` | |
| `email` / `phone` | `text` | |
| `logo_url` | `text` | |
| `invoice_provider` | `text` | `DIAN_FREE` / `DIAN_OWN` / `FACTUS` |
| `environment` | `text` | `HABILITACION` / `PRODUCCION` |
| `enabled` | `boolean` | interruptor global |
| `certificate_path` | `text` | ruta privada en Storage |
| `certificate_password_enc` | `text` | AES-256-GCM |
| `software_id` / `software_pin` | `text` | software propio |
| `updated_at` | `timestamptz` | |

### 6.2 `invoice_numbering_ranges`

`id`, `document_type` (`FV`/`NC`/`ND`), `prefix`, `resolution_number`,
`resolution_date`, `range_from`, `range_to`, `current_number`, `valid_from`,
`valid_to`, `technical_key`, `active`.

La asignación de número se hace con una función `next_invoice_number(range_id)`
que bloquea la fila (`FOR UPDATE`) y devuelve el siguiente consecutivo.

### 6.3 `invoices`

`id`, `order_id unique`, `number`, `prefix`, `cufe`, `status`
(`PENDING`/`PENDING_MANUAL`/`ISSUED`/`REJECTED`/`FAILED`/`VOID`),
`provider`, `environment`, `issue_date`, `xml_url`, `pdf_url`,
`dian_track_id`, `dian_status_code`, `dian_message`,
`taxable_base_cop`, `tax_cop`, `total_cop`, `currency`,
`seller_snapshot jsonb`, `buyer_snapshot jsonb`,
`created_at`, `accepted_at`, `retry_count`.

### 6.4 `invoice_lines`

`id`, `invoice_id`, `order_item_id`, `description`, `quantity`,
`unit_price_cop`, `discount_cop`, `tax_rate`, `tax_cop`, `line_total_cop`,
`tax_scheme` (`01` = IVA).

### 6.5 `invoice_events`

`id`, `invoice_id`, `type` (`CREATED`/`SENT`/`ACCEPTED`/`REJECTED`/`RETRY`/
`CREDIT_NOTE`/`MANUAL_MARK`), `payload jsonb`, `actor_id`, `created_at`.

### 6.6 `credit_notes`

`id`, `invoice_id`, `order_id`, `number`, `cufe`, `status`, `reason`,
`amount_cop`, `xml_url`, `pdf_url`, `created_at`.

### 6.7 Campos fiscales en `orders`

Para no depender de cambios posteriores del perfil:

`billing_document_type`, `billing_document_number`, `billing_legal_name`,
`billing_email`, `billing_address jsonb`, `billing_municipality_code`.

### 6.8 Seguridad

- `revoke all on ... from anon, authenticated` en las tablas nuevas.
- Lectura/escritura solo desde el backend con `service_role`.
- Certificado en bucket privado de Supabase Storage; descarga firmada de corta
  duración solo para el worker.
- Cifrado del `.p12` y de la contraseña con `INVOICE_CERT_ENCRYPTION_KEY`
  (AES-256-GCM). La clave vive en el entorno, no en la DB.
- Nunca loggear el certificado, la contraseña, la clave técnica ni el XML con
  datos personales completos.

---

## 7. Backend: módulo `invoicing`

```
backend/src/modules/invoicing/
├── invoicing.module.ts
├── invoicing.controller.ts          # /admin/invoices, /admin/invoicing
├── invoicing.service.ts             # orquestación y máquina de estados
├── invoice-numbering.service.ts     # RPC atómica
├── invoice-pdf.service.ts           # representación gráfica + QR
├── invoice-mailer.service.ts        # Resend con XML/PDF
├── providers/
│   ├── invoice-provider.interface.ts
│   ├── dian-free.provider.ts        # paquete/plantilla + manual
│   ├── dian-own.provider.ts         # dian-kit
│   └── factus.provider.ts           # opcional
├── processors/
│   └── invoice.processor.ts         # BullMQ
└── dto/
    ├── issue-invoice.dto.ts
    ├── mark-issued.dto.ts
    ├── credit-note.dto.ts
    └── fiscal-settings.dto.ts
```

### 7.1 Endpoints (todos `@Roles("ADMIN")` salvo el público)

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/invoicing/settings` | leer configuración fiscal |
| `PUT` | `/admin/invoicing/settings` | guardar NIT, responsabilidades, proveedor |
| `POST` | `/admin/invoicing/certificate` | subir `.p12` + contraseña (multipart) |
| `GET` | `/admin/invoicing/numbering` | rangos |
| `POST` | `/admin/invoicing/numbering` | crear/editar rango |
| `POST` | `/admin/invoicing/test` | probar credenciales/sandbox |
| `GET` | `/admin/invoices` | listado con filtros (`status`, `q`, fechas) |
| `GET` | `/admin/invoices/:id` | detalle + timeline |
| `POST` | `/admin/orders/:id/invoice` | emitir factura de una orden |
| `POST` | `/admin/invoices/:id/retry` | reintentar rechazo/fallo |
| `POST` | `/admin/invoices/:id/mark-issued` | modo manual: número + CUFE + XML |
| `GET` | `/admin/invoices/:id/xml` | descargar XML |
| `GET` | `/admin/invoices/:id/pdf` | descargar PDF |
| `POST` | `/admin/invoices/:id/credit-note` | nota crédito (total/parcial) |
| `GET` | `/invoices/:token` | enlace público firmado para el comprador |

### 7.2 Eventos que disparan facturación

- `payment_intent.succeeded` → tras `updateStatus(PAID)` y confirmación de
  stock, encolar `invoice:{orderId}`.
- `POST /admin/orders/:id/invoice` → emisión manual si el job falló.
- Cancelación/reembolso/RMA aprobado → si existe factura `ISSUED`, encolar
  nota crédito; si no existe, no hacer nada.
- Cambio de estado DIAN → `invoice_events` + auditoría.

### 7.3 Idempotencia y errores

- `jobId = invoice:{orderId}` y `unique(order_id)`.
- Si la DIAN rechaza por datos, no reintentar a ciegas: marcar `REJECTED` con
  el mensaje y mostrar acción “Corregir datos y reintentar”.
- Si falla la red/SOAP, reintentar con backoff (3–5 intentos) y dejar
  `FAILED` visible en el panel.
- Un número asignado a un documento aceptado **no se reutiliza**.

---

## 8. Panel de administración

### 8.1 Nueva entrada de navegación

En `apps/web/src/app/admin/layout.tsx`:

```ts
{ href: "/admin/facturacion", label: "Facturación", icon: ReceiptText }
```

### 8.2 `/admin/facturacion`

- Tarjetas: `Pendientes`, `Emitidas`, `Rechazadas`, `Valor facturado`.
- Tabla: pedido, número, CUFE (truncado), total, estado, fecha, acciones.
- Filtros por estado y búsqueda por número/pedido/documento.
- Acciones: emitir, reintentar, descargar XML/PDF, ver detalle, nota crédito.
- Aviso visible si `environment = HABILITACION`.

### 8.3 `/admin/facturacion/configuracion`

- Datos de la empresa (NIT, DV, responsabilidades, dirección, municipio DANE).
- Proveedor: `Facturación Gratuita DIAN` / `Software propio` / `Factus`.
- Ambiente: habilitación / producción.
- Certificado `.p12` + contraseña (solo subida; nunca se muestra).
- Rangos de numeración (prefijo, resolución, rango, clave técnica, vigencia).
- Botón “Probar conexión” (sandbox).
- Interruptor “Facturación activa”.

### 8.4 En `/admin/pedidos`

- Botón **“Facturar”** para órdenes `PAID` sin factura.
- Badge de estado de factura (`Pendiente`, `Emitida`, `Rechazada`).
- En el detalle del pedido: sección “Factura electrónica” con número, CUFE,
  estado y descargas.
- Renombrar el botón actual “Descargar comprobante” a **“Comprobante de
  pedido”** y no etiquetarlo como DIAN hasta que exista una FEV real.

### 8.5 En el checkout

- Capturar **tipo y número de documento**, **nombre/razón social** y **correo
  de facturación** (prellenar desde `profiles`).
- Si el comprador no da documento, aplicar la figura de **consumidor final**
  que permita el anexo vigente (validar con contador).
- Guardar snapshot en `orders.billing_*` al crear la orden.
- No bloquear el checkout por validaciones fiscales más allá de formato/DV.

---

## 9. Cálculo fiscal: ajustes necesarios antes de emitir

### 9.1 IVA sobre el envío

Hoy:

```ts
const taxCop = netItemsCop - Math.round(netItemsCop / 1.19);
```

El envío cobrado al cliente **no** entra en la base. Si ARShop cobra el envío
como parte del precio, lo consistente es que también haga parte de la base
gravable y se discrimine en la factura. Hay que decidir con el contador:

- **Opción 1 (recomendada si ARShop cobra el flete):** sumar
  `shipping_cost_cop` a la base y calcular IVA sobre el total
  (`items + envío - descuento`).
- **Opción 2 (si el flete lo factura un tercero por separado):** mantenerlo
  fuera y documentar por qué.

Agregar columnas `shipping_tax_cop` y `taxable_base_cop` para no recalcular
hacia atrás.

### 9.2 Descuentos por línea

El cupón es un descuento a nivel de orden. Para UBL 2.1 conviene **prorratear**
el descuento entre las líneas y emitir `AllowanceCharge` por línea o a nivel
documento. Si no se prorratea, el IVA por línea y el total pueden no cuadrar
con la DIAN.

### 9.3 Redondeo

Los precios están en enteros COP. La DIAN trabaja con decimales (2 decimales).
Definir una única función de redondeo (half-up) y usarla en:
base por línea, IVA por línea, total por línea y totales del documento.

### 9.4 Moneda

La factura debe emitirse en **COP**, aunque Stripe haya cobrado en USD/EUR.
Usar `total_cop` y no `charge_currency` para el documento fiscal.

---

## 10. Plan de implementación por fases

### Fase 0 — Preparación fiscal y de datos (½–1 día)

- Migración `028_electronic_invoicing.sql`.
- Configuración fiscal en admin.
- Captura de datos de facturación en checkout + snapshot en `orders`.
- Ajuste de cálculo de IVA (envío y prorrateo de descuento).
- Renombrar el comprobante actual.

**Entregable:** ARShop sabe “a quién y por cuánto” facturar, sin emitir aún.

### Fase 1 — Modo `DIAN_FREE` asistido (2–3 días)

- Generar paquete/plantilla y ficha imprimible por orden.
- Pantalla de facturación con estados `PENDING_MANUAL` / `ISSUED`.
- Registro manual de número + CUFE + XML aceptado.
- Almacenamiento de XML/PDF y correo al cliente.
- Botón “Descargar paquete DIAN” y “Marcar como emitida”.

**Entregable:** operación real con **$0** y portal de la DIAN, con trazabilidad
en ARShop.

### Fase 2 — Modo `DIAN_OWN` con `dian-kit` (3–5 días)

- Instalar `@dian-kit/core` y `@dian-kit/sdk-node`.
- Provider con `environment: "2"` (habilitación) y `"1"` (producción).
- Asignación atómica de número, XML, firma, SOAP, CUFE.
- Reintentos, estados y auditoría.
- Pruebas contra sandbox de la DIAN.
- Set de pruebas y paso a producción con el contador.

**Entregable:** facturación automática desde el webhook de pago.

### Fase 3 — Notas crédito y contingencia (2 días)

- Nota crédito automática en reembolso/retracto/RMA.
- Nota débito para cargos adicionales.
- Flujo de contingencia si la DIAN no responde.
- Reportes y retención de 5 años.

### Fase 4 — Proveedor pago opcional (1–2 días)

- Adaptador Factus/Alegra/Siigo si se prefiere delegar la firma y el soporte.

---

## 11. Decisiones que hay que tomar antes de implementar

1. ¿Habrá ventas reales o el proyecto sigue siendo portafolio/demo?
2. ¿Ya existe RUT con responsabilidad `O-48`, NIT y numeración?
3. ¿Se acepta el flujo semimanual de la DIAN gratuita o se necesita
   automatización total?
4. Si se automatiza: ¿se compra certificado de firma digital? ¿Qué CA?
5. ¿El envío cobrado al cliente lleva IVA? (contador)
6. ¿Quién administra la numeración y las notas crédito? (rol admin)
7. ¿Se conserva el comprobante actual como “comprobante de pedido” o se
   reemplaza por la representación gráfica de la FEV?

---

## 12. Referencias

- DIAN — Sistema de Factura Electrónica:
  <https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/>
- DIAN — Facturación Gratuita DIAN:
  <https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/facturacion-gratuita-dian/>
- DIAN — ¿Qué requieres para facturar electrónicamente?:
  <https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/que-requieres-para-factura-electronicamente/>
- DIAN — Normatividad:
  <https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/normatividad/>
- `dian-kit` (MIT, TypeScript):
  <https://github.com/sergioarojasm98/dian-kit>
- Nubicta (ERP open-source colombiano, referencia de implementación):
  <https://github.com/bvr218/nubicta>
- Factus (API paga, sandbox gratuito, referencia de contrato REST):
  <https://www.factus.com.co/>

---

## 13. Estado de implementación en ARShop (modo demo)

Esta sección describe lo que quedó construido en el repositorio. El proyecto
sigue siendo un portafolio con datos ficticios: **el modo por defecto es
`DIAN_SIMULATED` en `HABILITACION` y no transmite nada a la DIAN.**

### 13.1 Backend

- Migración `db/migrations/028_electronic_invoicing.sql`:
  - `company_fiscal_settings` (singleton), `invoice_numbering_ranges`,
    `invoices`, `invoice_lines`, `invoice_events`, `credit_notes`.
  - RPC `next_invoice_number(uuid)` con `FOR UPDATE` y permisos solo para
    `service_role`.
  - Columnas fiscales en `orders`: `billing_*`, `invoice_status`,
    `taxable_base_cop`, `shipping_tax_cop`.
  - Seed de ARShop S.A.S. (DEMO), NIT `901482109-4`, prefijos `FEAR` y `NCAR`.
- Módulo `backend/src/modules/invoicing`:
  - `InvoicingService`: emisión, reintentos, registro manual de CUFE, notas
    crédito, listados, descargas y enlace público firmado.
  - `InvoiceNumberingService`: asignación atómica vía RPC con fallback
    optimista.
  - `invoice-xml.builder.ts`: XML UBL 2.1, CUFE SHA-384, cadena clave-valor,
    QR y nota crédito.
  - Proveedores: `DIAN_SIMULATED`, `DIAN_FREE`, `DIAN_OWN`, `FACTUS`.
- Emisión automática después de confirmar el pago (webhook de Stripe y
  `dev/simulate-paid`), sin bloquear la orden si falla.
- Nota crédito automática al reembolsar una orden con factura emitida.
- Correo `invoice-issued` con número, CUFE y enlace al pedido.

### 13.2 Frontend

- `/admin/facturacion`: listado, estadísticas, filtros, búsqueda y órdenes por
  facturar (con acción “Emitir factura”).
- `/admin/facturacion/[id]`: detalle con líneas, totales, snapshots,
  línea de tiempo, QR, notas crédito, descarga de XML, representación
  imprimible, enlace público, reintento y registro manual de CUFE.
- `/admin/facturacion/configuracion`: datos del emisor, proveedor/ambiente,
  prueba de configuración y rangos de numeración.
- `/admin/pedidos`: columna “Factura” y acción “Facturar”.
- Checkout: captura opcional de tipo/número de documento, razón social y
  correo de facturación; se guarda como snapshot en la orden.
- `/cuenta/pedidos/[id]`: tarjeta de factura con número, estado, CUFE y enlace
  público. El comprobante imprimible sigue siendo “Comprobante de Pedido”, no
  una factura DIAN.

### 13.3 Ajustes fiscales aplicados

- IVA 19 % incluido también sobre el envío cobrado por ARShop.
- Descuento de orden prorrateado por línea con reparto determinista del
  remanente en pesos.
- `taxable_base_cop` y `shipping_tax_cop` persistidos en la orden.
- Totales de la factura recalculados desde las líneas, no desde la orden.

### 13.4 Pendiente para producción real (fase 2)

- Instalar y configurar el adaptador `dian-kit` (firma XAdES-EPES, SOAP,
  certificado `.p12`).
- Cargar certificado y PIN/software ID de forma cifrada; hoy el modelo tiene
  columnas pero la UI no los captura.
- Probar contra el sandbox de la DIAN y obtener numeración autorizada real.
- Nota débito, contingencia, retención documental y reportes.
- Validación con contador público de RUT, responsabilidades y tratamiento del
  IVA del envío.
