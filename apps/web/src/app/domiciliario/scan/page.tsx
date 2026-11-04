"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  Loader2,
  QrCode,
  RotateCcw,
  Timer,
  X,
} from "lucide-react";
import { apiDeliveryScanQr, apiDeliveryVerifyClientCodeAnywhere } from "@/lib/api";

/**
 * Presupuesto de cámara por intento.
 *
 * El escaneo ocurre en el dispositivo: ZXing decodifica los fotogramas del
 * stream en un canvas local y **no hace ni una petición HTTP** mientras espera.
 * Al backend sólo se llama cuando ya hay un QR leído (una sola vez por token).
 *
 * Aun así, dejar la cámara encendida indefinidamente consume batería, CPU y
 * mantiene el indicador de cámara activo. A los 20 s se apaga sola y el
 * repartidor reintenta con un toque.
 */
const SCAN_TIMEOUT_MS = 20_000;

export default function DeliveryScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  // Un solo intervalo por intento: refresca la cuenta atrás y, al llegar a 0,
  // apaga la cámara. Antes era un `setTimeout` que cerraba de golpe, sin aviso.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Evita enviar dos veces el mismo token (doble lectura o doble clic).
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [remainingMs, setRemainingMs] = useState(SCAN_TIMEOUT_MS);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState("");

  // Identifica la sesión de cámara vigente. Si el repartidor cierra mientras el
  // stream todavía se está abriendo (import + permiso + listar dispositivos),
  // el arranque en vuelo se descarta en vez de reabrir la cámara a escondidas.
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch { }
      controlsRef.current = null;
    }
  }, []);

  const handleToken = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busyRef.current) return;
      busyRef.current = true;
      setErr(null);
      setTimedOut(false);
      setVerifying(true);
      // El campo manual acepta las dos pruebas del cliente: el token firmado
      // del QR (cientos de caracteres) y el código de 4 dígitos que dicta por
      // teléfono. Mandar el código a `/delivery/scan-qr` reventaba con
      // "token must be longer than or equal to 10 characters".
      const isClientCode = /^\d{4}$/.test(value);
      setStatus(isClientCode ? "Verificando código…" : "Verificando QR…");
      try {
        const res = isClientCode
          ? await apiDeliveryVerifyClientCodeAnywhere(value)
          : await apiDeliveryScanQr({ token: value });
        setStatus(
          isClientCode
            ? "Código válido · redirigiendo…"
            : "QR válido · redirigiendo…",
        );
        stop();
        router.push(`/domiciliario/pedidos/${res.orderId}`);
        // No reseteamos `verifying` en el camino feliz: mantiene el spinner
        // hasta que Next monta la otra ruta, en vez de parpadear al estado
        // inicial durante la navegación.
      } catch (e) {
        setErr((e as Error).message);
        setStatus(null);
        setVerifying(false);
      } finally {
        busyRef.current = false;
      }
    },
    [router, stop],
  );

  async function startCamera() {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setErr(null);
    setTimedOut(false);
    setStatus("Abriendo cámara…");
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const camera =
        devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
      if (!camera) throw new Error("Sin cámara disponible");

      // El <video> se monta al pasar a `scanning`; esperamos un frame para que
      // el ref exista y no arrancar ZXing sobre `null`.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const video = videoRef.current;
      if (!video) throw new Error("No pudimos iniciar el visor de la cámara");

      const controls = await reader.decodeFromVideoDevice(
        camera.deviceId,
        video,
        (result: any, _err: unknown, c: any) => {
          if (!result || session !== sessionRef.current) return;
          const txt = result.getText();
          // Primera lectura: apagamos cámara y temporizador antes de llamar a la
          // API. Así el QR no se vuelve a leer ni se reenvía el token.
          try {
            c?.stop();
          } catch { }
          stop();
          setScanning(false);
          setStatus(null);
          void handleToken(txt);
        },
      );
      if (session !== sessionRef.current) {
        // Se cerró la vista mientras abríamos la cámara: liberamos el stream.
        try {
          controls.stop();
        } catch { }
        return;
      }
      controlsRef.current = controls;
      setStatus("Apunta la cámara al QR del cliente");

      // Cuenta atrás visible: el repartidor ve cuánto le queda antes de que la
      // cámara se apague sola, en vez de sufrir el corte por sorpresa.
      const deadline = Date.now() + SCAN_TIMEOUT_MS;
      setRemainingMs(SCAN_TIMEOUT_MS);
      tickRef.current = setInterval(() => {
        const left = Math.max(0, deadline - Date.now());
        setRemainingMs(left);
        if (left > 0) return;
        stop();
        setScanning(false);
        setStatus(null);
        setTimedOut(true);
      }, 200);
    } catch (e) {
      // Si la sesión ya se cerró, el error no le interesa a nadie.
      if (session !== sessionRef.current) return;
      setErr((e as Error).message);
      setStatus(null);
      setScanning(false);
    }
  }

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const needsRetry = timedOut || Boolean(err);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progressPct = Math.max(
    0,
    Math.min(100, (remainingMs / SCAN_TIMEOUT_MS) * 100),
  );
  const isLow = remainingMs <= 5_000;

  return (
    <section>
      <h2 className="font-serif text-2xl text-carbon">Escanear QR</h2>
      <p className="caption text-[11px] text-graphite uppercase mt-1">
        Un solo uso · integridad verificada por firma
      </p>

      <div className="mt-6 border border-smoke p-4">
        {scanning ? (
          // El wrapper acota el ancho (no el <video>) para que la cuenta atrás
          // quede alineada con el borde del vídeo también en desktop.
          <div className="relative mx-auto w-full max-w-md">
            <video
              ref={videoRef}
              className="w-full bg-black aspect-square object-cover"
              muted
              playsInline
            />
            <button
              onClick={() => {
                stop();
                setScanning(false);
                setStatus(null);
              }}
              className="absolute top-2 right-2 bg-paper border border-carbon px-2 py-1 text-[11px] uppercase tracking-wider"
            >
              <X size={12} /> Cerrar
            </button>

            {/*
              Cuenta atrás del intento: la cámara se apaga sola a los 20 s.
              Va sobre el vídeo (pointer-events-none) para no mover el layout
              ni robar el toque del botón de cerrar.
            */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-smoke bg-paper/95 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="caption inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-graphite">
                  <Timer size={11} /> La cámara se cerrará en
                </span>
                <span
                  className={`caption text-[10px] tabular-nums ${isLow ? "text-red-600" : "text-carbon"
                    }`}
                >
                  {secondsLeft} s
                </span>
              </div>
              <div className="mt-1.5 h-0.5 w-full overflow-hidden bg-smoke">
                <div
                  className={`h-full transition-[width] duration-200 ease-linear ${isLow ? "bg-red-600" : "bg-carbon"
                    }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          // Mismo encuadre que el vídeo para que el paso a cámara no mueva el
          // layout (antes el botón saltaba de sitio al abrir y cerrar).
          <div className="flex aspect-square w-full max-w-md mx-auto flex-col items-center justify-center gap-4 border border-dashed border-smoke bg-stone/10 px-6 text-center">
            {verifying ? (
              <Loader2 size={28} className="animate-spin text-graphite" />
            ) : (
              <>
                <QrCode size={28} strokeWidth={1.25} className="text-graphite" />
                {/* Cuando hubo error, el detalle ya está en el aviso rojo de
                    abajo: aquí no repetimos un mensaje que podría no aplicar
                    (por ejemplo, permiso de cámara denegado). */}
                {(timedOut || !needsRetry) && (
                  <p className="caption text-[12px] text-carbon leading-relaxed">
                    {timedOut
                      ? "No detectamos ningún QR"
                      : "Escanea el QR de entrega del cliente."}
                  </p>
                )}
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 bg-carbon text-paper px-5 py-3 text-[12px] uppercase tracking-wider hover:bg-carbon/85 transition-colors"
                >
                  {needsRetry ? (
                    <>
                      <RotateCcw size={14} /> Reintentar
                    </>
                  ) : (
                    <>
                      <Camera size={16} /> Abrir cámara
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {status && (
          <p className="mt-3 text-sm text-graphite flex items-center gap-2">
            {verifying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : status.includes("válido") ? (
              <CheckCircle2 size={16} className="text-green-600" />
            ) : null}
            {status}
          </p>
        )}
        {err && (
          <p className="mt-3 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
            {err}
          </p>
        )}
      </div>

      <div className="mt-8">
        <h3 className="font-medium text-carbon">¿No puedes usar la cámara?</h3>
        <p className="text-sm text-graphite mt-1">
          Pega el token del QR o escribe el código de 4 dígitos que el cliente
          te dicte. Ambos cierran la entrega igual.
        </p>
        {/*
          En mobile el input y el botón se apilan: con `gap-2` (16px) y el
          padding lateral del panel, el botón se salía del viewport cuando
          ambos iban en la misma fila.
        */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="min-w-0 w-full flex-1 border border-smoke px-3 py-2 text-sm font-mono"
            placeholder="Token del QR o código de 4 dígitos"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={1024}
            value={manualEntry}
            onChange={(e) => setManualEntry(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleToken(manualEntry);
            }}
          />
          <button
            onClick={() => handleToken(manualEntry)}
            disabled={!manualEntry || verifying}
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap bg-carbon text-paper px-3 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50 sm:px-4"
          >
            <QrCode size={14} className="mr-1" /> Verificar
          </button>
        </div>
      </div>
    </section>
  );
}
