"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  SquareUserRound,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import {
  apiGetMe,
  apiGetOrderQr,
  apiSaveOrderReceiver,
  type DocumentType,
  type OrderQrPayload,
} from "@/lib/api";

export default function OrderQrPage() {
  const params = useParams<{ id: string }>();
  const [qr, setQr] = useState<OrderQrPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombreReceptor: "",
    tipoDocumento: "CC" as DocumentType,
    numeroDocumento: "",
  });
  const [savingForm, setSavingForm] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  // El clientCode es un segundo factor equivalente al QR. Lo ocultamos por
  // default para que no quede visible en screenshots, screen-share o
  // miradas de hombro mientras el cliente no lo necesite.
  const [showCode, setShowCode] = useState(false);

  // Epoch seconds del código vigente. El polling del QR (60 s) lo envía como
  // `keepCode` para que el backend NO lo rote: si rotara, el cliente podía
  // dictar un código que ya no coincidía con el hash guardado.
  const codeExpRef = useRef<number | null>(null);
  // Una sola petición en vuelo: el intervalo de 60 s y el temporizador de
  // vencimiento pueden dispararse a la vez; dos `issueQr` concurrentes se
  // pisarían el hash y dejarían en pantalla un código que el backend ya no
  // reconoce.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const refresh = useCallback(
    (keepCodeExp?: number) => {
      if (inFlightRef.current) return inFlightRef.current;
      const run = (async () => {
        try {
          const data = await apiGetOrderQr(params.id, keepCodeExp);
          if (data.clientCode) codeExpRef.current = data.clientCodeExp ?? null;
          setQr((prev) => ({
            ...data,
            // El backend omite `clientCode` cuando conserva el vigente.
            clientCode: data.clientCode ?? prev?.clientCode,
            clientCodeExp: data.clientCodeExp ?? prev?.clientCodeExp,
          }));
          setErr(null);
          // Precarga lo que el cliente ya guardó (o lo que viene del checkout).
          // Sólo rellena si el formulario está vacío: el intervalo de 60 s no
          // debe pisar lo que el usuario está escribiendo.
          const pref = data.receiverPrefilled;
          if (pref) {
            setForm((prev) =>
              prev.nombreReceptor || prev.numeroDocumento
                ? prev
                : {
                    nombreReceptor: pref.nombreReceptor ?? "",
                    tipoDocumento: (pref.tipoDocumento ?? "CC") as DocumentType,
                    numeroDocumento: pref.numeroDocumento ?? "",
                  },
            );
          }
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setLoading(false);
        }
      })().finally(() => {
        inFlightRef.current = null;
      });
      inFlightRef.current = run;
      return run;
    },
    [params.id],
  );

  useEffect(() => {
    void refresh();
    const int = setInterval(
      () => void refresh(codeExpRef.current ?? undefined),
      60_000,
    );
    return () => clearInterval(int);
  }, [refresh]);

  // Reloj del código: cuenta atrás visible y renovación justo al vencer.
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const clientCodeExp = qr?.clientCodeExp ?? null;
  useEffect(() => {
    if (!clientCodeExp || qr?.consumed) return;
    // Si ya venció (pestaña en segundo plano), el servidor emitirá otro al
    // recibir el `keepCode` caducado.
    const delay = clientCodeExp * 1000 - Date.now() + 750;
    const t = setTimeout(
      () => void refresh(codeExpRef.current ?? undefined),
      Math.max(0, delay),
    );
    return () => clearTimeout(t);
  }, [clientCodeExp, qr?.consumed, refresh]);

  async function fillFromProfile() {
    try {
      const me = await apiGetMe();
      setForm({
        nombreReceptor: me.full_name ?? "",
        tipoDocumento: (me.document_type ?? "CC") as DocumentType,
        numeroDocumento: me.document_number ?? "",
      });
    } catch (e) {
      setFormMsg((e as Error).message);
    }
  }

  async function saveReceiver(e: React.FormEvent) {
    e.preventDefault();
    setSavingForm(true);
    setFormMsg(null);
    try {
      await apiSaveOrderReceiver(params.id, form);
      setFormMsg("Datos guardados. El domiciliario los verá al escanear.");
      // Refresca para que el aviso de "faltan datos" desaparezca de inmediato,
      // conservando el código que el cliente ya esté mostrando.
      await refresh(codeExpRef.current ?? undefined);
    } catch (e) {
      setFormMsg((e as Error).message);
    } finally {
      setSavingForm(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16">
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {err}
        </p>
      </div>
    );
  }
  if (!qr) return null;

  const receiverComplete = Boolean(
    qr.receiverPrefilled?.nombreReceptor && qr.receiverPrefilled?.numeroDocumento,
  );
  const codeSecondsLeft = qr.clientCodeExp
    ? Math.max(0, qr.clientCodeExp - nowSec)
    : null;

  return (
    <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-8 pb-24">
      <Link
        href={`/cuenta/pedidos/${params.id}`}
        className="caption text-[11px] uppercase tracking-wider text-graphite inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Volver al pedido
      </Link>

      <h1 className="font-serif text-3xl text-carbon mt-3">Entrega del pedido</h1>

      {qr.deliveryWarning && (
        <p className="mt-3 inline-flex items-start gap-2 text-sm border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2">
          <TriangleAlert size={14} className="mt-0.5" />
          {qr.deliveryWarning}
        </p>
      )}

      {qr.estimatedDeliveryAt && (
        <p className="mt-3 text-sm text-graphite flex items-center gap-1">
          <Clock size={14} /> Fecha estimada:{" "}
          <span className="text-carbon font-medium">
            {new Date(qr.estimatedDeliveryAt).toLocaleDateString("es-CO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </p>
      )}

      {/*
        Paso 1: datos del receptor. Va ANTES del QR a propósito. Cuando el QR
        aparecía primero, el cliente lo mostraba sin diligenciar nada y el
        repartidor terminaba pidiendo nombre y documento en la puerta — justo
        lo que el QR debía evitar.
      */}
      {!qr.consumed && (
        <form onSubmit={saveReceiver} className="mt-6 border border-smoke p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-carbon text-paper text-[11px]">
                1
              </span>
              <SquareUserRound size={16} /> ¿Quién recibirá el pedido?
            </h2>
            <button
              type="button"
              onClick={fillFromProfile}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider border border-smoke bg-paper px-2 py-1 hover:border-carbon"
            >
              <Wand2 size={12} /> Diligenciar automáticamente
            </button>
          </div>
          <p className="text-sm text-graphite">
            Si recibes tú mismo, usa el botón de arriba. Si no, escribe el
            nombre y documento de quien recibe: viajan dentro del QR y el
            repartidor no tendrá que preguntarte nada en la puerta.
          </p>
          <input
            required
            placeholder="Nombre del receptor (Ej: Patricia Hernández)"
            value={form.nombreReceptor}
            onChange={(e) => setForm({ ...form, nombreReceptor: e.target.value })}
            className="w-full border border-smoke px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.tipoDocumento}
              onChange={(e) =>
                setForm({ ...form, tipoDocumento: e.target.value as DocumentType })
              }
              className="border border-smoke px-2 py-2 text-sm"
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="PP">PP</option>
              <option value="NIT">NIT</option>
            </select>
            <input
              required
              className="col-span-2 border border-smoke px-3 py-2 text-sm"
              placeholder="Número documento (Ej: 72561891)"
              value={form.numeroDocumento}
              onChange={(e) =>
                setForm({ ...form, numeroDocumento: e.target.value.replace(/\D/g, "") })
              }
            />
          </div>

          {formMsg && (
            <p className="text-sm border border-smoke bg-smoke/40 px-3 py-2">
              {formMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingForm}
            className="bg-carbon text-paper px-5 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
          >
            {savingForm ? "Guardando…" : "Guardar datos"}
          </button>
        </form>
      )}

      <div className="mt-6 border border-smoke p-5">
        <h2 className="font-medium flex items-center gap-2">
          {!qr.consumed && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-carbon text-paper text-[11px]">
              2
            </span>
          )}
          Tu código QR
        </h2>
        {!qr.consumed && !receiverComplete && (
          <p className="mt-3 border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2 text-[12px]">
            Aún no guardaste quién recibe. Si escanean el QR así, el repartidor
            tendrá que pedirte el nombre y el documento en la puerta.
          </p>
        )}
        <p className="text-sm text-graphite mt-1">
          Muéstraselo al domiciliario cuando llegue. Es único e intransferible.
        </p>

        <div className="mt-5 flex justify-center relative">
          {qr.consumed ? (
            <div className="relative">
              {qr.dataUrl ? (
                <Image
                  alt="QR"
                  src={qr.dataUrl}
                  width={320}
                  height={320}
                  unoptimized
                  className="opacity-50"
                />
              ) : (
                <div className="w-[320px] h-[320px] bg-smoke" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/30">
                <CheckCircle2 className="text-green-700" size={64} />
                <p className="font-serif text-xl text-green-900 mt-2">Entregado</p>
                {qr.consumedAt && (
                  <p className="caption text-[11px] text-green-900 mt-1">
                    {new Date(qr.consumedAt).toLocaleString("es-CO")}
                  </p>
                )}
              </div>
            </div>
          ) : qr.dataUrl ? (
            <Image
              alt="QR"
              src={qr.dataUrl}
              width={320}
              height={320}
              unoptimized
            />
          ) : (
            <div className="w-[320px] h-[320px] bg-smoke" />
          )}
        </div>

        <p className="caption text-[11px] text-graphite mt-3 text-center">
          Se refresca automáticamente cada minuto.
        </p>
      </div>

      {!qr.consumed && qr.clientCode && (
        <div className="mt-4 border border-smoke p-5 text-center">
          <p className="caption uppercase tracking-wider text-[10px] text-graphite">
            ¿No tienes cámara a mano? Dicta este código
          </p>
          {showCode && codeSecondsLeft !== 0 ? (
            <>
              <p
                className="mt-2 font-mono text-5xl tracking-[0.5em] text-carbon select-all"
                aria-label={`Código ${qr.clientCode.split("").join(" ")}`}
              >
                {qr.clientCode}
              </p>
              <button
                type="button"
                onClick={() => setShowCode(false)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
              >
                <EyeOff size={12} /> Ocultar
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 font-mono text-5xl tracking-[0.5em] text-graphite select-none">
                ● ● ● ●
              </p>
              <button
                type="button"
                disabled={codeSecondsLeft === 0}
                onClick={() => setShowCode(true)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-graphite hover:text-carbon disabled:opacity-40"
              >
                <Eye size={12} /> Mostrar código
              </button>
            </>
          )}
          <p className="caption text-[11px] text-graphite mt-2">
            {codeSecondsLeft === 0
              ? "Código vencido · generando uno nuevo…"
              : `Válido por ${codeSecondsLeft ?? 0} s`}
          </p>
        </div>
      )}

      <div className="mt-6 border border-smoke bg-smoke/30 p-5 text-sm text-graphite">
        <p className="font-medium text-carbon">¿Qué hace este QR?</p>
        <ol className="list-decimal pl-5 mt-1 space-y-1">
          <li>El repartidor lo escanea con la app oficial.</li>
          <li>El sistema valida la firma y lo marca como consumido (un solo uso).</li>
          <li>Si diligenciaste los datos, se cargan automáticamente; si no, el repartidor los diligencia manualmente.</li>
          <li>La entrega queda registrada con fecha, hora y receptor.</li>
        </ol>
        <p className="mt-3">
          Si el repartidor no logra escanearlo ni recibe tu código de 4 dígitos,
          puede simular la entrega con tus datos. En ese caso el pedido{" "}
          <strong>no</strong> queda entregado: recibirás un aviso y tendrás 48 h
          para confirmarlo. Si no respondes, el caso pasa a disputa con un
          asesor de ARShop.
        </p>
      </div>
    </div>
  );
}
