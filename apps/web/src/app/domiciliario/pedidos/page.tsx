"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { apiDeliveryListOrders, type DeliveryOrder } from "@/lib/api";

const TABS = [
  { key: "", label: "Todos" },
  { key: "PAID", label: "Pendientes" },
  { key: "SHIPPED", label: "En camino" },
  { key: "DELIVERED", label: "Completados" },
  { key: "CANCELLED", label: "Cancelados" },
];

export default function DeliveryOrdersPage() {
  const [tab, setTab] = useState("");
  const [rows, setRows] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiDeliveryListOrders(tab || undefined)
      .then((r) => {
        setRows(r);
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <section>
      <h2 className="font-serif text-2xl text-carbon">Mis pedidos</h2>
      <div className="mt-3 flex gap-1 flex-wrap border-b border-smoke">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[11px] uppercase tracking-wider border-b-2 ${
              tab === t.key
                ? "border-carbon text-carbon font-medium"
                : "border-transparent text-graphite"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {err}
        </p>
      )}

      {loading ? (
        <div className="pt-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-graphite">Sin pedidos en esta categoría.</p>
      ) : (
        <ul className="mt-4 divide-y divide-smoke">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/domiciliario/pedidos/${o.id}`}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <div className="font-medium text-carbon">
                    #{o.id.slice(0, 8)} · {o.shipping_city}
                  </div>
                  <div className="caption text-[11px] text-graphite">
                    {o.shipping_address?.line1} · {o.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {o.delivery_status === "REASSIGNED_DEPT" && (
                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider border border-amber-400 bg-amber-50 text-amber-700 px-2 py-0.5">
                      <TriangleAlert size={12} /> Reasignado
                    </span>
                  )}
                  {o.qr_consumed_at && (
                    <span className="text-[11px] uppercase tracking-wider border border-green-500 bg-green-50 text-green-700 px-2 py-0.5">
                      QR ✓
                    </span>
                  )}
                  {o.delivery_confirmation === "PENDING_CLIENT" && (
                    <span className="text-[11px] uppercase tracking-wider border border-amber-400 bg-amber-50 text-amber-700 px-2 py-0.5">
                      Esperando cliente
                    </span>
                  )}
                  {o.delivery_confirmation === "DISPUTED" && (
                    <span className="text-[11px] uppercase tracking-wider border border-red-400 bg-red-50 text-red-700 px-2 py-0.5">
                      En disputa
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
