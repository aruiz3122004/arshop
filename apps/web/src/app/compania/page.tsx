import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Sparkles,
  Leaf,
  BookOpen,
  HelpCircle,
  ShoppingBag,
  CreditCard,
  QrCode,
  SlidersHorizontal,
  Layers,
  Recycle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Compañía: Sobre ARShop, Sostenibilidad y FAQ (Guía de Compra) | ARShop",
  description:
    "Conoce la filosofía de ARShop (Moda oculta, sin sede física), nuestro compromiso de sostenibilidad textil en Colombia y la documentación FAQ paso a paso para tus compras.",
};

const SECTIONS = [
  { id: "sobre-arshop", title: "1. Sobre ARShop · Moda Oculta" },
  { id: "sostenibilidad", title: "2. Sostenibilidad & Trazabilidad" },
  { id: "guia-compra", title: "3. Guía Documentada de Compra" },
  { id: "faq", title: "4. Preguntas Frecuentes (FAQ)" },
];

const FAQ_ITEMS = [
  {
    category: "Catálogo, Búsqueda & Tallas",
    question: "¿Cómo funciona el buscador inteligente y cómo encuentro una prenda?",
    answer:
      "Puedes abrir el buscador desde el ícono de lupa en la barra superior (o presionando el buscador rápido). Nuestro motor de búsqueda aislado comprende sinónimos colombianos coloquiales: si buscas 'camibuso' encontrará polos y camisetas; si buscas 'tenis' mostrará calzado; si escribes 'chompa' o 'buzo' filtrará abrigos y chaquetas, incluso si cometes pequeños errores de ortografía (tolerancia a typos).",
  },
  {
    category: "Catálogo, Búsqueda & Tallas",
    question: "¿Cómo sé cuál es mi talla ideal antes de comprar?",
    answer:
      "En la página de cada producto encontrarás la etiqueta de calce (Regular, Oversized o Slim) y el botón 'Guía de Tallas'. Al abrirla podrás consultar las medidas exactas en centímetros de pecho, cintura, cadera y largo de prenda para elegir con precisión quirúrgica. Si al recibirla necesitas otra talla, tienes 5 días hábiles para solicitar un cambio de talla desde tu cuenta.",
  },
  {
    category: "Catálogo, Búsqueda & Tallas",
    question: "¿Qué son los lanzamientos 'Drop' y las alertas de reposición?",
    answer:
      "Algunas piezas de edición limitada se publican bajo modalidad 'Drop' con una ventana de lanzamiento programada y unidades numeradas. Si una talla se agota, puedes activar el botón 'Notificarme cuando vuelva' en la ficha del producto y nuestro sistema te enviará un correo automático apenas se libere o reponga una unidad.",
  },
  {
    category: "Carrito, Cupones & Reserva de Stock",
    question: "¿Mi prenda queda reservada mientras realizo el pago?",
    answer:
      "Sí. Al avanzar al checkout y generar tu orden, el motor transaccional de ARShop bloquea físicamente tu unidad en base de datos durante 15 minutos (bloqueo pesimista FOR UPDATE). Durante esa ventana nadie más puede comprar tu prenda mientras completas el pago en Stripe.",
  },
  {
    category: "Carrito, Cupones & Reserva de Stock",
    question: "¿Cómo aplico un cupón de descuento en mi compra?",
    answer:
      "En la página de Checkout verás el campo 'Código promocional'. Ingresa tu cupón (por ejemplo: BIENVENIDO10 para 10% OFF, DROP15 para 15% OFF en compras mayores a $200.000 COP, o ARSHOP30K para $30.000 COP de descuento en compras superiores a $250.000 COP) y haz clic en 'Aplicar'. El sistema recalculará automáticamente el subtotal y la base gravable de IVA.",
  },
  {
    category: "Pagos, Moneda & Facturación DIAN",
    question: "¿Es seguro pagar con tarjeta y qué monedas puedo visualizar?",
    answer:
      "Todos los pagos se procesan mediante Stripe bajo certificación PCI-DSS Nivel 1 y autenticación 3D Secure 2.0. ARShop nunca almacena números de tarjeta ni códigos CVC. Además, en la esquina superior derecha puedes alternar la visualización de precios entre Pesos Colombianos (COP), Dólares (USD) y Euros (EUR).",
  },
  {
    category: "Pagos, Moneda & Facturación DIAN",
    question: "¿Cómo descargo mi comprobante fiscal con desglose de IVA (19%)?",
    answer:
      "Todos los precios publicados incluyen el IVA legal del 19% en Colombia. Una vez realizado tu pedido, ingresa a 'Mi Cuenta → Mis Pedidos', abre el detalle de la orden y pulsa en 'Imprimir / Guardar Comprobante Fiscal' para obtener el documento con base gravable sin IVA, impuesto discriminado y descuentos aplicados.",
  },
  {
    category: "Entrega QR, Devoluciones & Cuenta",
    question: "¿Cómo funciona la entrega con Código QR o PIN de 4 dígitos?",
    answer:
      "Cuando el domiciliario de ARShop llega a tu dirección, abre 'Mi Cuenta → Mis Pedidos → Ver QR de Recepción'. Muestra el código QR en tu celular o índicale el código numérico de 4 dígitos. El repartidor lo validará en su aplicación para certificar que el paquete fue entregado en tus manos.",
  },
  {
    category: "Entrega QR, Devoluciones & Cuenta",
    question: "¿Cómo cancelo un pedido o solicito una devolución (Ley 1480)?",
    answer:
      "Si tu pedido aún no ha sido enviado (estados PENDING_PAYMENT o PAID), verás el botón 'Cancelar pedido' en el detalle de la orden para anularlo con reembolso inmediato en Stripe. Si ya fue entregado (DELIVERED), se habilitará el formulario 'Solicitar Devolución o Cambio (Ley 1480)' donde podrás elegir entre Retracto (reembolso), Cambio de Talla o Garantía por defecto.",
  },
  {
    category: "Entrega QR, Devoluciones & Cuenta",
    question: "¿Cómo puedo probar los distintos roles de la aplicación (Modo Demo)?",
    answer:
      "Si estás evaluando la plataforma, dirígete a '/cuenta' y utiliza el bloque 'Modo Demo Portafolio · Acceso 1-Clic'. Con un solo clic podrás iniciar sesión como Cliente, Administrador (/admin) o Repartidor (/domiciliario) con cuentas preconfiguradas.",
  },
];

export default function CompaniaPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 pb-24">
      {/* ───── Breadcrumbs ───── */}
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Compañía & FAQ" },
        ]}
      />

      {/* ───── Encabezado Editorial ───── */}
      <header className="border-b border-smoke pt-10 pb-12">
        <span className="caption uppercase tracking-[0.2em] text-graphite">
          Identidad, Sostenibilidad & Documentación
        </span>
        <h1 className="font-display text-[34px] md:text-[44px] leading-tight tracking-tight text-carbon mt-3">
          Sobre ARShop, Sostenibilidad y FAQ
        </h1>
        <p className="caption text-graphite mt-3 max-w-2xl text-[14px] leading-relaxed">
          Una casa de diseño textil contemporáneo nacida en Colombia bajo el
          manifiesto <em>&ldquo;Moda oculta, sin sede física&rdquo;</em>. Conoce
          nuestra arquitectura de marca, nuestra ética ambiental y la guía
          documentada completa para comprar en la plataforma.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-4 border-t border-smoke/60 caption text-graphite text-[12px] font-mono">
          <span>ARQUITECTURA: WHITE-CUBE GALLERY</span>
          <span>•</span>
          <span>PRODUCCIÓN: SMALL-BATCH COLOMBIA</span>
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

            <div className="mt-8 border border-smoke p-4 bg-stone/30 space-y-2">
              <div className="flex items-center gap-2 text-carbon">
                <HelpCircle size={16} strokeWidth={1.5} />
                <span className="caption uppercase tracking-wider font-medium text-[11px]">
                  ¿Necesitas ayuda directa?
                </span>
              </div>
              <p className="caption text-graphite text-[11px] leading-normal">
                Consulta nuestros tiempos de envío nacional, garantías y canales de
                contacto directo en la sección de Atención.
              </p>
              <Link
                href="/atencion"
                className="inline-block caption uppercase tracking-[0.14em] text-[11px] text-carbon underline underline-offset-4 pt-1"
              >
                Ir a Atención al Cliente →
              </Link>
            </div>
          </div>
        </aside>

        {/* Contenido Principal */}
        <article className="prose prose-neutral max-w-none space-y-16">
          {/* 1. Sobre ARShop */}
          <section
            id="sobre-arshop"
            className="scroll-mt-24 space-y-6 border-b border-smoke pb-14"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <Sparkles size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                1. Sobre ARShop: Moda Oculta, Sin Sede Física
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              <strong>ARShop</strong> nació con una premisa radical: eliminar el
              sobrecosto inmobiliario de las boutiques tradicionales y los
              intermediarios comerciales para invertir cada recurso en{" "}
              <strong>
                textiles de alto gramaje, patronaje arquitectónico e ingeniería
                logística propia
              </strong>
              .
            </p>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Nuestra plataforma está concebida bajo la estética{" "}
              <em>&ldquo;White-Cube Gallery&rdquo;</em> —un espacio monocromático y
              silencioso donde la estructura, la caída del tejido y el corte de cada
              prenda son los únicos protagonistas.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="border border-smoke p-5 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">
                  01 · Diseño Atemporal
                </p>
                <p className="caption text-graphite mt-2 text-[12px] leading-relaxed">
                  Colecciones permanentes y cápsulas numeradas (<em>Drops</em>) que
                  trascienden las temporadas efímeras del fast-fashion.
                </p>
              </div>
              <div className="border border-smoke p-5 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">
                  02 · Materia Prima Noble
                </p>
                <p className="caption text-graphite mt-2 text-[12px] leading-relaxed">
                  Algodón Pima de fibra extralarga (280–340 GSM), lanas frías de
                  sastrería, linos orgánicos y herrajes metálicos personalizados.
                </p>
              </div>
              <div className="border border-smoke p-5 bg-stone/20">
                <p className="caption uppercase tracking-wider font-semibold text-carbon">
                  03 · Ingeniería Directa
                </p>
                <p className="caption text-graphite mt-2 text-[12px] leading-relaxed">
                  Desde la reserva atómica de tu talla hasta la entrega con código
                  QR en tu puerta, controlamos toda la experiencia.
                </p>
              </div>
            </div>
          </section>

          {/* 2. Sostenibilidad */}
          <section
            id="sostenibilidad"
            className="scroll-mt-24 space-y-6 border-b border-smoke pb-14"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <Leaf size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                2. Sostenibilidad, Trazabilidad y Producción Consciente
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Entendemos la sostenibilidad no como un eslogan publicitario, sino
              como una responsabilidad medible en cada eslabón de nuestra cadena de
              suministro textil y tecnológica en Colombia:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="border border-smoke p-6 bg-paper space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <Layers size={17} strokeWidth={1.5} />
                  <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                    Producción en Lotes Cortos (Zero Deadstock)
                  </h3>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Fabricamos en series limitadas de entre 50 y 150 piezas por
                  referencia en talleres certificados de Bogotá y Medellín. Gracias a
                  nuestro sistema de reserva de inventario en tiempo real y alertas{" "}
                  <em>Back-in-Stock</em>, producimos exactamente lo que nuestra
                  comunidad demanda, reduciendo el desperdicio textil a menos del
                  1.2%.
                </p>
              </div>

              <div className="border border-smoke p-6 bg-paper space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <Recycle size={17} strokeWidth={1.5} />
                  <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                    Empaque Editorial 100% Libre de Plástico
                  </h3>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Cada orden se despacha en cajas y bolsas de papel kraft de alto
                  gramaje con certificación forestal <strong>FSC</strong>, tintas
                  vegetales a base de agua y sellos de seguridad biodegradables.
                  Cero polietileno de un solo uso.
                </p>
              </div>
            </div>

            <div className="border border-carbon bg-stone/20 p-6 space-y-2">
              <h3 className="caption uppercase tracking-[0.14em] font-semibold text-carbon">
                Logística de Última Milla con Huella Optimizada (Algoritmo Haversine)
              </h3>
              <p className="text-[13px] text-carbon/90 leading-relaxed">
                Nuestro motor de despacho calcula la distancia geodésica exacta entre
                el centro de acopio, el domiciliario activo y tu dirección de
                entrega. Al asignar siempre la ruta más corta disponible en tu
                municipio o departamento, disminuimos los kilómetros recorridos en
                vacío y las emisiones de CO₂ por paquete entregado.
              </p>
            </div>
          </section>

          {/* 3. Guía Documentada Paso a Paso */}
          <section
            id="guia-compra"
            className="scroll-mt-24 space-y-6 border-b border-smoke pb-14"
          >
            <div className="flex items-center gap-2.5 text-carbon">
              <BookOpen size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                3. Documentación del Cliente: Guía Paso a Paso de Compra
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Hemos diseñado esta guía interactiva como documentación oficial para
              acompañarte en cada etapa de tu experiencia dentro de{" "}
              <strong>ARShop</strong>:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <SlidersHorizontal size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-[0.14em] font-semibold">
                    Paso 1 · Exploración, Filtros y Talla
                  </span>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Navega por <strong>Mujer</strong> u <strong>Hombre</strong>, filtra
                  por categoría, talla, color, calce (<em>Regular, Oversized, Slim</em>)
                  o rango de precio. Abre la <strong>Guía de Tallas</strong> en la
                  ficha del producto para verificar tus medidas en centímetros antes
                  de añadir al carrito.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <ShoppingBag size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-[0.14em] font-semibold">
                    Paso 2 · Carrito, Ubicación y Reserva (15 min)
                  </span>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Revisa tu bolsa en <Link href="/cart" className="underline">/cart</Link>,
                  procede al checkout, selecciona tu departamento y municipio en
                  Colombia (o guarda varias direcciones en tu libreta) y aplica tu
                  cupón de descuento. Al confirmar los datos, tu prenda queda
                  reservada exclusivamente para ti por <strong>15 minutos</strong>.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <CreditCard size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-[0.14em] font-semibold">
                    Paso 3 · Pago Seguro con Stripe y Comprobante IVA
                  </span>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Completa el pago en el formulario cifrado de Stripe. Recibirás
                  confirmación inmediata en pantalla y por correo electrónico, y
                  podrás descargar tu comprobante fiscal con el desglose de base
                  gravable e <strong>IVA del 19% (DIAN)</strong>.
                </p>
              </div>

              <div className="border border-smoke p-5 bg-stone/20 space-y-2">
                <div className="flex items-center gap-2 text-carbon">
                  <QrCode size={16} strokeWidth={1.5} />
                  <span className="caption uppercase tracking-[0.14em] font-semibold">
                    Paso 4 · Recepción con QR y Postventa Ley 1480
                  </span>
                </div>
                <p className="text-[13px] text-graphite leading-relaxed">
                  Sigue el estado de tu pedido en{" "}
                  <Link href="/cuenta" className="underline">Mi Cuenta</Link>. Cuando
                  llegue tu domiciliario, muéstrale el <strong>Código QR</strong> o el{" "}
                  <strong>PIN de 4 dígitos</strong> para sellar la entrega. Después
                  de recibido, cuentas con 5 días hábiles para cambios o retracto.
                </p>
              </div>
            </div>
          </section>

          {/* 4. Preguntas Frecuentes (FAQ) */}
          <section id="faq" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-2.5 text-carbon">
              <HelpCircle size={20} strokeWidth={1.5} />
              <h2 className="font-display text-[26px] text-carbon tracking-tight">
                4. Preguntas Frecuentes (FAQ)
              </h2>
            </div>

            <p className="text-[14px] leading-relaxed text-carbon/90">
              Resolvemos las preguntas técnicas, operativas y comerciales más
              frecuentes sobre el funcionamiento de la aplicación y tus pedidos:
            </p>

            <div className="divide-y divide-smoke border-t border-b border-smoke">
              {FAQ_ITEMS.map((item, idx) => (
                <details
                  key={idx}
                  className="group py-5 transition-colors open:bg-stone/15 px-3"
                  open={idx < 2}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left">
                    <div>
                      <span className="block caption uppercase tracking-[0.14em] text-[10px] text-graphite mb-1">
                        {item.category}
                      </span>
                      <span className="font-display text-[17px] text-carbon group-hover:opacity-75 transition-opacity">
                        {item.question}
                      </span>
                    </div>
                    <span className="mt-1 font-mono text-[18px] leading-none text-graphite transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-carbon/85 pr-6">
                    {item.answer}
                  </p>
                </details>
              ))}
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
            href="/atencion"
            className="caption uppercase tracking-[0.14em] text-graphite hover:text-carbon transition-colors"
          >
            Envíos, Devoluciones y Contacto →
          </Link>
          <span className="caption text-graphite text-[12px] font-mono">
            ARSHOP © {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </div>
  );
}
