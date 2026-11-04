"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import {
  apiDeliveryGetProfile,
  apiDeliverySetPin,
  apiDeliveryUpdateProfile,
  type Domiciliario,
  type DeliveryAvailability,
} from "@/lib/api";
import { PushOptIn } from "@/components/push-opt-in";
import { COLOMBIA } from "@/lib/colombia";

export default function DeliveryConfigPage() {
  const [profile, setProfile] = useState<Domiciliario | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [vehiculo, setVehiculo] = useState("");
  const [placa, setPlaca] = useState("");
  const [ciudadPlaca, setCiudadPlaca] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [disp, setDisp] = useState<DeliveryAvailability>("DISPONIBLE");

  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");

  useEffect(() => {
    apiDeliveryGetProfile()
      .then((p) => {
        setProfile(p);
        setVehiculo(p.vehiculo);
        setPlaca(p.placa);
        setCiudadPlaca(p.ciudad_placa);
        setDepartamento(
          COLOMBIA.some((d) => d.name === p.departamento) ? p.departamento : "",
        );
        setCiudad(p.ciudad && p.ciudad !== "Sin asignar" ? p.ciudad : "");
        setDisp(p.disponibilidad);
      })
      .catch((e) => setMsg((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Un repartidor promovido desde SQL/admin llega con placeholders hasta que
  // guarde esta pantalla. Lo avisamos en vez de dejarlo "sin pedidos" sin pista.
  const incomplete =
    !departamento ||
    departamento === "Sin asignar" ||
    !ciudad ||
    ciudad === "Sin asignar" ||
    !vehiculo ||
    vehiculo === "Sin asignar" ||
    !placa ||
    placa === "SIN-PLACA";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setMsg(null);
    try {
      const updated = await apiDeliveryUpdateProfile({
        departamento,
        ciudad,
        vehiculo,
        placa,
        ciudadPlaca,
        disponibilidad: disp,
      });
      setProfile(updated);
      setMsg("Perfil guardado.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setSavingPin(true);
    setMsg(null);
    try {
      await apiDeliverySetPin(pin, currentPin || undefined);
      setPin("");
      setCurrentPin("");
      setMsg("PIN actualizado.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSavingPin(false);
    }
  }

  if (loading) {
    return <Loader2 className="mt-10 mx-auto h-5 w-5 animate-spin text-graphite" />;
  }

  return (
    <section className="max-w-xl">
      <h2 className="font-serif text-2xl text-carbon">Configuración</h2>

      {msg && (
        <p className="mt-3 text-sm border border-smoke bg-smoke/40 px-3 py-2">{msg}</p>
      )}

      {incomplete && (
        <p className="mt-3 text-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          Completa tu zona y vehículo para poder recibir pedidos. Mientras
          falten datos tu disponibilidad no se usa para asignaciones.
        </p>
      )}

      <form onSubmit={saveProfile} className="mt-6 border border-smoke p-4 space-y-3">
        <h3 className="font-medium">Perfil</h3>
        <Field label="Departamento">
          <select
            className="input"
            required
            value={departamento}
            onChange={(e) => {
              setDepartamento(e.target.value);
              // La ciudad depende del departamento: al cambiarlo se limpia.
              setCiudad("");
            }}
          >
            <option value="">Selecciona un departamento…</option>
            {COLOMBIA.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ciudad">
          <select
            className="input"
            required
            disabled={!departamento}
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
          >
            <option value="">
              {departamento
                ? "Selecciona una ciudad…"
                : "Primero elige departamento"}
            </option>
            {(COLOMBIA.find((d) => d.name === departamento)?.cities ?? []).map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Vehículo">
          <input
            className="input"
            value={vehiculo}
            onChange={(e) => setVehiculo(e.target.value)}
          />
        </Field>
        <Field label="Placa">
          <input
            className="input font-mono uppercase"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Ciudad de la placa">
          <input className="input" value={ciudadPlaca} onChange={(e) => setCiudadPlaca(e.target.value)} />
        </Field>
        <Field label="Disponibilidad">
          <select className="input" value={disp} onChange={(e) => setDisp(e.target.value as DeliveryAvailability)}>
            <option value="DISPONIBLE">Disponible</option>
            <option value="OCUPADO">Ocupado</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </Field>
        <button
          type="submit"
          disabled={savingProfile}
          className="bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
        >
          {savingProfile ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <form onSubmit={savePin} className="mt-6 border border-smoke p-4 space-y-3">
        <h3 className="font-medium">PIN de simulación</h3>
        <p className="text-sm text-graphite">
          4 dígitos. Se usa cuando no es posible escanear el QR y debes marcar entregado manualmente.
        </p>
        <Field label="PIN actual (si ya tenías uno)">
          <input
            className="input font-mono tracking-widest"
            maxLength={4}
            inputMode="numeric"
            pattern="\d{4}"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Nuevo PIN">
          <input
            required
            className="input font-mono tracking-widest"
            maxLength={4}
            inputMode="numeric"
            pattern="\d{4}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <button
          type="submit"
          disabled={savingPin}
          className="bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
        >
          {savingPin ? "Guardando…" : "Guardar PIN"}
        </button>
      </form>

      <div className="mt-6 border border-smoke p-4">
        <h3 className="font-medium flex items-center gap-2">
          <Bell size={16} /> Notificaciones push
        </h3>
        <PushOptIn />
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #e5e5e5;
          padding: 8px 10px;
          font-size: 13px;
        }
      `}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block caption uppercase tracking-wider text-[10px] text-graphite mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
