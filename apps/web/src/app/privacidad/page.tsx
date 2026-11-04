import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ShieldCheck, Lock, CreditCard, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Privacidad y Términos de Pago | ARShop",
  description:
    "Política de tratamiento de datos personales, privacidad y acuerdos de procesamiento seguro de pagos con Stripe en ARShop.",
};

const SECTIONS = [
  { id: "general", title: "1. Información General y Responsable" },
  { id: "datos", title: "2. Tratamiento de Datos Personales (Habeas Data)" },
  { id: "stripe", title: "3. Procesamiento de Pagos y Contrato con Stripe" },
  { id: "seguridad", title: "4. Seguridad, Cifrado y PCI-DSS" },
  { id: "derechos", title: "5. Derechos del Titular (ARCO)" },
  { id: "cookies", title: "6. Cookies y Almacenamiento Local" },
  { id: "contacto", title: "7. Contacto y Reclamaciones" },
];

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 pb-24">
      {/* ───── Breadcrumbs ───── */}
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Legal" },
          { label: "Política de Privacidad" },
        ]}
      />

      {/* ───── Encabezado Editorial ───── */}
      <header className="border-b border-smoke pt-10 pb-12">
        <span className="caption uppercase tracking-[0.2em] text-graphite">
          Marco Legal & Términos
        </span>
        <h1 className="font-display text-[34px] md:text-[44px] leading-tight tracking-tight text-carbon mt-3">
          Política de Privacidad y Contrato de Pagos
        </h1>
        <p className="caption text-graphite mt-3 max-w-2xl text-[14px] leading-relaxed">
          En ARShop garantizamos la confidencialidad, integridad y protección rigurosa
          de tus datos personales y transaccionales, bajo estándares internacionales
          de privacidad y la infraestructura bancaria certificada de Stripe.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-4 border-t border-smoke/60 caption text-graphite text-[12px] font-mono">
          <span>ÚLTIMA ACTUALIZACIÓN: OCTUBRE 2026</span>
          <span>•</span>
          <span>JURISDICCIÓN: COLOMBIA / INTERNACIONAL</span>
        </div>
      </header>

      {/* ───── Cuerpo: Índice + Contenido ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-12 lg:gap-16 pt-12">
        {/* Índice de navegación lateral */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4">
            <h2 className="caption uppercase tracking-[0.16em] text-carbon font-semibold">
              Contenido
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

            <div className="mt-8 border border-smoke p-4 bg-stone/30">
              <div className="flex items-center gap-2 text-carbon">
                <ShieldCheck size={16} strokeWidth={1.5} />
                <span className="caption uppercase tracking-wider font-medium text-[11px]">
                  PCI-DSS Cumplimiento
                </span>
              </div>
              <p className="caption text-graphite text-[11px] mt-1.5 leading-normal">
                ARShop nunca almacena números de tarjeta ni códigos CVC en sus servidores.
              </p>
            </div>
          </div>
        </aside>

        {/* Cláusulas y Artículos */}
        <article className="prose prose-neutral max-w-none space-y-12">
          {/* 1. General */}
          <section id="general" className="scroll-mt-24 space-y-4 border-b border-smoke pb-10">
            <h2 className="font-display text-[24px] text-carbon tracking-tight">
              1. Información General y Responsable del Tratamiento
            </h2>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              El presente documento establece las condiciones de recolección, uso,
              almacenamiento y protección de la información facilitada por los usuarios
              de la plataforma <strong>ARShop</strong> (en adelante, la "Plataforma").
              ARShop opera como una galería editorial digital de moda contemporánea,
              comprometida con el respeto irrestricto de la privacidad de sus clientes.
            </p>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              Al navegar en la plataforma, crear una cuenta o formalizar una orden de
              compra, el usuario consiente de manera previa, expresa e informada las
              prácticas descritas en esta política.
            </p>
          </section>

          {/* 2. Tratamiento de Datos */}
          <section id="datos" className="scroll-mt-24 space-y-4 border-b border-smoke pb-10">
            <div className="flex items-center gap-2 text-carbon">
              <FileText size={18} strokeWidth={1.5} />
              <h2 className="font-display text-[24px] text-carbon tracking-tight">
                2. Tratamiento de Datos Personales (Habeas Data)
              </h2>
            </div>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              En concordancia con el régimen de protección de datos de Colombia
              (<strong>Ley Estatutaria 1581 de 2012</strong>, Decreto 1377 de 2013) y
              los principios aplicables del Reglamento General de Protección de Datos
              (<strong>GDPR</strong>), los datos recopilados comprenden:
            </p>
            <ul className="list-disc pl-5 text-[14px] leading-relaxed text-carbon/90 space-y-2">
              <li>
                <strong>Datos de Identificación y Contacto:</strong> Nombre completo,
                dirección de correo electrónico, documento de identidad y número de teléfono.
              </li>
              <li>
                <strong>Datos de Logística y Entrega:</strong> Dirección domiciliaria,
                ciudad, departamento, barrio y observaciones de entrega a nivel nacional.
              </li>
              <li>
                <strong>Datos Transaccionales:</strong> Identificador de orden,
                productos seleccionados, montos cobrados y recibos de compra.
              </li>
            </ul>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              <strong>Finalidad del tratamiento:</strong> La información personal se destina
              exclusivamente a procesar pedidos, coordinar despachos logísticos en toda Colombia,
              emitir comprobantes contables, remitir notificaciones de estado y brindar servicio
              postventa personalizado. ARShop <em>no vende ni transfiere</em> bases de datos
              a terceros para fines comerciales o de publicidad ajena.
            </p>
          </section>

          {/* 3. Contrato con Stripe */}
          <section id="stripe" className="scroll-mt-24 space-y-6 border-b border-smoke pb-10">
            <div className="flex items-center gap-2 text-carbon">
              <CreditCard size={18} strokeWidth={1.5} />
              <h2 className="font-display text-[24px] text-carbon tracking-tight">
                3. Procesamiento de Pagos y Contrato con Stripe
              </h2>
            </div>

            <div className="border border-carbon bg-stone/20 p-6">
              <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                Declaración de Infraestructura y Procesamiento con Stripe
              </h3>
              <p className="caption text-graphite text-[13px] mt-2 leading-relaxed">
                Todas las operaciones de pago realizadas en ARShop son procesadas por{" "}
                <strong className="text-carbon">Stripe Technology Europe, Ltd.</strong> y sus
                entidades afiliadas (colectivamente, <strong>"Stripe"</strong>), operando bajo
                licencias financieras internacionales.
              </p>
            </div>

            <div className="space-y-4 text-[14px] leading-relaxed text-carbon/90">
              <h4 className="caption uppercase tracking-[0.12em] font-bold text-carbon">
                3.1 Vinculación al Contrato de Servicios de Stripe
              </h4>
              <p>
                Al realizar una compra en ARShop, el usuario acepta de manera expresa quedar
                sujeto a los{" "}
                <a
                  href="https://stripe.com/es-us/legal/ssa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 font-medium text-carbon hover:opacity-70"
                >
                  Términos del Servicio de Stripe (Stripe Services Agreement)
                </a>{" "}
                y a la{" "}
                <a
                  href="https://stripe.com/es-us/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 font-medium text-carbon hover:opacity-70"
                >
                  Política Global de Privacidad de Stripe
                </a>
                . ARShop actúa como comercio afiliado y delega la captura técnica de pagos en dicha
                infraestructura.
              </p>

              <h4 className="caption uppercase tracking-[0.12em] font-bold text-carbon mt-6">
                3.2 Cero Almacenamiento de Datos Financieros Sensibles (Zero PAN/CVC)
              </h4>
              <p>
                Para garantizar la máxima seguridad y el cumplimiento estricto del estándar{" "}
                <strong>PCI-DSS (Payment Card Industry Data Security Standard) Nivel 1</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Los datos sensibles de tarjetas (número PAN, fecha de vencimiento y código de
                  seguridad CVC/CVV) son capturados directamente desde el navegador del usuario
                  mediante <strong>Stripe Elements</strong> a través de conexiones cifradas TLS/HTTPS.
                </li>
                <li>
                  ARShop <strong>nunca recibe, procesa, transfiere ni almacena</strong> números de tarjeta
                  de crédito o débito en sus servidores ni bases de datos.
                </li>
                <li>
                  Stripe retorna a ARShop únicamente un token criptográfico no reutilizable y un
                  identificador de intención de pago (<code>PaymentIntent</code>) para confirmar
                  el estado de la transacción.
                </li>
              </ul>

              <h4 className="caption uppercase tracking-[0.12em] font-bold text-carbon mt-6">
                3.3 Prevención de Fraude y 3D Secure 2.0
              </h4>
              <p>
                Las transacciones cuentan con el motor de detección de fraude en tiempo real{" "}
                <strong>Stripe Radar</strong> y protocolos de autenticación fuerte del pagador{" "}
                <strong>3D Secure 2.0</strong>, validando la identidad del titular ante la entidad
                emisora de la tarjeta bancaria.
              </p>

              <h4 className="caption uppercase tracking-[0.12em] font-bold text-carbon mt-6">
                3.4 Cargos, Moneda y Facturación
              </h4>
              <p>
                Los importes se procesan en la moneda indicada al momento del checkout (Pesos Colombianos - COP
                o moneda extranjera equivalente). En caso de devoluciones autorizadas o cancelaciones,
                el reembolso se procesa de forma directa a través del mismo método de pago original
                vía Stripe, según los tiempos de acreditación de la red bancaria emisora.
              </p>
            </div>
          </section>

          {/* 4. Seguridad y Cifrado */}
          <section id="seguridad" className="scroll-mt-24 space-y-4 border-b border-smoke pb-10">
            <div className="flex items-center gap-2 text-carbon">
              <Lock size={18} strokeWidth={1.5} />
              <h2 className="font-display text-[24px] text-carbon tracking-tight">
                4. Seguridad, Cifrado y Políticas Técnicas
              </h2>
            </div>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              Implementamos salvaguardas técnicas, administrativas y físicas de vanguardia:
            </p>
            <ul className="list-disc pl-5 text-[14px] leading-relaxed text-carbon/90 space-y-1.5">
              <li>
                <strong>Cifrado en Tránsito y en Reposo:</strong> Comunicaciones cifradas punto a punto
                con TLS 1.3 y algoritmos de alta robustez criptográfica.
              </li>
              <li>
                <strong>Políticas de Seguridad en Base de Datos (RLS):</strong> Acceso restringido por
                usuario mediante Row Level Security en Supabase/PostgreSQL.
              </li>
              <li>
                <strong>Prevención de Ataques y Rate Limiting:</strong> Controles de tasa de peticiones
                para mitigar ataques de fuerza bruta y denegación de servicio.
              </li>
            </ul>
          </section>

          {/* 5. Derechos ARCO */}
          <section id="derechos" className="scroll-mt-24 space-y-4 border-b border-smoke pb-10">
            <h2 className="font-display text-[24px] text-carbon tracking-tight">
              5. Derechos del Titular de los Datos (ARCO)
            </h2>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              En cualquier momento, el usuario titular de la información tiene derecho a:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="border border-smoke p-4 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">Acceso y Conocimiento</p>
                <p className="caption text-graphite mt-1 text-[12px]">Conocer qué datos personales reposan en nuestros sistemas.</p>
              </div>
              <div className="border border-smoke p-4 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">Rectificación</p>
                <p className="caption text-graphite mt-1 text-[12px]">Actualizar datos inexactos, parciales o desactualizados.</p>
              </div>
              <div className="border border-smoke p-4 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">Supresión (Cancelación)</p>
                <p className="caption text-graphite mt-1 text-[12px]">Solicitar la eliminación de su cuenta y datos personales.</p>
              </div>
              <div className="border border-smoke p-4 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">Revocatoria</p>
                <p className="caption text-graphite mt-1 text-[12px]">Revocar la autorización concedida para el tratamiento.</p>
              </div>
            </div>
          </section>

          {/* 6. Cookies */}
          <section id="cookies" className="scroll-mt-24 space-y-4 border-b border-smoke pb-10">
            <h2 className="font-display text-[24px] text-carbon tracking-tight">
              6. Cookies y Almacenamiento Local
            </h2>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              La plataforma utiliza almacenamiento local y cookies técnicas estrictamente
              necesarias para el funcionamiento del carrito de compras, la persistencia de la
              ubicación de envío seleccionada (departamento y ciudad) y el estado de la sesión
              autenticada. No empleamos cookies invasivas de rastreo publicitario de terceros.
            </p>
          </section>

          {/* 7. Contacto */}
          <section id="contacto" className="scroll-mt-24 space-y-4">
            <h2 className="font-display text-[24px] text-carbon tracking-tight">
              7. Contacto y Reclamaciones
            </h2>
            <p className="text-[14px] leading-relaxed text-carbon/90">
              Para formular solicitudes, consultas o quejas relativas al tratamiento de
              datos personales o transacciones con Stripe, puedes dirigirte a nuestro canal
              oficial de atención:
            </p>
            <div className="border border-smoke p-5 bg-paper space-y-2">
              <p className="caption text-carbon">
                <strong className="uppercase tracking-wider">Área Legal & Privacidad:</strong> privacidad@arshop.co
              </p>
              <p className="caption text-carbon">
                <strong className="uppercase tracking-wider">Atención al Cliente:</strong> contacto@arshop.co
              </p>
              <p className="caption text-graphite text-[12px]">
                Tiempo estimado de respuesta a requerimientos formales: 5 a 10 días hábiles.
              </p>
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
        <span className="caption text-graphite text-[12px] font-mono">
          ARSHOP © {new Date().getFullYear()}
        </span>
      </div>
    </div>
  );
}
