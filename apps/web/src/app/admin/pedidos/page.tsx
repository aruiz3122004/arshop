"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Filter,
  Loader2,
  Mail,
  Receipt,
  RefreshCw,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import {
  apiAdminAssignDelivery,
  apiAdminDeliverOrder,
  apiAdminIssueInvoice,
  apiAdminListOrders,
  apiAdminShipOrder,
  apiAdminSimulatePaid,
  apiCancelOrder,
  type OrderDetail,
} from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import {
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
} from "@/lib/invoicing-display";

type StatusFilter = "ALL" | OrderDetail["status"];

const STATUS_LABEL: Record<OrderDetail["status"], string> = {
  PENDING_PAYMENT: "Pendiente",
  PAID: "Pagado",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function DeliveryCell({ order }: { order: OrderDetail }) {
  const dstatus = order.delivery_status;
  if (!dstatus && !order.shipping_carrier && !order.tracking_number) {
    return <span className="text-graphite">—</span>;
  }
  const label =
    dstatus === "ASSIGNED"
      ? "Asignado"
      : dstatus === "REASSIGNED_DEPT"
        ? "Reasignado"
        : dstatus === "UNASSIGNED"
          ? "Sin asignar"
          : null;
  const classes =
    dstatus === "ASSIGNED"
      ? "border-green-500/50 text-green-700 bg-green-50"
      : dstatus === "REASSIGNED_DEPT"
        ? "border-amber-400 text-amber-700 bg-amber-50"
        : "border-red-400 text-red-700 bg-red-50";
  const eta = order.estimated_delivery_at
    ? new Date(order.estimated_delivery_at).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
      })
    : null;
  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <span className={`inline-flex self-start px-1.5 py-0.5 text-[10px] uppercase tracking-wider border ${classes}`}>
          {label}
        </span>
      )}
      {order.shipping_carrier && (
        <span className="text-carbon text-[11px] font-medium">
          {order.shipping_carrier}
          {order.tracking_number ? ` · ${order.tracking_number}` : ""}
        </span>
      )}
      {eta && (
        <span className="text-graphite text-[11px]">ETA {eta}</span>
      )}
      {order.qr_consumed_at && (
        <span className="text-green-700 text-[10px] uppercase">QR ✓</span>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [shipModalOrder, setShipModalOrder] = useState<OrderDetail | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const load = async () => {
    try {
      const list = await apiAdminListOrders();
      setOrders(list);
    } catch (err: any) {
      setError(err?.message || "Error cargando pedidos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const handleShip = async (
    id: string,
    dto?: { carrier?: string; trackingNumber?: string; trackingUrl?: string },
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiAdminShipOrder(id, dto);
      setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...updated } : o)));
      setShipModalOrder(null);
      setCarrier("");
      setTrackingNumber("");
      setTrackingUrl("");
    } catch (err: any) {
      setError(err?.message || "No se pudo marcar como enviado.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelOrder = async (order: OrderDetail) => {
    const confirmMsg =
      order.status === "PAID"
        ? `¿Cancelar el pedido #${order.id.slice(0, 8)} y emitir reembolso total en Stripe + restauración de stock?`
        : `¿Cancelar el pedido pendiente de pago #${order.id.slice(0, 8)} y liberar su reserva de stock?`;
    if (!window.confirm(confirmMsg)) return;
    setBusyId(order.id);
    setError(null);
    try {
      const updated = await apiCancelOrder(order.id);
      setOrders((cur) =>
        cur.map((o) =>
          o.id === order.id ? { ...o, ...updated, status: "CANCELLED" } : o,
        ),
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo cancelar el pedido.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulatePaid = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await apiAdminSimulatePaid(id);
      // tras simular, recarga para ver el nuevo estado
      const list = await apiAdminListOrders();
      setOrders(list);
    } catch (err: any) {
      setError(err?.message || "No se pudo simular el pago.");
    } finally {
      setBusyId(null);
    }
  };

  const handleIssueInvoice = async (order: OrderDetail) => {
    const ok = window.confirm(
      `¿Emitir factura electrónica para el pedido #${order.id.slice(0, 8)} por ${formatPrice(order.total_cop)}?`,
    );
    if (!ok) return;
    setBusyId(order.id);
    setError(null);
    try {
      const invoice = await apiAdminIssueInvoice(order.id);
      setOrders((cur) =>
        cur.map((o) => (o.id === order.id ? { ...o, invoice } : o)),
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo emitir la factura.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeliver = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiAdminDeliverOrder(id);
      setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch (err: any) {
      setError(err?.message || "No se pudo marcar como entregado.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReassignDelivery = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiAdminAssignDelivery(id);
      setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch (err: any) {
      setError(err?.message || "No se pudo reintentar la asignación de repartidor.");
    } finally {
      setBusyId(null);
    }
  };

  // Los reembolsos ahora sólo se emiten resolviendo una disputa; se removió
  // el botón directo de /admin/pedidos. Ver /admin/disputas.

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-serif text-xl text-carbon">
          Pedidos ({filtered.length})
        </h2>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-graphite" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="caption text-[12px] border border-smoke bg-paper px-3 py-1.5 text-carbon focus:border-carbon transition-colors"
          >
            <option value="ALL">Todos</option>
            <option value="PENDING_PAYMENT">Pendientes</option>
            <option value="PAID">Pagados</option>
            <option value="SHIPPED">Enviados</option>
            <option value="DELIVERED">Entregados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-smoke">
        <table className="min-w-full text-left">
          <thead className="bg-stone/30 border-b border-smoke">
            <tr className="caption uppercase tracking-wider text-[10px] text-graphite">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Entrega</th>
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr
                key={o.id}
                className="border-b border-smoke/60 caption text-[13px] text-carbon hover:bg-stone/10"
              >
                <td className="px-4 py-3 font-mono text-[11px]">
                  <Link
                    href={`/cuenta/pedidos/${o.id}`}
                    className="text-carbon underline underline-offset-2"
                  >
                    {o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[12px] text-graphite">
                  {new Date(o.created_at).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-3 text-[12px]">
                  {o.shipping_city} ({o.shipping_department})
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">
                  {formatPrice(o.total_cop)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                      o.status === "DELIVERED"
                        ? "border-carbon bg-carbon text-paper"
                        : o.status === "CANCELLED"
                          ? "border-smoke text-graphite"
                          : "border-carbon text-carbon"
                    }`}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px]">
                  <DeliveryCell order={o} />
                </td>
                <td className="px-4 py-3">
                  {o.invoice ? (
                    <Link
                      href={`/admin/facturacion/${o.invoice.id}`}
                      className="inline-flex flex-col gap-0.5"
                    >
                      <span
                        className={`inline-flex self-start px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider border ${
                          INVOICE_STATUS_CLASS[o.invoice.status]
                        }`}
                      >
                        {INVOICE_STATUS_LABEL[o.invoice.status]}
                      </span>
                      <span className="font-mono text-[10px] text-carbon underline underline-offset-2">
                        {o.invoice.full_number ?? "Sin número"}
                      </span>
                    </Link>
                  ) : ["PAID", "SHIPPED", "DELIVERED"].includes(o.status) ? (
                    <button
                      type="button"
                      onClick={() => handleIssueInvoice(o)}
                      disabled={busyId === o.id}
                      className="inline-flex items-center gap-1 border border-carbon bg-carbon px-2.5 py-1.5 caption text-[10px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-40"
                    >
                      {busyId === o.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <>
                          <Receipt size={11} /> Facturar
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-graphite">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {o.status === "PENDING_PAYMENT" && (
                      <button
                        type="button"
                        onClick={() => handleSimulatePaid(o.id)}
                        disabled={busyId === o.id}
                        className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                        title="DEV: marca PAID y encola correo sin esperar al webhook"
                      >
                        {busyId === o.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <Mail size={12} /> Simular pago
                          </>
                        )}
                      </button>
                    )}
                    {["PAID", "SHIPPED"].includes(o.status) &&
                      (!o.delivery_status || o.delivery_status === "UNASSIGNED") && (
                        <button
                          type="button"
                          onClick={() => handleReassignDelivery(o.id)}
                          disabled={busyId === o.id}
                          className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                          title="Reintentar asignación automática de repartidor"
                        >
                          {busyId === o.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <>
                              <RefreshCw size={12} /> Asignar repartidor
                            </>
                          )}
                        </button>
                      )}
                    {o.status === "PAID" && (
                      <button
                        type="button"
                        onClick={() => {
                          setShipModalOrder(o);
                          setCarrier(o.shipping_carrier ?? "");
                          setTrackingNumber(o.tracking_number ?? "");
                          setTrackingUrl(o.tracking_url ?? "");
                        }}
                        disabled={busyId === o.id}
                        className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                      >
                        {busyId === o.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <Truck size={12} /> Despachar / Guía
                          </>
                        )}
                      </button>
                    )}
                    {["PENDING_PAYMENT", "PAID"].includes(o.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(o)}
                        disabled={busyId === o.id}
                        className="inline-flex items-center gap-1 border border-red-300 bg-red-50 px-2.5 py-1.5 caption text-[11px] uppercase tracking-wider text-red-800 hover:bg-red-100 transition-colors disabled:opacity-40"
                        title="Cancelar pedido (si está PAID emite reembolso automático)"
                      >
                        <XCircle size={12} /> Cancelar
                      </button>
                    )}
                    {o.status === "SHIPPED" && (
                      <button
                        type="button"
                        onClick={() => handleDeliver(o.id)}
                        disabled={busyId === o.id}
                        className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 transition-colors disabled:opacity-40"
                      >
                        {busyId === o.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 size={12} /> Marcar entregado
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center caption text-graphite"
                >
                  No hay pedidos con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Despacho / Guía Nacional (G3) */}
      {shipModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4"
          onClick={() => setShipModalOrder(null)}
        >
          <div
            className="w-full max-w-md border border-carbon bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-smoke pb-3">
              <div>
                <p className="caption uppercase tracking-widest text-[10px] text-graphite">
                  Despacho de orden #{shipModalOrder.id.slice(0, 8)}
                </p>
                <h3 className="font-serif text-lg text-carbon mt-0.5">
                  Confirmar envío ({shipModalOrder.shipping_city})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShipModalOrder(null)}
                className="p-1 text-graphite hover:text-carbon"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <p className="caption text-[12px] text-graphite">
                Puedes despachar con repartidor propio (dejando la transportadora
                vacía) o registrar guía de transportadora nacional (Servientrega,
                Coordinadora, Interrapidísimo, TCC, Envía).
              </p>

              <label className="flex flex-col gap-1">
                <span className="caption text-[11px] uppercase tracking-wider text-graphite">
                  Transportadora (opcional)
                </span>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
                >
                  <option value="">Domiciliario propio ARShop (QR)</option>
                  <option value="Servientrega">Servientrega</option>
                  <option value="Coordinadora">Coordinadora</option>
                  <option value="Interrapidísimo">Interrapidísimo</option>
                  <option value="TCC">TCC</option>
                  <option value="Envía">Envía</option>
                  <option value="Deprisa">Deprisa</option>
                </select>
              </label>

              {carrier && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="caption text-[11px] uppercase tracking-wider text-graphite">
                      Número de guía
                    </span>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Ej: 2094819203"
                      className="border border-smoke bg-paper p-2 caption text-[12px] font-mono text-carbon"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="caption text-[11px] uppercase tracking-wider text-graphite">
                      URL de rastreo (opcional)
                    </span>
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://..."
                      className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
                    />
                  </label>
                </>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === shipModalOrder.id}
                  onClick={() =>
                    handleShip(shipModalOrder.id, {
                      carrier: carrier || undefined,
                      trackingNumber: trackingNumber || undefined,
                      trackingUrl: trackingUrl || undefined,
                    })
                  }
                  className="flex-1 bg-carbon py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
                >
                  {busyId === shipModalOrder.id
                    ? "Despachando..."
                    : "Confirmar despacho"}
                </button>
                <button
                  type="button"
                  onClick={() => setShipModalOrder(null)}
                  className="border border-smoke px-4 py-2.5 caption text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
