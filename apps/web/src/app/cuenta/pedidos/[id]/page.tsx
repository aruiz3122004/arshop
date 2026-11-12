"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Printer,
  QrCode,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Truck,
  XCircle,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useAuth } from "@/lib/auth";
import {
  apiCancelOrder,
  apiConfirmDelivery,
  apiDisputeDelivery,
  apiGetOrder,
  apiRequestOrderReturn,
  type OrderDetail,
  type ReturnType as OrderReturnType,
} from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import {
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  formatInvoiceDate,
  shortCufe,
} from "@/lib/invoicing-display";

type StatusKey = OrderDetail["status"];

const STATUS_LABEL: Record<StatusKey, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { fmt } = useCurrency();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/cuenta");
      return;
    }

    const id = params.id;
    if (!id) return;

    const load = async () => {
      try {
        const data = await apiGetOrder(id);
        setOrder(data);
        setError(null);
        if (data.status !== "PENDING_PAYMENT" && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch (err: any) {
        setError(err?.message || "No se pudo cargar el pedido.");
      } finally {
        setLoading(false);
      }
    };

    load();

    // Polling corto mientras el pedido esté pendiente de pago (webhook asíncrono)
    intervalRef.current = setInterval(load, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [params.id, user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16 pb-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
        <p className="caption mt-3 uppercase tracking-widest text-graphite">
          Cargando pedido...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-12 pb-24">
        <Breadcrumbs
          items={[
            { label: "Inicio", href: "/" },
            { label: "Mi cuenta", href: "/cuenta" },
            { label: "Pedido" },
          ]}
        />
        <div className="mt-8 border border-smoke p-8 text-center">
          <p className="caption text-carbon">
            {error || "Pedido no encontrado."}
          </p>
          <Link
            href="/cuenta"
            className="mt-6 inline-flex items-center gap-2 border border-carbon bg-carbon px-6 py-2.5 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors"
          >
            <ArrowLeft size={14} /> Volver a mi cuenta
          </Link>
        </div>
      </div>
    );
  }

  const addr = order.shipping_address;
  const steps: Array<{
    key: StatusKey;
    label: string;
    at: string | null;
    icon: typeof Clock;
  }> = [
    {
      key: "PENDING_PAYMENT",
      label: "Pedido creado",
      at: order.created_at,
      icon: Clock,
    },
    { key: "PAID", label: "Pago confirmado", at: order.paid_at, icon: CheckCircle2 },
    { key: "SHIPPED", label: "Enviado", at: order.shipped_at, icon: Truck },
    { key: "DELIVERED", label: "Entregado", at: order.delivered_at, icon: Package },
  ];

  const currentIndex = steps.findLastIndex((s) => {
    if (s.key === "PENDING_PAYMENT") return true;
    if (s.key === "PAID") return !!order.paid_at;
    if (s.key === "SHIPPED") return !!order.shipped_at;
    if (s.key === "DELIVERED") return !!order.delivered_at;
    return false;
  });

  const shippingCost = order.shipping_cost_cop ?? 0;
  const netItemsCop = order.total_cop - shippingCost;
  const discountCop = order.discount_cop ?? 0;
  const subtotalCop = order.subtotal_cop ?? netItemsCop + discountCop;
  const fallbackItemTax = netItemsCop - Math.round(netItemsCop / 1.19);
  const fallbackShippingTax =
    shippingCost > 0 ? shippingCost - Math.round(shippingCost / 1.19) : 0;
  const taxCop = order.tax_cop ?? fallbackItemTax + fallbackShippingTax;
  const baseSinIvaCop = order.taxable_base_cop ?? order.total_cop - taxCop;

  const handleCancelOrder = async () => {
    const isPaid = order.status === "PAID";
    const msg = isPaid
      ? "¿Seguro que deseas cancelar este pedido? Se procesará automáticamente el reembolso total a tu medio de pago y se liberará el stock."
      : "¿Seguro que deseas cancelar este pedido pendiente de pago?";
    if (!window.confirm(msg)) return;
    setCancelling(true);
    try {
      const updated = await apiCancelOrder(order.id);
      setOrder((prev) => (prev ? { ...prev, ...updated, status: "CANCELLED" } : prev));
    } catch (e: any) {
      window.alert(e?.message || "No se pudo cancelar el pedido.");
    } finally {
      setCancelling(false);
    }
  };

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const recipientLabel =
    addr.recipientName?.trim() || user?.full_name?.trim() || user?.email || "Cliente ARShop";
  const fullAddressLine = [
    addr.line1,
    addr.line2,
    addr.neighborhood,
    `${addr.city} (${addr.department})`,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleDownloadReceipt = () => {
    const rowsHtml = order.items
      .map(
        (it, idx) => `
          <tr>
            <td class="num">${idx + 1}</td>
            <td>
              <div class="prod-name">${escapeHtml(it.product_name_snapshot)}</div>
            </td>
            <td>
              <div class="prod-meta">${escapeHtml(it.variant_label)}</div>
            </td>
            <td class="center bold">${it.quantity}</td>
          </tr>`,
      )
      .join("");

    const receiptHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comprobante_Pedido_${escapeHtml(order.id.slice(0, 8))}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #181818;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
      padding: 4mm;
    }
    .sheet {
      max-width: 180mm;
      margin: 0 auto;
      border: 1.5px solid #222222;
      padding: 22px 26px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #222222;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .doc-type {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #555555;
      margin-top: 2px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .box {
      border: 1px solid #d4d4d4;
      padding: 11px 14px;
      background: #fafafa;
      page-break-inside: avoid;
    }
    .box-full {
      border: 1px solid #d4d4d4;
      padding: 11px 14px;
      background: #fafafa;
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .box-label {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #666666;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .box-value {
      font-size: 13px;
      color: #111111;
      font-weight: 600;
    }
    .section-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-weight: 700;
      color: #222222;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      border-top: 1.5px solid #222222;
      border-bottom: 1.5px solid #222222;
      padding: 7px 8px;
      text-align: left;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #444444;
    }
    td {
      border-bottom: 1px solid #e5e5e5;
      padding: 8px;
      vertical-align: middle;
      font-size: 12px;
    }
    tr {
      page-break-inside: avoid;
    }
    .num {
      width: 34px;
      color: #666666;
      font-family: monospace;
    }
    .center {
      text-align: center;
      width: 80px;
    }
    .bold {
      font-weight: 600;
    }
    .prod-name {
      font-weight: 600;
      color: #111111;
    }
    .prod-meta {
      font-size: 11.5px;
      color: #444444;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">ARShop</div>
        <div class="doc-type">Comprobante de Pedido</div>
      </div>
      <div class="doc-type">#${escapeHtml(order.id.slice(0, 8).toUpperCase())}</div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-label">Estado del Pedido</div>
        <div class="box-value">${escapeHtml(STATUS_LABEL[order.status])}</div>
      </div>
      <div class="box">
        <div class="box-label">Fecha de Creación</div>
        <div class="box-value">${escapeHtml(fmtDate(order.created_at) || "")}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-label">Receptor</div>
        <div class="box-value">${escapeHtml(recipientLabel)}</div>
      </div>
      <div class="box">
        <div class="box-label">Dirección</div>
        <div class="box-value">${escapeHtml(fullAddressLine)}</div>
      </div>
    </div>

    <div class="section-title" style="margin-top: 16px;">
      Producto Entregado (${order.items.length})
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Producto</th>
          <th>Variante / Talla</th>
          <th class="center">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    doc.open();
    doc.write(receiptHtml);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }, 150);
    };
  };

  return (
    <div className="mx-auto max-w-[960px] px-4 md:px-6 pt-8 pb-24">
      {/* Vista exclusiva para impresión directa (Ctrl+P) — Comprobante de 1 página */}
      <div className="hidden print:block border border-carbon p-6 text-carbon">
        <div className="flex items-end justify-between border-b-2 border-carbon pb-3 mb-4">
          <div>
            <p className="font-serif text-2xl font-bold tracking-wider">ARShop</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-graphite">
              Comprobante de Pedido
            </p>
          </div>
          <p className="font-mono text-[11px] text-graphite">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3 text-[12px]">
          <div className="border border-smoke p-3">
            <p className="text-[9px] uppercase tracking-[0.14em] text-graphite font-semibold">
              Estado del Pedido
            </p>
            <p className="font-semibold mt-0.5">{STATUS_LABEL[order.status]}</p>
          </div>
          <div className="border border-smoke p-3">
            <p className="text-[9px] uppercase tracking-[0.14em] text-graphite font-semibold">
              Fecha de Creación
            </p>
            <p className="font-semibold mt-0.5">{fmtDate(order.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-[12px]">
          <div className="border border-smoke p-3">
            <p className="text-[9px] uppercase tracking-[0.14em] text-graphite font-semibold">
              Receptor
            </p>
            <p className="font-semibold mt-0.5">{recipientLabel}</p>
          </div>
          <div className="border border-smoke p-3">
            <p className="text-[9px] uppercase tracking-[0.14em] text-graphite font-semibold">
              Dirección
            </p>
            <p className="font-semibold mt-0.5">{fullAddressLine}</p>
          </div>
        </div>

        <p className="text-[10px] uppercase tracking-[0.14em] font-bold mb-2">
          Producto Entregado ({order.items.length})
        </p>
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-y border-carbon text-left text-[9.5px] uppercase tracking-wider text-graphite">
              <th className="py-1.5 px-2 w-8">#</th>
              <th className="py-1.5 px-2">Producto</th>
              <th className="py-1.5 px-2">Variante / Talla</th>
              <th className="py-1.5 px-2 text-center w-20">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-smoke">
            {order.items.map((it, idx) => (
              <tr key={it.id}>
                <td className="py-1.5 px-2 font-mono text-graphite">{idx + 1}</td>
                <td className="py-1.5 px-2 font-semibold">
                  {it.product_name_snapshot}
                </td>
                <td className="py-1.5 px-2 text-graphite">
                  {it.variant_label}
                </td>
                <td className="py-1.5 px-2 text-center font-semibold">
                  {it.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista interactiva web (oculta al imprimir) */}
      <div className="print:hidden">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Mi cuenta", href: "/cuenta" },
          { label: `Pedido #${order.id.slice(0, 8)}` },
        ]}
      />

      <div className="mt-6 flex flex-col gap-4 border-b border-smoke pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="caption uppercase tracking-[0.2em] text-graphite text-[11px]">
            Pedido #{order.id.slice(0, 8)}
          </p>
          <h1 className="font-serif text-3xl font-light text-carbon sm:text-4xl mt-1">
            {STATUS_LABEL[order.status]}
          </h1>
          <p className="caption text-graphite mt-1">
            Creado el {fmtDate(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["PENDING_PAYMENT", "PAID"].includes(order.status) && (
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 caption uppercase tracking-wider text-[11px] border border-red-300 bg-red-50 text-red-800 px-3.5 py-2 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <XCircle size={14} />
              )}
              Cancelar pedido
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadReceipt}
            className="inline-flex items-center gap-1.5 caption uppercase tracking-wider text-[11px] border border-smoke bg-paper text-carbon px-3.5 py-2 hover:border-carbon transition-colors"
            title="Descargar comprobante de pedido (1 página)"
          >
            <Printer size={14} /> Descargar comprobante
          </button>
          {["PAID", "SHIPPED", "DELIVERED"].includes(order.status) && (
            <Link
              href={`/cuenta/pedidos/${order.id}/qr`}
              className="inline-flex items-center gap-2 caption uppercase tracking-wider text-[11px] bg-carbon text-paper px-4 py-2 hover:opacity-90 transition-opacity"
            >
              <QrCode size={14} /> QR
            </Link>
          )}
          <Link
            href="/cuenta"
            className="inline-flex items-center gap-2 caption uppercase tracking-wider text-[11px] text-carbon border border-smoke bg-paper px-4 py-2 hover:border-carbon transition-colors self-start"
          >
            <ArrowLeft size={14} /> Volver
          </Link>
        </div>
      </div>

      {order.delivery_confirmation === "PENDING_CLIENT" && (
        <SimulatedDeliveryBanner
          order={order}
          onConfirmed={(updated) => setOrder(updated)}
          onDisputed={(updated) => setOrder(updated)}
        />
      )}

      {order.delivery_confirmation === "DISPUTED" && (
        <div className="mt-6 border border-amber-400 bg-amber-50 px-4 py-3 text-amber-800 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" />
          <div>
            <p className="font-medium">Entrega en revisión</p>
            <p className="caption text-[12px] mt-1">
              Este pedido no quedó confirmado como entregado, así que un
              administrador de ARShop está revisando el caso y te contactará.
              Mientras tanto el pedido no se marca como entregado.
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Columna izquierda: items + timeline */}
        <section className="lg:col-span-7 flex flex-col gap-10">
          {/* Timeline */}
          <div>
            <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-3">
              Estado del pedido
            </h2>
            <ol className="mt-6 flex flex-col gap-5">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const done = i <= currentIndex && (i === 0 || !!s.at);
                const current = i === currentIndex;
                const cancelled = order.status === "CANCELLED";
                return (
                  <li key={s.key} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border ${
                        cancelled
                          ? "border-smoke text-graphite"
                          : done
                            ? "border-carbon bg-carbon text-paper"
                            : "border-smoke text-graphite"
                      }`}
                    >
                      {done && !cancelled ? (
                        <Icon size={14} />
                      ) : (
                        <Circle size={10} />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className={`caption text-[13px] ${
                          current && !cancelled
                            ? "text-carbon font-medium"
                            : "text-graphite"
                        }`}
                      >
                        {s.label}
                      </span>
                      {s.at && (
                        <span className="caption text-[11px] text-graphite">
                          {fmtDate(s.at)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {order.status === "CANCELLED" && (
                <li className="caption text-[12px] text-carbon italic border-t border-smoke pt-3">
                  Este pedido fue cancelado.
                </li>
              )}
            </ol>
          </div>

          {/* Items */}
          <div>
            <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-3">
              Artículos ({order.items.length})
            </h2>
            <div className="mt-6 flex flex-col divide-y divide-smoke">
              {order.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-start justify-between gap-4 py-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="caption text-carbon text-[14px] font-medium">
                      {it.product_name_snapshot}
                    </p>
                    <p className="caption text-graphite text-[12px] mt-0.5">
                      {it.variant_label} · Cant: {it.quantity}
                    </p>
                    <p className="caption text-graphite text-[11px] mt-0.5">
                      Unidad: {fmt(it.unit_price_cop)}
                    </p>
                  </div>
                  <p className="caption text-carbon font-mono text-[13px] shrink-0">
                    {fmt(it.unit_price_cop * it.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Columna derecha: envío + totales */}
        <aside className="lg:col-span-5 flex flex-col gap-8">
          <div className="border border-smoke p-5">
            <div className="flex items-center gap-2 border-b border-smoke pb-3">
              <MapPin size={14} className="text-carbon" />
              <h2 className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
                Dirección de envío
              </h2>
            </div>
            <div className="mt-4 flex flex-col gap-1 caption text-[13px] text-carbon leading-relaxed">
              {addr.recipientName && (
                <p className="font-medium">{addr.recipientName}</p>
              )}
              <p>
                {addr.line1}
                {addr.line2 ? ` · ${addr.line2}` : ""}
              </p>
              <p className="text-graphite text-[12px]">
                {addr.neighborhood}, {addr.city} ({addr.department})
              </p>
              <p className="text-graphite text-[12px] mt-0.5">
                Tel: {addr.phone}
              </p>
              {addr.notes && (
                <p className="text-graphite text-[12px] italic mt-0.5">
                  Instrucciones: {addr.notes}
                </p>
              )}
            </div>
            {(order.shipping_carrier || order.tracking_number) && (
              <div className="mt-4 border-t border-smoke pt-3 caption text-[12px]">
                <p className="uppercase tracking-wider text-[10px] text-graphite font-medium">
                  Despacho por transportadora (G3)
                </p>
                {order.shipping_carrier && (
                  <p className="text-carbon mt-1">
                    Transportadora: <strong>{order.shipping_carrier}</strong>
                  </p>
                )}
                {order.tracking_number && (
                  <p className="text-carbon font-mono mt-0.5">
                    Guía N.°: <strong>{order.tracking_number}</strong>
                  </p>
                )}
                {order.tracking_url && (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-carbon underline underline-offset-4 hover:opacity-75"
                  >
                    Rastrear envío en línea <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="border border-smoke p-5">
            <div className="flex items-center justify-between border-b border-smoke pb-3">
              <h2 className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
                Resumen del pedido
              </h2>
              <span className="caption text-[10px] text-graphite">
                IVA 19% incluido
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <div className="flex justify-between caption text-[13px] text-graphite">
                <span>Subtotal prendas</span>
                <span className="text-carbon font-mono">
                  {fmt(subtotalCop)}
                </span>
              </div>
              {discountCop > 0 && (
                <div className="flex justify-between caption text-[13px] text-emerald-800">
                  <span>
                    Descuento{order.coupon_code ? ` (${order.coupon_code})` : ""}
                  </span>
                  <span className="font-mono">-{fmt(discountCop)}</span>
                </div>
              )}
              <div className="flex justify-between caption text-[12px] text-graphite">
                <span>Base gravable (sin IVA)</span>
                <span className="font-mono">{fmt(baseSinIvaCop)}</span>
              </div>
              <div className="flex justify-between caption text-[12px] text-graphite">
                <span>IVA (19% incluido)</span>
                <span className="font-mono">{fmt(taxCop)}</span>
              </div>
              <div className="flex justify-between caption text-[13px] text-graphite">
                <span>Envío</span>
                <span className="text-carbon">
                  {shippingCost === 0 ? "Gratis" : fmt(shippingCost)}
                </span>
              </div>
              <div className="flex justify-between border-t border-carbon pt-3 mt-1">
                <span className="text-[15px] text-carbon font-medium">Total</span>
                <span className="text-[16px] text-carbon font-serif">
                  {fmt(order.total_cop)}
                </span>
              </div>
            </div>
            {order.stripe_payment_intent_id && (
              <p className="caption text-[11px] text-graphite mt-4 pt-3 border-t border-smoke/60 break-all">
                Ref. de pago: {order.stripe_payment_intent_id}
              </p>
            )}
          </div>

          <div className="border border-smoke p-5">
            <div className="flex items-center justify-between border-b border-smoke pb-3">
              <h2 className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
                Factura electrónica
              </h2>
              {order.invoice && (
                <span
                  className={`caption px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider border ${
                    INVOICE_STATUS_CLASS[order.invoice.status]
                  }`}
                >
                  {INVOICE_STATUS_LABEL[order.invoice.status]}
                </span>
              )}
            </div>

            {order.invoice ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="caption text-[11px] text-graphite">
                    Número
                  </span>
                  <span className="font-mono text-[12px] text-carbon">
                    {order.invoice.full_number ?? "Asignando…"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="caption text-[11px] text-graphite">
                    Emitida
                  </span>
                  <span className="caption text-[11px] text-carbon">
                    {formatInvoiceDate(order.invoice.issue_date)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="caption text-[11px] text-graphite">
                    Total
                  </span>
                  <span className="font-mono text-[12px] text-carbon">
                    {fmt(order.invoice.total_cop)}
                  </span>
                </div>
                {order.invoice.cufe && (
                  <div className="border-t border-smoke/60 pt-2">
                    <p className="caption text-[10px] uppercase tracking-wider text-graphite">
                      CUFE
                    </p>
                    <p
                      className="mt-0.5 break-all font-mono text-[10px] text-carbon"
                      title={order.invoice.cufe}
                    >
                      {shortCufe(order.invoice.cufe)}
                    </p>
                  </div>
                )}
                {order.invoice.public_url && (
                  <a
                    href={order.invoice.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 caption text-[11px] uppercase tracking-wider text-carbon underline underline-offset-4 hover:opacity-70"
                  >
                    Ver factura <ExternalLink size={11} />
                  </a>
                )}
                {order.invoice.environment === "HABILITACION" && (
                  <p className="caption text-[10px] leading-relaxed text-graphite">
                    Documento de demostración en ambiente de habilitación. No
                    constituye una factura validada por la DIAN.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 caption text-[11.5px] leading-relaxed text-graphite">
                {["PAID", "SHIPPED", "DELIVERED"].includes(order.status)
                  ? "Tu factura electrónica se está generando. Podrás consultarla aquí en unos momentos."
                  : "La factura electrónica estará disponible cuando se confirme el pago del pedido."}
              </p>
            )}
          </div>

          {order.status === "DELIVERED" && (
            <OrderReturnCard
              order={order}
              onReturnCreated={(ret) =>
                setOrder((prev) =>
                  prev ? { ...prev, return_request: ret } : prev,
                )
              }
            />
          )}
        </aside>
      </div>
      </div>
    </div>
  );
}

function SimulatedDeliveryBanner({
  order,
  onConfirmed,
  onDisputed,
}: {
  order: OrderDetail;
  onConfirmed: (o: OrderDetail) => void;
  onDisputed: (o: OrderDetail) => void;
}) {
  const [busy, setBusy] = useState<"confirm" | "dispute" | null>(null);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<string>("");

  useEffect(() => {
    if (!order.delivery_auto_confirm_at) return;
    const target = new Date(order.delivery_auto_confirm_at).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining("Expira pronto");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setRemaining(`${h} h ${m} min`);
    };
    tick();
    const int = setInterval(tick, 30_000);
    return () => clearInterval(int);
  }, [order.delivery_auto_confirm_at]);

  async function confirm() {
    setBusy("confirm");
    setErr(null);
    try {
      const updated = await apiConfirmDelivery(order.id);
      onConfirmed(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function dispute() {
    setBusy("dispute");
    setErr(null);
    try {
      const updated = await apiDisputeDelivery(order.id, reason.trim() || undefined);
      onDisputed(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-2 border-carbon bg-smoke/40 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-carbon shrink-0" size={20} />
        <div className="flex-1">
          <h3 className="font-serif text-lg text-carbon">
            Confirma la entrega de tu pedido
          </h3>
          <p className="caption text-[13px] text-carbon mt-1">
            El repartidor marcó este pedido como entregado. Si todo está bien,
            confírmalo. Si no lo recibiste, repórtalo.
          </p>
          <p className="caption text-[11px] text-graphite mt-2">
            Tienes{" "}
            <span className="font-medium text-carbon">{remaining || "48 h"}</span>{" "}
            para responder. Si no lo haces, el pedido pasa a{" "}
            <span className="font-medium text-carbon">disputa</span> y un asesor
            de ARShop revisa el caso contigo.
          </p>

          {err && (
            <p className="mt-3 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
              {err}
            </p>
          )}

          {!showDisputeForm ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={confirm}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
              >
                {busy === "confirm" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ThumbsUp size={14} />
                )}
                Sí, confirmar entrega
              </button>
              <button
                onClick={() => setShowDisputeForm(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 border border-smoke bg-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
              >
                <ThumbsDown size={14} />
                No recibí el pedido
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Cuéntanos qué pasó (opcional)"
                rows={3}
                className="w-full border border-smoke px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={dispute}
                  disabled={busy !== null}
                  className="bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {busy === "dispute" && <Loader2 size={14} className="animate-spin" />}
                  Enviar reporte
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisputeForm(false)}
                  disabled={busy !== null}
                  className="border border-smoke px-4 py-2 text-[12px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RETURN_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "En revisión por ARShop",
  APPROVED_REFUNDED: "Aprobada · Reembolsado",
  APPROVED_EXCHANGED: "Aprobada · Cambio de talla autorizado",
  REJECTED: "Rechazada",
};

const RETURN_TYPE_LABEL: Record<OrderReturnType, string> = {
  RETRACT_REFUND: "Derecho de retracto (Reembolso — Ley 1480 Art. 47)",
  SIZE_EXCHANGE: "Cambio de talla",
  DEFECTIVE: "Garantía por defecto de calidad",
};

function OrderReturnCard({
  order,
  onReturnCreated,
}: {
  order: OrderDetail;
  onReturnCreated: (ret: NonNullable<OrderDetail["return_request"]>) => void;
}) {
  const [openForm, setOpenForm] = useState(false);
  const [type, setType] = useState<OrderReturnType>("SIZE_EXCHANGE");
  const [requestedSize, setRequestedSize] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const existing = order.return_request;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const created = await apiRequestOrderReturn(order.id, {
        type,
        reason: reason.trim(),
        requestedSize:
          type === "SIZE_EXCHANGE" ? requestedSize.trim() : undefined,
      });
      onReturnCreated(created);
      setOpenForm(false);
    } catch (error: any) {
      setErr(error?.message || "No se pudo registrar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border border-smoke p-5 bg-stone/15">
      <div className="flex items-center gap-2 border-b border-smoke pb-3">
        <RotateCcw size={14} className="text-carbon" />
        <h2 className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
          Cambios, devoluciones y retracto (Ley 1480)
        </h2>
      </div>

      {existing ? (
        <div className="mt-4 flex flex-col gap-2 caption text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-graphite">Estado:</span>
            <span className="border border-carbon px-2 py-0.5 text-[10px] uppercase tracking-wider text-carbon font-medium">
              {RETURN_STATUS_LABEL[existing.status] ?? existing.status}
            </span>
          </div>
          <p className="text-carbon">
            <strong>Tipo:</strong> {RETURN_TYPE_LABEL[existing.type] ?? existing.type}
          </p>
          {existing.requested_size && (
            <p className="text-carbon">
              <strong>Talla solicitada:</strong> {existing.requested_size}
            </p>
          )}
          <p className="text-graphite">
            <strong>Motivo:</strong> {existing.reason}
          </p>
          {existing.admin_note && (
            <p className="mt-1 border-t border-smoke pt-2 text-carbon">
              <strong>Respuesta ARShop:</strong> {existing.admin_note}
            </p>
          )}
        </div>
      ) : !openForm ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="caption text-[12px] text-graphite leading-relaxed">
            Tienes hasta <strong>5 días hábiles</strong> desde la entrega para
            ejercer tu derecho de retracto o solicitar cambio de talla (Estatuto
            del Consumidor — Ley 1480 Art. 47), y <strong>30 días</strong> por
            garantía de calidad.
          </p>
          <button
            type="button"
            onClick={() => setOpenForm(true)}
            className="border border-carbon bg-paper px-4 py-2.5 caption text-[11px] uppercase tracking-wider text-carbon hover:bg-carbon hover:text-paper transition-colors"
          >
            Solicitar cambio o devolución
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          {err && (
            <p className="border border-red-300 bg-red-50 p-2 caption text-[11px] text-red-800">
              {err}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="caption text-[11px] uppercase tracking-wider text-graphite">
              Tipo de solicitud
            </span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OrderReturnType)}
              className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
            >
              <option value="SIZE_EXCHANGE">Cambio de talla (5 días hábiles)</option>
              <option value="RETRACT_REFUND">
                Derecho de retracto / Reembolso (5 días hábiles)
              </option>
              <option value="DEFECTIVE">
                Garantía por defecto de calidad (30 días)
              </option>
            </select>
          </label>

          {type === "SIZE_EXCHANGE" && (
            <label className="flex flex-col gap-1">
              <span className="caption text-[11px] uppercase tracking-wider text-graphite">
                Nueva talla deseada *
              </span>
              <input
                type="text"
                required
                value={requestedSize}
                onChange={(e) => setRequestedSize(e.target.value.toUpperCase())}
                placeholder="Ej: M, L, 40"
                className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="caption text-[11px] uppercase tracking-wider text-graphite">
              Motivo o detalle (mín. 5 caracteres) *
            </span>
            <textarea
              required
              minLength={5}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Indica por qué solicitas el cambio o devolución..."
              className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-carbon py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Enviar solicitud"}
            </button>
            <button
              type="button"
              onClick={() => setOpenForm(false)}
              className="border border-smoke px-3 py-2.5 caption text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
