"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Truck,
  User as UserIcon,
  X,
} from "lucide-react";
import {
  apiAdminListDisputes,
  apiAdminListReturns,
  apiAdminResolveDispute,
  apiAdminResolveReturn,
  type AdminDispute,
  type AdminReturnRow,
} from "@/lib/api";
import { formatPrice } from "@/lib/catalog";

type Tab = "pending" | "resolved";

const RESOLUTION_LABEL: Record<string, { text: string; className: string }> = {
  REFUNDED: {
    text: "Reembolsado",
    className: "border-red-400 bg-red-50 text-red-700",
  },
  FORCED_ACCEPTED: {
    text: "Entrega forzada",
    className: "border-green-500 bg-green-50 text-green-700",
  },
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDisputesPage() {
  const [section, setSection] = useState<"disputes" | "returns">("disputes");
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<AdminDispute[]>([]);
  const [returnRows, setReturnRows] = useState<AdminReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminDispute | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<AdminReturnRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [disputesData, returnsData] = await Promise.all([
        apiAdminListDisputes(tab === "resolved"),
        apiAdminListReturns(tab === "resolved"),
      ]);
      setRows(disputesData);
      setReturnRows(returnsData);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-smoke pb-3">
        <div>
          <h2 className="font-serif text-2xl text-carbon flex items-center gap-2">
            <AlertTriangle size={20} /> Disputas y Devoluciones (RMA)
          </h2>
          <p className="caption text-graphite text-[12px] mt-1">
            Gestiona disputas de entrega simulada y solicitudes de retracto / cambio de talla (Ley 1480).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSection("disputes")}
            className={`px-3 py-1.5 caption text-[11px] uppercase tracking-wider border ${
              section === "disputes"
                ? "border-carbon bg-carbon text-paper"
                : "border-smoke bg-paper text-carbon hover:border-carbon"
            }`}
          >
            Disputas entrega ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setSection("returns")}
            className={`px-3 py-1.5 caption text-[11px] uppercase tracking-wider border ${
              section === "returns"
                ? "border-carbon bg-carbon text-paper"
                : "border-smoke bg-paper text-carbon hover:border-carbon"
            }`}
          >
            Devoluciones / Cambios ({returnRows.length})
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-smoke">
        {(["pending", "resolved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] uppercase tracking-wider border-b-2 ${
              tab === t
                ? "border-carbon text-carbon font-medium"
                : "border-transparent text-graphite hover:text-carbon"
            }`}
          >
            {t === "pending" ? "Pendientes" : "Resueltas"}
          </button>
        ))}
      </div>

      {err && (
        <p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {err}
        </p>
      )}

      {loading ? (
        <div className="pt-12 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
        </div>
      ) : section === "returns" ? (
        returnRows.length === 0 ? (
          <div className="pt-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-graphite" />
            <p className="mt-2 text-sm text-graphite">
              {tab === "pending"
                ? "No hay solicitudes de devolución o cambio pendientes."
                : "No hay solicitudes de devolución resueltas aún."}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-smoke caption uppercase tracking-wider text-[10px] text-graphite">
                  <th className="text-left py-2 px-2">Pedido</th>
                  <th className="text-left py-2 px-2">Cliente</th>
                  <th className="text-left py-2 px-2">Tipo RMA</th>
                  <th className="text-left py-2 px-2">Solicitado</th>
                  <th className="text-right py-2 px-2">Estado</th>
                  <th className="text-right py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {returnRows.map((ret) => (
                  <tr key={ret.id} className="border-b border-smoke/60">
                    <td className="py-3 px-2 font-mono">
                      #{ret.order_id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-2">
                      <div className="font-medium">
                        {ret.customer?.full_name ?? "—"}
                      </div>
                      <div className="caption text-[11px] text-graphite">
                        {ret.customer?.email ?? "—"}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-medium">
                        {ret.type === "RETRACT_REFUND"
                          ? "Retracto (Reembolso)"
                          : ret.type === "SIZE_EXCHANGE"
                            ? `Cambio talla (${ret.requested_size ?? "—"})`
                            : "Garantía calidad"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-[12px]">
                      {fmt(ret.created_at)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className="border border-smoke px-2 py-0.5 text-[10px] uppercase tracking-wider">
                        {ret.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedReturn(ret)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-smoke hover:border-carbon"
                      >
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="pt-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-graphite" />
          <p className="mt-2 text-sm text-graphite">
            {tab === "pending"
              ? "No hay disputas pendientes."
              : "No hay disputas resueltas aún."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-smoke caption uppercase tracking-wider text-[10px] text-graphite">
                <th className="text-left py-2 px-2">Pedido</th>
                <th className="text-left py-2 px-2">Cliente</th>
                <th className="text-left py-2 px-2">Domiciliario</th>
                <th className="text-left py-2 px-2">Reportado</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-right py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const res = r.delivery_dispute_resolution
                  ? RESOLUTION_LABEL[r.delivery_dispute_resolution]
                  : null;
                return (
                  <tr key={r.id} className="border-b border-smoke/60">
                    <td className="py-3 px-2 font-mono">
                      #{r.id.slice(0, 8)}
                      {res && (
                        <span
                          className={`ml-2 inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider border ${res.className}`}
                        >
                          {res.text}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="font-medium">
                        {r.customer?.full_name ?? "—"}
                      </div>
                      <div className="caption text-[11px] text-graphite">
                        {r.customer?.email ?? "—"}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      {r.domiciliario?.nombre_completo ?? "—"}
                      <div className="caption text-[11px] text-graphite font-mono">
                        {r.domiciliario?.placa ?? ""}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 text-[12px]">
                        <Clock size={11} className="text-graphite" />
                        {fmt(r.delivery_disputed_at)}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono">
                      {formatPrice(r.total_cop)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => setSelected(r)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-smoke hover:border-carbon"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DisputeDetailModal
          dispute={selected}
          onClose={() => setSelected(null)}
          onResolved={() => {
            setSelected(null);
            void load();
          }}
        />
      )}

      {selectedReturn && (
        <ReturnDetailModal
          item={selectedReturn}
          onClose={() => setSelectedReturn(null)}
          onResolved={() => {
            setSelectedReturn(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function ReturnDetailModal({
  item,
  onClose,
  onResolved,
}: {
  item: AdminReturnRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = useState(item.admin_note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isResolved = item.status !== "REQUESTED";

  async function resolve(
    decision: "APPROVE_REFUND" | "APPROVE_EXCHANGE" | "REJECT",
  ) {
    setBusy(decision);
    setErr(null);
    try {
      await apiAdminResolveReturn(
        item.order_id,
        decision,
        note.trim() || undefined,
      );
      onResolved();
    } catch (e: any) {
      setErr(e?.message || "No se pudo resolver la solicitud.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl bg-paper border border-carbon">
        <div className="flex items-center justify-between border-b border-smoke px-5 py-3">
          <h3 className="font-serif text-lg text-carbon">
            RMA · Pedido #{item.order_id.slice(0, 8)}
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="border border-smoke p-3">
            <p>
              <strong>Cliente:</strong> {item.customer?.full_name ?? "—"} (
              {item.customer?.email ?? "—"})
            </p>
            <p className="mt-1">
              <strong>Tipo:</strong> {item.type}
              {item.requested_size ? ` · Talla solicitada: ${item.requested_size}` : ""}
            </p>
            <p className="mt-1">
              <strong>Motivo:</strong> {item.reason}
            </p>
          </div>

          {!isResolved ? (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota o instrucciones para el cliente (ej. guía de recogida)"
                rows={2}
                className="w-full border border-smoke px-3 py-2 text-sm"
              />
              {err && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
                  {err}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-smoke">
                <button
                  type="button"
                  onClick={() => resolve("APPROVE_REFUND")}
                  disabled={busy !== null}
                  className="flex-1 border border-red-500 bg-paper text-red-700 hover:bg-red-50 px-3 py-2 text-[11px] uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === "APPROVE_REFUND"
                    ? "Procesando..."
                    : "Aprobar y Reembolsar (Stripe)"}
                </button>
                <button
                  type="button"
                  onClick={() => resolve("APPROVE_EXCHANGE")}
                  disabled={busy !== null}
                  className="flex-1 bg-carbon text-paper px-3 py-2 text-[11px] uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === "APPROVE_EXCHANGE"
                    ? "Procesando..."
                    : "Aprobar Cambio de Talla"}
                </button>
                <button
                  type="button"
                  onClick={() => resolve("REJECT")}
                  disabled={busy !== null}
                  className="border border-smoke px-3 py-2 text-[11px] uppercase tracking-wider text-graphite hover:text-carbon disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            </>
          ) : (
            <div className="border border-smoke p-3">
              <p>
                <strong>Estado final:</strong> {item.status}
              </p>
              {item.admin_note && (
                <p className="mt-1">
                  <strong>Nota admin:</strong> {item.admin_note}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DisputeDetailModal({
  dispute,
  onClose,
  onResolved,
}: {
  dispute: AdminDispute;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"REFUND" | "ACCEPT_DELIVERY" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isResolved = Boolean(dispute.delivery_dispute_resolution);
  const recibido = dispute.recibido?.[0];

  async function act(decision: "REFUND" | "ACCEPT_DELIVERY") {
    const confirmMsg =
      decision === "REFUND"
        ? "¿Reembolsar al cliente? Esto cancela la orden y emite el refund en Stripe. Irreversible."
        : "¿Marcar como entregado dándole la razón al domiciliario? La orden pasa a DELIVERED.";
    if (!window.confirm(confirmMsg)) return;
    setBusy(decision);
    setErr(null);
    try {
      await apiAdminResolveDispute(dispute.id, decision, note.trim() || undefined);
      onResolved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl bg-paper border border-carbon">
        <div className="flex items-center justify-between border-b border-smoke px-5 py-3">
          <h3 className="font-serif text-lg text-carbon">
            Disputa · pedido #{dispute.id.slice(0, 8)}
          </h3>
          <button onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div className="border border-smoke p-3">
              <h4 className="caption uppercase tracking-wider text-[10px] text-graphite mb-2 flex items-center gap-1">
                <UserIcon size={11} /> Cliente
              </h4>
              <p className="font-medium">{dispute.customer?.full_name ?? "—"}</p>
              <p className="caption text-[11px] text-graphite">
                {dispute.customer?.email ?? "—"}
              </p>
            </div>
            <div className="border border-smoke p-3">
              <h4 className="caption uppercase tracking-wider text-[10px] text-graphite mb-2 flex items-center gap-1">
                <Truck size={11} /> Domiciliario
              </h4>
              <p className="font-medium">
                {dispute.domiciliario?.nombre_completo ?? "—"}
              </p>
              <p className="caption text-[11px] text-graphite font-mono">
                {dispute.domiciliario?.placa ?? ""}{" "}
                {dispute.domiciliario?.vehiculo
                  ? `· ${dispute.domiciliario.vehiculo}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="border border-smoke p-3 text-[13px]">
            <h4 className="caption uppercase tracking-wider text-[10px] text-graphite mb-2">
              Línea de tiempo
            </h4>
            <ul className="caption text-[12px] space-y-1">
              <li>
                <strong>Simulada:</strong> {fmt(dispute.delivery_simulated_at)}
              </li>
              <li>
                <strong>Disputada:</strong> {fmt(dispute.delivery_disputed_at)}
              </li>
              {dispute.delivery_dispute_resolved_at && (
                <li>
                  <strong>Resuelta:</strong>{" "}
                  {fmt(dispute.delivery_dispute_resolved_at)} ·{" "}
                  {dispute.delivery_dispute_resolution}
                </li>
              )}
            </ul>
          </div>

          {recibido && (
            <div className="border border-smoke p-3 text-[13px]">
              <h4 className="caption uppercase tracking-wider text-[10px] text-graphite mb-2">
                Receptor declarado por el domiciliario
              </h4>
              <p>
                {recibido.nombre_receptor} · {recibido.tipo_documento}{" "}
                {recibido.numero_documento}
              </p>
              <p className="caption text-[11px] text-graphite">
                {recibido.fecha} {recibido.hora} · fuente: {recibido.fuente}
              </p>
            </div>
          )}

          <div className="border border-red-200 bg-red-50 p-3 text-[13px]">
            <h4 className="caption uppercase tracking-wider text-[10px] text-red-700 mb-2">
              Motivo del cliente
            </h4>
            <p className="whitespace-pre-wrap text-red-800">
              {dispute.delivery_dispute_reason || "(sin motivo)"}
            </p>
          </div>

          {dispute.delivery_dispute_resolution_note && (
            <div className="border border-smoke p-3 text-[13px]">
              <h4 className="caption uppercase tracking-wider text-[10px] text-graphite mb-2">
                Nota de resolución
              </h4>
              <p className="whitespace-pre-wrap">
                {dispute.delivery_dispute_resolution_note}
              </p>
            </div>
          )}

          {!isResolved && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota interna de la resolución (opcional)"
                rows={2}
                className="w-full border border-smoke px-3 py-2 text-sm"
              />
              {err && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
                  {err}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-smoke">
                <button
                  onClick={() => act("REFUND")}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-2 border border-red-500 bg-paper text-red-700 hover:bg-red-50 px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === "REFUND" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  Dar razón al cliente — reembolsar
                </button>
                <button
                  onClick={() => act("ACCEPT_DELIVERY")}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === "ACCEPT_DELIVERY" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Dar razón al domiciliario — marcar entregado
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
