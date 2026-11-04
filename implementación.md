Actúa como un Staff Software Engineer y Tech Lead Fullstack. Vamos a construir desde cero una plataforma e-commerce de moda de lujo/minimalista llamada **ARShop** ("Tienda de ropa oculta, sin sede física").

La arquitectura debe ser limpia, modular, desacoplada y lista para entornos de producción, implementada como un Monorepo (Turborepo o PNPM Workspaces):
- `apps/web`: Next.js (App Router, React 19 / TypeScript, Tailwind CSS v4, Lucide Icons).
- `apps/api`: NestJS (TypeScript, Node.js, arquitectura limpia por módulos, DTOs con class-validator).
- Base de datos & Auth: Supabase (PostgreSQL, Supabase Auth nativo, RLS policies).
- Pagos: Stripe (Stripe Elements / Checkout con Webhooks seguros; NUNCA recibir ni almacenar PAN/CVC de tarjetas en el backend para cumplimiento PCI-DSS).
- Emails: Resend (envíos transaccionales).
- Infraestructura: Docker Compose (desarrollo local del backend, Redis para colas) y Vercel (despliegue de frontend).

---

### 1. SISTEMA DE DISEÑO (ESTRICTO BASADO EN DESIGN.MD)
El diseño visual debe seguir estrictamente la filosofía **White-cube fashion gallery** del archivo `DESIGN.md`:
- **Paleta monocromática estricta**:
  - Carbon (`#222222`) para tipografía, iconos, wordmark y fondo del footer invertido.
  - Paper (`#ffffff`) para fondos de página, tarjetas y canvas principal.
  - Ash Gray (`#b6b6b6`) para líneas de búsqueda y placeholders.
  - Stone (`#f5f5f5`) para franjas secundarias y fondos de utilidades.
  - Smoke (`#e6e6e6`) para divisores y bordes sutiles.
  - Prohibido el uso de colores cromáticos decorativos (el único color proviene de la fotografía editorial de las prendas).
- **Tipografía**: Sans-serif geométrica para UI/cuerpo (Inter o Söhne como fallback) a pesos 400 y 700; tratamiento editorial con Display/Serif para títulos de sección y el wordmark `ARShop`.
- **Formas y Elevación**:
  - `border-radius: 0px` absoluto en botones, imágenes, cards e inputs.
  - Cero sombras (`box-shadow: none`). La jerarquía se define mediante espacios (`gap: 24px`, secciones de `48px-72px`) y contraste.
- **Header**: Barra de 3 zonas:
  - Izquierda: Selector de género dinámico ("HOMBRE" / "MUJER") y navegación por categorías.
  - Centro: Logotipo tipográfico `ARShop`.
  - Derecha: Búsqueda minimalista con línea inferior, Acceso de Cuenta y Carrito.

---

### 2. ROLES Y CONTROL DE ACCESO (RBAC)
- **Roles**:
  - `CUSTOMER`: Navega productos sin autenticación. Al registrarse vía Supabase Auth, gestiona dirección, compras, historial personal y seguimiento.
  - `ADMIN`: Acceso restringido vía Guards/Middlewares en NestJS y verificación en Supabase Auth (`raw_user_meta_data` o tabla `profiles.role`).
- **Módulos y Permisos**:
  - Catálogo público por Género: `CAMISAS`, `CAMISETAS`, `TOPS` (exclusivo para mujeres), `ROPA INTERIOR`, `CALZADO`, `PANTALONES`.
  - Módulos Exclusivos de Administrador:
    1. **Inventario / Catálogo CRUD**: Creación, actualización y borrado de prendas, variantes (tallas, colores), precios y control de existencias en tiempo real.
    2. **Gestión de Usuarios**: Listado, bloqueo y detalles de clientes.
    3. **Logs del Sistema**: Registro de auditoría de acciones sensibles de administración.
    4. **Historial de Compras Global**: Auditoría de órdenes, estado de pagos y actualización de envíos.

---

### 3. FLUJO DE COMPRA Y POLÍTICAS
1. **Exploración**: El usuario consulta el catálogo sin sesión activa.
2. **Registro / Login**: Flujo nativo con Supabase Auth.
3. **Checkout y Protección de Datos**:
   - Formulario de envío (Dirección, Barrio, Ciudad, Teléfono, Notas).
   - Checkbox obligatorio de aceptación de la Política de Tratamiento de Datos Personales (Habeas Data / GDPR).
   - Procesamiento de pago: Cifrado y tokenización vía **Stripe Elements** en el cliente. El backend genera el `PaymentIntent` y nunca manipula números de tarjeta.
4. **Confirmación y Envíos**:
   - Webhook de Stripe validado mediante firma secreta (`stripe-signature`).
   - Tras el cobro exitoso, reducción atómica de stock en PostgreSQL y cálculo del tiempo estimado de entrega basado en la zona.
   - Disparo asíncrono de correo de confirmación de compra y factura con Resend.

---

### 4. ARQUITECTURA TÉCNICA Y RESILIENCIA
- **Rate Limiting**: Configurar `@nestjs/throttler` (máximo 5 intentos por IP en endpoints de autenticación y checkout, devolviendo HTTP 429).
- **Procesamiento Asíncrono**: En lugar de sobrecargar con RabbitMQ, implementar **BullMQ con Redis** (manejado vía Docker Compose) para la cola de emails transaccionales (Resend) y tareas en background.
- **Estructura Modular de NestJS**:
  - `src/modules/auth/`
  - `src/modules/users/`
  - `src/modules/products/`
  - `src/modules/inventory/`
  - `src/modules/orders/`
  - `src/modules/payments/` (Stripe)
  - `src/modules/notifications/` (Resend & Queue)
  - `src/modules/audit-logs/`

---

### TU TAREA INICIAL
1. Genera la estructura de directorios del monorepo (`apps/web`, `apps/api`, `docker-compose.yml`).
2. Diseña el esquema SQL para Supabase/PostgreSQL (tablas `profiles`, `products`, `product_variants`, `orders`, `order_items`, `audit_logs`).
3. Provee la configuración de estilos de Tailwind v4 y variables CSS respetando rigurosamente el documento de diseño.
4. Desarrolla paso a paso los módulos core priorizando tipado estricto, DTOs y manejo de errores.