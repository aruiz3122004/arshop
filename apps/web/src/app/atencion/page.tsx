import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Truck,
  RotateCcw,
  Mail,
  QrCode,
  ShieldCheck,
  Clock,
  MapPin,
  PackageCheck,
  AlertCircle,
  Phone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Atención al Cliente: Envíos, Devoluciones y Contacto | ARShop",
  description:
    "Información detallada sobre envíos nacionales en Colombia, entregas verificadas con QR, política de devoluciones y retracto (Ley 1480) y canales de contacto de ARShop.",
};

const SECTIONS = [
  { id: "envios", title: "1. Envíos y Logística de Última Milla" },
  { id: "verificacion-qr", title: "2. Recepción Verificada con QR / PIN" },
  { id: "devoluciones", title: "3. Devoluciones, Cambios y Retracto" },
  { id: "garantias", title: "4. Garantía Legal de Calidad (Ley 1480)" },
  { id: "contacto", title: "5. Canales de Contacto y Soporte" },
];

export default function AtencionPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 pb-24">
      {/* ───── Breadcrumbs ───── */}
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Atención al Cliente" },
        ]}
      />

      {/* ───── Encabezado Editorial ───── */}
      <header className="border-b border-smoke pt-10 pb-12">
        <span className="caption uppercase tracking-[0.2em] text-graphite">
          Concierge & Postventa
        </span>
        <h1 className="font-display text-[34px] md:text-[44px] leading-tight tracking-tight text-carbon mt-3">
          Centro de Atención al Cliente
        </h1>
        <p className="caption text-graphite mt-3 max-w-2xl text-[14px] leading-relaxed">
          Conoce a detalle nuestra operación logística híbrida en toda Colombia,
          el protocolo criptográfico de entrega en puerta, tus derechos de cambio
          o retracto bajo el Estatuto del Consumidor y nuestros canales directos
          de soporte.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-4 border-t border-smoke/60 caption text-graphite text-[12px] font-mono">
          <span>COBERTURA: 32 DEPARTAMENTOS · COLOMBIA</span>
          <span>•</span>
          <span>NORMATIVA: LEY 1480 DE 2011 (SIC)</span>
        </div>
      </header>

      {/* ───── Cuerpo: Índice + Contenido ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-12 lg:gap-16 pt-12">
        {/* Índice de navegación lateral */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4">
            <h2 className="caption uppercase tracking-[0.16em] text-carbon font-semibold">
              Secciones
            </h2>
            <nav className="flex flex-col space-y-2 border-l border-smoke pl-4">
              {SECTIONS.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="caption text-graphite hover:text-carbon hover:translate-x-1 transition-all py-1"
                >
                  {sec.title}
                </a>
              ))}
            </nav>

            <div className="mt-8 border border-smoke p-4 bg-stone/30 space-y-2">
              <div className="flex items-center gap-2 text-carbon">
                <PackageCheck size={16} strokeWidth={1.5} />
                <span className="caption uppercase tracking-wider font-medium text-[11px]">
                  Rastreo en Vivo
                </span>
              </div>
              <p className="caption text-graphite text-[11px] leading-normal">
                Puedes consultar el estado de tu despacho, ver tu guía nacional o
                abrir tu código QR de recepción desde tu panel de usuario.
              </p>
              <Link
                href="/cuenta"
                className="inline-block caption uppercase tracking-[0.14em] text-[11px] text-carbon underline underline-offset-4 pt-1"
              >
                Ir a Mis Pedidos →
              </Link>
            </div>
          </div>
        </aside>

        {/* Contenido Principal */}
        <article className="prose prose-neutral max-w-none space-y-14">
          {/* 1. Envíos */}
          <section
            id="envios"
            className="scroll-mt-24 space-y-6 border-b border-smoke pb-12"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <Truck size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                1. Políticas de Envío y Logística Híbrida
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              En <strong>ARShop</strong> operamos sin tiendas físicas tradicionales
              para concentrar nuestra infraestructura en centros de distribución
              ocultos (<em>Dark Boutiques</em>) y una red de entrega de última milla
              de alta precisión en todo el territorio colombiano.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-smoke p-5 bg-stone/20">
                <div className="flex items-center gap-2 text-carbon mb-2">
                  <Clock size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-wider font-semibold text-carbon">
                    Ciudades Principales
                  </span>
                </div>
                <p className="font-mono text-[18px] text-carbon font-medium">
                  24 – 48 Horas
                </p>
                <p className="caption text-graphite text-[12px] mt-1">
                  Bogotá, Medellín, Cali, Barranquilla, Bucaramanga, Cartagena y
                  Eje Cafetero mediante flota domiciliaria directa.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20">
                <div className="flex items-center gap-2 text-carbon mb-2">
                  <MapPin size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-wider font-semibold text-carbon">
                    Resto del País
                  </span>
                </div>
                <p className="font-mono text-[18px] text-carbon font-medium">
                  3 – 5 Días Hábiles
                </p>
                <p className="caption text-graphite text-[12px] mt-1">
                  Despacho prioritario por transportadora nacional (Servientrega,
                  Coordinadora, Interrapidísimo, TCC o Envía).
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20">
                <div className="flex items-center gap-2 text-carbon mb-2">
                  <ShieldCheck size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-wider font-semibold text-carbon">
                    Tarifas de Despacho
                  </span>
                </div>
                <p className="font-mono text-[18px] text-carbon font-medium">
                  Gratis &gt; $250.000
                </p>
                <p className="caption text-graphite text-[12px] mt-1">
                  Envío estándar asegurado por $15.000 COP. Gratuito en órdenes
                  superiores a $250.000 COP en cualquier ciudad.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-[14px] leading-relaxed text-carbon/90 pt-2">
              <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                Modalidades de Despacho
              </h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Flota Domiciliaria ARShop (Última Milla):</strong> Una vez
                  confirmado tu pago en Stripe, nuestro motor logístico asigna
                  automáticamente al repartidor disponible en tu ciudad con menor
                  carga operativa, o al domiciliario más cercano de tu departamento
                  mediante geolocalización Haversine.
                </li>
                <li>
                  <strong>Transportadora Nacional Certificada:</strong> Para
                  municipios fuera del radio metropolitano directo, tu orden se
                  despacha con guía asegurada a través de <em>Servientrega</em>,{" "}
                  <em>Coordinadora</em>, <em>Interrapidísimo</em>, <em>TCC</em> o{" "}
                  <em>Envía</em>, con enlace directo de rastreo en el detalle de tu
                  pedido.
                </li>
              </ul>
            </div>
          </section>

          {/* 2. Verificación con QR */}
          <section
            id="verificacion-qr"
            className="scroll-mt-24 space-y-4 border-b border-smoke pb-12"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <QrCode size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                2. Entrega Verificada con Código QR y PIN de 4 Dígitos
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Para eliminar el riesgo de entregas extraviadas o suplantaciones,
              cada pedido cuenta con un protocolo criptográfico de recepción:
            </p>

            <div className="border border-carbon bg-stone/20 p-6 space-y-3">
              <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                ¿Cómo recibir tu paquete en puerta?
              </h3>
              <ol className="list-decimal pl-5 text-[13px] text-carbon/90 space-y-2 leading-relaxed">
                <li>
                  Ingresa a{" "}
                  <Link href="/cuenta" className="underline underline-offset-4 font-medium">
                    Mi Cuenta → Mis Pedidos
                  </Link>{" "}
                  y abre el detalle de tu compra activa.
                </li>
                <li>
                  Haz clic en <strong>&ldquo;Ver QR de Recepción&rdquo;</strong> para
                  mostrar en pantalla tu código QR dinámico firmado digitalmente o tu{" "}
                  <strong>código numérico de 4 dígitos</strong>.
                </li>
                <li>
                  El domiciliario escaneará el QR desde su terminal (o ingresará el
                  PIN de 4 dígitos) para sellar la entrega como{" "}
                  <code className="text-[12px] bg-smoke/50 px-1.5 py-0.5">DELIVERED</code>.
                </li>
                <li>
                  Si el paquete es recibido en portería o por un tercero autorizado
                  sin QR en el momento, el pedido pasará a estado{" "}
                  <code className="text-[12px] bg-smoke/50 px-1.5 py-0.5">PENDING_CLIENT</code>{" "}
                  y tendrás <strong>48 horas</strong> para confirmar la recepción o
                  abrir una disputa con nuestro equipo de arbitraje.
                </li>
              </ol>
            </div>
          </section>

          {/* 3. Devoluciones y Retracto */}
          <section
            id="devoluciones"
            className="scroll-mt-24 space-y-6 border-b border-smoke pb-12"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <RotateCcw size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                3. Devoluciones, Cambios de Talla y Derecho de Retracto
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              En cumplimiento estricto del{" "}
              <strong>Artículo 47 de la Ley 1480 de 2011 (Estatuto del Consumidor)</strong>,
              garantizamos un proceso transparente y autogestionable desde tu cuenta
              para retractos, cambios de talla y cancelaciones previas al despacho:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-smoke p-5 bg-paper space-y-2">
                <span className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                  A. Cancelación Voluntaria Pre-Envío
                </span>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Mientras tu orden se encuentre en estado{" "}
                  <code className="text-carbon">PENDING_PAYMENT</code> o{" "}
                  <code className="text-carbon">PAID</code> (antes de pasar a ruta de
                  envío), puedes cancelarla instantáneamente desde tu cuenta. El
                  reembolso del 100% se dispara de forma automática en Stripe.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-paper space-y-2">
                <span className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                  B. Derecho de Retracto y Cambio de Talla (5 Días Hábiles)
                </span>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Una vez entregado tu pedido (<code className="text-carbon">DELIVERED</code>),
                  dispones de <strong>5 días hábiles</strong> para solicitar la
                  devolución total del dinero o el cambio por otra talla disponible
                  directamente desde el detalle de la orden.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-[14px] leading-relaxed text-carbon/90">
              <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                Requisitos de Estado de la Prenda
              </h3>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  La prenda debe encontrarse sin uso, sin lavado, sin olores ni
                  alteraciones de sastrería.
                </li>
                <li>
                  Debe conservar sus etiquetas colgantes originales, precintos de
                  seguridad y empaque editorial ARShop.
                </li>
                <li>
                  Una vez aprobada la solicitud RMA por nuestro equipo administrativo,
                  el reembolso se procesa directamente a la tarjeta o medio de pago
                  original en Stripe (reflejándose entre 3 y 7 días hábiles según tu
                  entidad bancaria).
                </li>
              </ul>
            </div>
          </section>

          {/* 4. Garantías */}
          <section
            id="garantias"
            className="scroll-mt-24 space-y-4 border-b border-smoke pb-12"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <AlertCircle size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                4. Garantía Legal de Calidad (30 Días Calendario)
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Todas las piezas de ARShop cuentan con una{" "}
              <strong>garantía legal de 30 días calendario</strong> a partir de la
              fecha de entrega por defectos de fabricación, costuras, herrajes o
              imperfecciones textiles. En caso de presentarse una novedad de
              calidad, ARShop asumirá el 100% de los costos de recolección inversa y
              el cliente podrá elegir entre la reposición por una pieza nueva, cambio
              por otro artículo o el reembolso íntegro de su dinero.
            </p>
          </section>

          {/* 5. Contacto */}
          <section id="contacto" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-2.5 text-carbon">
              <Mail size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                5. Canales Oficiales de Contacto y Soporte
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Nuestro equipo de Concierge y Operaciones atiende requerimientos de
              pedidos, seguimiento logístico, cambios de talla y facturación DIAN de{" "}
              <strong>lunes a sábado entre las 8:00 a.m. y las 7:00 p.m. (COT)</strong>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <p className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                  Atención General & Concierge
                </p>
                <p className="font-mono text-[14px] text-carbon">
                  contacto@arshop.co
                </p>
                <p className="caption text-graphite text-[12px]">
                  Asesoría de tallas, calces (fit), disponibilidad de Drops y soporte
                  de compras. Respuesta en menos de 4 horas hábiles.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <p className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                  Logística, Guías & Entregas QR
                </p>
                <p className="font-mono text-[14px] text-carbon">
                  logistica@arshop.co
                </p>
                <p className="caption text-graphite text-[12px]">
                  Coordinación de entregas con domiciliario, novedades de dirección y
                  guías nacionales.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <p className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                  Devoluciones, Retractos & Garantías (RMA)
                </p>
                <p className="font-mono text-[14px] text-carbon">
                  devoluciones@arshop.co
                </p>
                <p className="caption text-graphite text-[12px]">
                  Gestión de cambios de talla, retractos Ley 1480 y seguimiento de
                  reembolsos en Stripe.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Phone size={14} strokeWidth={1.5} className="text-carbon" />
                  <p className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                    Línea Directa & WhatsApp Concierge
                  </p>
                </div>
                <p className="font-mono text-[14px] text-carbon">
                  +57 (300) 555-0199
                </p>
                <p className="caption text-graphite text-[12px]">
                  Atención prioritaria en Colombia · Centro Operativo: Bogotá D.C. &
                  Medellín (Operación 100% digital sin sede abierta al público).
                </p>
              </div>
            </div>
          </section>
        </article>
      </div>

      {/* ───── Enlace de retorno ───── */}
      <div className="mt-16 pt-8 border-t border-smoke flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/"
          className="caption uppercase tracking-[0.16em] text-carbon border-b border-carbon pb-1 hover:opacity-70 transition-opacity"
        >
          ← Volver a la boutique
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/compania#faq"
            className="caption uppercase tracking-[0.14em] text-graphite hover:text-carbon transition-colors"
          >
            Ver Preguntas Frecuentes (FAQ) →
          </Link>
          <span className="caption text-graphite text-[12px] font-mono">
            ARSHOP © {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </div>
  );
}
