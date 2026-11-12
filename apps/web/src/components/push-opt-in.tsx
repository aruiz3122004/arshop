"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { apiPushPublicKey, apiPushSubscribe, apiPushUnsubscribe } from "@/lib/api";

interface PushOptInProps {
  description?: string;
  className?: string;
}

export function PushOptIn({ description, className = "" }: PushOptInProps = {}) {
  const [supported, setSupported] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [enabledHere, setEnabledHere] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    (async () => {
      try {
        const { enabled, publicKey } = await apiPushPublicKey();
        if (!enabled || !publicKey) {
          setSupported(false);
          return;
        }
        setPublicKey(publicKey);
        const reg = await ensureSwRegistration();
        const sub = await reg.pushManager.getSubscription();
        setEnabledHere(Boolean(sub));
      } catch (e) {
        setMsg((e as Error).message);
      }
    })();
  }, []);

  async function subscribe() {
    setWorking(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("Permiso denegado por el navegador.");
        return;
      }
      const reg = await ensureSwRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey!),
      });
      const json = sub.toJSON() as any;
      await apiPushSubscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setEnabledHere(true);
      setMsg("Listo, recibirás notificaciones aquí.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    setWorking(true);
    setMsg(null);
    try {
      const reg = await ensureSwRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiPushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabledHere(false);
      setMsg("Notificaciones desactivadas en este dispositivo.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (!supported) {
    return (
      <p className="mt-2 caption text-[11px] text-graphite flex items-center gap-2">
        <BellOff size={14} /> No disponible en este navegador o aún no configurado.
      </p>
    );
  }

  return (
    <div className={`mt-3 space-y-3 ${className}`}>
      <p className="caption text-graphite text-[12px] leading-relaxed">
        {enabledHere
          ? "Las notificaciones están activadas en este dispositivo."
          : (description ?? "Recibe un aviso cuando tu pedido esté listo para entregar o cuando se te asigne uno.")}
      </p>
      <button
        type="button"
        onClick={enabledHere ? unsubscribe : subscribe}
        disabled={working}
        className="inline-flex items-center gap-2 border border-smoke bg-paper px-4 py-2.5 caption uppercase tracking-widest text-[11px] text-carbon hover:border-carbon transition-colors disabled:opacity-50 cursor-pointer"
      >
        {working ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        {enabledHere ? "Desactivar" : "Activar notificaciones"}
      </button>
      {msg && (
        <p className="caption text-[11px] border border-carbon/20 bg-stone/40 p-2.5 text-carbon">{msg}</p>
      )}
    </div>
  );
}

async function ensureSwRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function urlB64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}
