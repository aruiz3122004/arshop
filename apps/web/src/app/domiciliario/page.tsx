"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Coins,
  Loader2,
  Package,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import {
  apiDeliveryGetProfile,
  apiDeliveryListBonos,
  apiDeliveryListOrders,
  type DeliveryBono,
  type DeliveryOrder,
  type Domiciliario,
} from "@/lib/api";

export default function DeliveryHomePage() {
  const [profile, setProfile] = useState<Domiciliario | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [bonos, setBonos] = useState<DeliveryBono[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, o, b] = await Promise.all([
          apiDeliveryGetProfile(),
          apiDeliveryListOrders(),
          apiDeliveryListBonos(),
        ]);
        setProfile(p);
        setOrders(o);
        setBonos(b);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="pt-16 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="pt-6">
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {err}
        </p>
        <p className="mt-3 text-sm text-graphite">
          Si no tienes perfil de domiciliario, pide a un admin que te asigne.
        </p>
      </div>
    );
  }

  const pendientes = orders.filter((o) =>
    ["PAID", "SHIPPED"].includes(o.status),
  );
  const entregados = orders.filter((o) => o.status === "DELIVERED");
  const mesEnCurso = bonos.filter((b) => {
    const d = new Date(b.created_at);
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });
  const totalMes = mesEnCurso.reduce((acc, b) => acc + b.bono_cop, 0);

  return (
    <section>
      <div className="pb-3 border-b border-smoke">
        <p className="caption uppercase tracking-[0.2em] text-graphite text-[11px]">
          Hola, {profile?.nombre_completo?.split(" ")[0] ?? "repartidor"}
        </p>
        <h2 className="font-serif text-2xl text-carbon">
          Zona: {profile?.ciudad}, {profile?.departamento}
        </h2>
        <p className="caption text-[11px] text-graphite mt-1 uppercase">
          Vehículo: {profile?.vehiculo} · <span className="font-mono">{profile?.placa}</span> · {profile?.disponibilidad}
        </p>
      </div>

      {profile &&
        (profile.departamento === "Sin asignar" ||
          profile.ciudad === "Sin asignar" ||
          profile.vehiculo === "Sin asignar" ||
          profile.placa === "SIN-PLACA" ||
          profile.disponibilidad === "INACTIVO") && (
          <div className="mt-4 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Tu perfil está incompleto: aún no recibirás pedidos.{" "}
            <Link
              href="/domiciliario/configuracion"
              className="underline underline-offset-2 font-medium"
            >
              Completar zona, vehículo y disponibilidad
            </Link>
            .
          </div>
        )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <Kpi icon={ClipboardList} label="Pendientes" value={pendientes.length} />
        <Kpi icon={Package} label="Entregados" value={entregados.length} />
        <Kpi icon={Coins} label="Bonos mes" value={totalMes.toLocaleString("es-CO")} suffix="COP" />
        <Kpi icon={QrCode} label="Reasignados" value={orders.filter((o) => o.delivery_status === "REASSIGNED_DEPT").length} />
      </div>

      <div className="mt-8">
        <h3 className="font-serif text-lg text-carbon">Próximas entregas</h3>
        {pendientes.length === 0 ? (
          <p className="mt-2 text-sm text-graphite">Sin pedidos pendientes.</p>
        ) : (
          <ul className="mt-3 divide-y divide-smoke">
            {pendientes.slice(0, 6).map((o) => (
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
                      {o.shipping_address?.line1} · ETA {o.estimated_delivery_at ?? "—"}
                    </div>
                  </div>
                  {o.delivery_status === "REASSIGNED_DEPT" && (
                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider border border-amber-400 bg-amber-50 text-amber-700 px-2 py-0.5">
                      <TriangleAlert size={12} /> Reasignado
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="border border-smoke p-3">
      <div className="flex items-center gap-2 caption uppercase tracking-wider text-[10px] text-graphite">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 font-serif text-2xl text-carbon">
        {value}
        {suffix ? <span className="text-sm ml-1 text-graphite">{suffix}</span> : null}
      </div>
    </div>
  );
}
