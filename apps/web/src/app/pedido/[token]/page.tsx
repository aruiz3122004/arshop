"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Package,
  QrCode,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/catalog";
import {
  apiClaimGuestOrder,
  apiGetGuestOrder,
  apiGetGuestOrderQr,
  apiGuestConfirmDelivery,
  apiGuestDisputeDelivery,
  type OrderDetail,
  type OrderQrPayload,
} from "@/lib/api";

type StatusKey = OrderDetail["status"];

const STATUS_LABEL: Record<StatusKey, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  SHIPPED: "En camino",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_STYLE: Record<StatusKey, string> = {
  PENDING_PAYMENT: "border-amber-500 bg-amber-50 text-amber-800",
  PAID: "border-carbon bg-carbon text-paper",
  SHIPPED: "border-blue-700 bg-blue-50 text-blue-800",
  DELIVERED: "border-emerald-700 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-red-400 bg-red-50 text-red-700",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GuestOrderPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const [qr, setQr] = useState<OrderQrPayload | null>(null);
  const [showCode, setShowCode] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGetGuestOrder(token);
      setOrder(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "No pudimos abrir este pedido.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const canShowQr =
    Boolean(order) &&
    (order?.status === "PAID" || order?.status === "SHIPPED") &&
    !order?.qr_consumed_at;

  useEffect(() => {
    if (!canShowQr) {
      setQr(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const data = await apiGetGuestOrderQr(token);
        if (!cancelled) setQr(data);
      } catch {
        // El QR es un extra: si falla no rompemos el seguimiento.
      }
    };
    void run();
    const interval = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [canShowQr, token]);

  const confirmDelivery = async () => {
    setActing(true);
    setError(null);
    try {
      await apiGuestConfirmDelivery(token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const disputeDelivery = async () => {
    const reason = window.prompt(
      "Cuéntanos qué pasó con la entrega (opcional):",
    );
    if (reason === null) return;
    setActing(true);
    setError(null);
    try {
      await apiGuestDisputeDelivery(token, reason || undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const claim = async () => {
    setActing(true);
    setError(null);
    try {
      await apiClaimGuestOrder(token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-4 md:px-6 pt-16 pb-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
        <p className="caption mt-3 uppercase tracking-widest text-graphite">
          Abriendo tu pedido...
        </p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-12 pb-24">
        <Breadcrumbs
          items={[{ label: "Inicio", href: "/" }, { label: "Pedido" }]}
        />
        <div className="mt-8 border border-carbon/20 bg-stone/40 p-6 text-center">
          <AlertTriangle className="mx-auto text-carbon" size={24} />
          <p className="mt-3 font-serif text-[22px] text-carbon">
            No pudimos abrir el enlace
          </p>
          <p className="caption mt-2 text-[13px] leading-relaxed text-graphite">
            {error}
          </p>
          <p className="caption mt-4 text-[12px] text-graphite">
            Si el enlace venció, escríbenos y te generamos uno nuevo.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block border border-carbon px-6 py-2.5 caption text-[11px] uppercase tracking-[0.14em] text-carbon hover:bg-stone"
          >
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const pendingConfirmation = order.delivery_confirmation === "PENDING_CLIENT";
  const isClaimed = Boolean(order.user_id);

  return (
    <div className="mx-auto max-w-[820px] px-4 md:px-6 pt-8 pb-24">
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/" }, { label: "Mi pedido" }]}
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-carbon pb-4">
        <div>
          <p className="caption text-[10.5px] uppercase tracking-[0.18em] text-graphite">
            Pedido #{order.id.slice(0, 8)}
          </p>
          <h1 className="font-serif text-[30px] leading-tight text-carbon">
            Seguimiento
          </h1>
          <p className="caption mt-1 text-[12px] text-graphite">
            {order.guest_email ?? user?.email ?? ""}
          </p>
        </div>
        <span
          className={`border px-3 py-1 caption text-[10.5px] uppercase tracking-[0.14em] ${
            STATUS_STYLE[order.status]
          }`}
        >
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      {error && (
        <p className="mt-4 border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </p>
      )}

      {order.status === "PENDING_PAYMENT" && (
        <div className="mt-6 border border-amber-400 bg-amber-50 p-4 text-amber-900">
          <p className="caption text-[12px] leading-relaxed">
            Estamos esperando la confirmación del pago. Si ya pagaste, esta
            página se actualiza en unos segundos; recárgala si no cambia.
          </p>
        </div>
      )}

      {pendingConfirmation && (
        <div className="mt-6 border border-amber-500 bg-amber-50 p-5">
          <div className="flex items-start gap-2">
            <Clock size={18} className="mt-0.5 shrink-0 text-amber-800" />
            <div>
              <p className="font-medium text-amber-900">
                Confirma la entrega simulada
              </p>
              <p className="caption mt-1 text-[12px] leading-relaxed text-amber-900">
                El domiciliario registró una entrega sin escanear el QR. Si
                recibiste el pedido, confírmalo. Si no, repórtalo y un asesor lo
                revisa.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirmDelivery()}
              disabled={acting}
              className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-4 py-2 caption text-[10.5px] uppercase tracking-[0.12em] text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              <CheckCircle2 size={13} /> Recibí mi pedido
            </button>
            <button
              type="button"
              onClick={() => void disputeDelivery()}
              disabled={acting}
              className="inline-flex items-center gap-1.5 border border-carbon px-4 py-2 caption text-[10.5px] uppercase tracking-[0.12em] text-carbon hover:bg-stone disabled:opacity-50"
            >
              <AlertTriangle size={13} /> No recibí / problema
            </button>
          </div>
        </div>
      )}

      {order.delivery_confirmation === "DISPUTED" && (
        <div className="mt-6 border border-smoke bg-stone/30 p-4">
          <p className="caption text-[12px] leading-relaxed text-carbon">
            Recibimos tu reporte. Un asesor de ARShop revisará el caso y te
            contactará al correo del pedido.
          </p>
        </div>
      )}

      {/* QR de entrega */}
      {canShowQr && (
        <section className="mt-6 border border-smoke p-5">
          <h2 className="flex items-center gap-2 font-serif text-[20px] text-carbon">
            <QrCode size={18} /> Tu código de entrega
          </h2>
          <p className="caption mt-1 text-[12px] leading-relaxed text-graphite">
            Muéstraselo al domiciliario cuando llegue. Se refresca solo cada
            minuto y es de un único uso.
          </p>

          <div className="mt-4 flex justify-center">
            {qr?.dataUrl ? (
              <Image
                src={qr.dataUrl}
                alt="Código QR del pedido"
                width={280}
                height={280}
                unoptimized
              />
            ) : (
              <div className="flex h-[280px] w-[280px] items-center justify-center bg-smoke/60">
                <Loader2 className="animate-spin text-graphite" />
              </div>
            )}
          </div>

          {qr?.clientCode && (
            <div className="mt-4 text-center">
              <p className="caption text-[10.5px] uppercase tracking-[0.14em] text-graphite">
                ¿Sin cámara? Dicta este código
              </p>
              <p className="mt-1 font-mono text-4xl tracking-[0.45em] text-carbon">
                {showCode ? qr.clientCode : "● ● ● ●"}
              </p>
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 caption text-[10.5px] uppercase tracking-wider text-graphite hover:text-carbon"
              >
                {showCode ? <EyeOff size={12} /> : <Eye size={12} />}
                {showCode ? "Ocultar" : "Mostrar código"}
              </button>
            </div>
          )}

          {qr?.estimatedDeliveryAt && (
            <p className="caption mt-3 text-center text-[11px] text-graphite">
              Entrega estimada: {fmtDate(qr.estimatedDeliveryAt)}
            </p>
          )}
        </section>
      )}

      {/* Items */}
      <section className="mt-6 border border-smoke">
        <div className="flex items-center gap-2 border-b border-smoke px-5 py-3">
          <Package size={15} className="text-carbon" />
          <h2 className="caption text-[11px] uppercase tracking-[0.14em] text-carbon">
            Tu pedido
          </h2>
        </div>
        <ul className="divide-y divide-smoke">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
            >
              <div>
                <p className="text-[13px] text-carbon">
                  {item.product_name_snapshot}
                </p>
                <p className="caption text-[11px] text-graphite">
                  {item.variant_label} · x{item.quantity}
                </p>
              </div>
              <p className="caption text-[12px] text-carbon">
                {formatPrice(item.unit_price_cop * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-carbon px-5 py-3">
          <span className="caption text-[11px] uppercase tracking-[0.14em] text-carbon">
            Total
          </span>
          <span className="text-[15px] font-medium text-carbon">
            {formatPrice(order.total_cop)}
          </span>
        </div>
      </section>

      {/* Envío */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="border border-smoke p-5">
          <h2 className="caption text-[10.5px] uppercase tracking-[0.14em] text-graphite">
            Entrega
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-carbon">
            {order.shipping_address?.line1}
            {order.shipping_address?.line2
              ? `, ${order.shipping_address.line2}`
              : ""}
            <br />
            {order.shipping_address?.neighborhood}, {order.shipping_city}
            <br />
            {order.shipping_department}
            <br />
            <span className="caption text-[12px] text-graphite">
              Tel. {order.shipping_phone}
            </span>
          </p>
          {order.estimated_delivery_at && (
            <p className="caption mt-3 flex items-center gap-1 text-[11px] text-graphite">
              <Truck size={12} /> Llega aprox.{" "}
              {fmtDate(order.estimated_delivery_at)}
            </p>
          )}
          {order.tracking_url && (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noreferrer"
              className="caption mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-carbon underline underline-offset-4"
            >
              Rastrear envío <ExternalLink size={11} />
            </a>
          )}
        </div>

        <div className="border border-smoke p-5">
          <h2 className="caption text-[10.5px] uppercase tracking-[0.14em] text-graphite">
            Pago
          </h2>
          <p className="mt-2 text-[13px] text-carbon">
            {formatPrice(order.total_cop)}
          </p>
          <p className="caption mt-1 text-[11.5px] text-graphite">
            {fmtDate(order.paid_at) ?? "Pendiente de confirmación"}
          </p>
          {order.invoice?.public_url && (
            <a
              href={order.invoice.public_url}
              target="_blank"
              rel="noreferrer"
              className="caption mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-carbon underline underline-offset-4"
            >
              Ver factura {order.invoice.full_number ?? ""}{" "}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </section>

      {/* Reclamar pedido */}
      {!isClaimed && (
        <section className="mt-6 border border-smoke bg-stone/20 p-5">
          <div className="flex items-start gap-2">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-carbon" />
            <div>
              <p className="font-medium text-carbon">
                ¿Quieres guardar este pedido en tu cuenta?
              </p>
              <p className="caption mt-1 text-[12px] leading-relaxed text-graphite">
                Inicia sesión con <strong>{order.guest_email}</strong> y vincula
                el pedido. Después podrás verlo en “Mis pedidos” y escribir una
                reseña verificada.
              </p>
            </div>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void claim()}
              disabled={acting}
              className="mt-4 inline-flex items-center gap-1.5 border border-carbon bg-carbon px-4 py-2 caption text-[10.5px] uppercase tracking-[0.12em] text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              {acting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              Vincular a mi cuenta
            </button>
          ) : (
            <Link
              href={`/cuenta?next=${encodeURIComponent(`/pedido/${token}`)}`}
              className="mt-4 inline-block border border-carbon px-4 py-2 caption text-[10.5px] uppercase tracking-[0.12em] text-carbon hover:bg-stone"
            >
              Iniciar sesión
            </Link>
          )}
        </section>
      )}

      {isClaimed && (
        <p className="caption mt-6 text-[12px] text-graphite">
          Este pedido está vinculado a una cuenta.{" "}
          <Link
            href="/cuenta/pedidos"
            className="text-carbon underline underline-offset-4"
          >
            Ver en mis pedidos
          </Link>
        </p>
      )}
    </div>
  );
}
