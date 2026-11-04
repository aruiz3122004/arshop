"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { apiDeliveryListBonos, type DeliveryBono } from "@/lib/api";

export default function DeliveryBonosPage() {
  const [rows, setRows] = useState<DeliveryBono[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiDeliveryListBonos()
      .then(setRows)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const total = rows.reduce((s, r) => s + r.bono_cop, 0);

  return (
    <section>
      <h2 className="font-serif text-2xl text-carbon">Bonos</h2>
      <p className="caption text-[11px] text-graphite uppercase mt-1">
        Se abonan al completar la entrega de pedidos reasignados
      </p>
      <p className="mt-2 text-xs text-graphite leading-relaxed">
        Fórmula: $30.000 COP × km extra (descontando los primeros 15 km gratis).
        El bono entra al histórico cuando el pedido queda en estado{" "}
        <span className="text-carbon">Entregado</span>.
      </p>

      {err && (
        <p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {err}
        </p>
      )}

      <div className="mt-5 border border-smoke p-4">
        <div className="caption uppercase tracking-wider text-[10px] text-graphite flex items-center gap-1">
          <Coins size={12} /> Acumulado total
        </div>
        <div className="font-serif text-3xl text-carbon">
          ${total.toLocaleString("es-CO")} <span className="text-sm text-graphite">COP</span>
        </div>
      </div>

      {loading ? (
        <div className="pt-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-graphite">Sin bonos generados.</p>
      ) : (
        <ul className="mt-5 divide-y divide-smoke">
          {rows.map((b) => (
            <li key={b.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-carbon">
                  #{b.order_id.slice(0, 8)} · {b.order?.shipping_city ?? "—"}
                </div>
                <div className="caption text-[11px] text-graphite">
                  Km extra: {b.km_extra} · Base: ${b.base_cop.toLocaleString("es-CO")} ·{" "}
                  {b.motivo}
                </div>
              </div>
              <div className="font-serif text-lg">
                ${b.bono_cop.toLocaleString("es-CO")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
