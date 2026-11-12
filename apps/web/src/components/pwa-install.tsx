"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

/**
 * Evento `beforeinstallprompt` de Chromium — no está en los tipos DOM estándar.
 * Lo redeclaramos localmente.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "arshop:pwa-dismissed-at";

/**
 * Store global del prompt. El evento `beforeinstallprompt` sólo dispara una
 * vez por carga de página, así que lo guardamos para que cualquier parte de
 * la UI (footer, settings, etc.) pueda ofrecer el instalador cuando el
 * usuario lo pida — en vez de empujarle un banner invasivo.
 */
let cachedPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(e: BeforeInstallPromptEvent | null) => void>();

function setCachedPrompt(ev: BeforeInstallPromptEvent | null) {
  cachedPrompt = ev;
  listeners.forEach((l) => l(ev));
}

/**
 * Monta efectos globales: registro del service worker y captura del prompt
 * de instalación. No renderiza nada visible — el disparador vive en
 * <PwaInstallLink />, dentro del footer.
 */
export function PwaInstall() {
  // 1) Registrar service worker
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) =>
          console.warn("[PWA] Service worker registration failed:", err),
        );
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // 2) Capturar el prompt de instalación y guardarlo en el store global
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setCachedPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setCachedPrompt(null);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  return null;
}

/**
 * Enlace sutil en el footer. Sólo se renderiza si:
 *  - El browser lanzó `beforeinstallprompt` (Chrome/Edge/Samsung Internet,
 *    típicamente en Android y desktop; iOS no soporta el evento, no se ve).
 *  - El usuario no lo instaló ya.
 *
 * Antes era un banner flotante centrado en bottom-5 que se superponía al
 * contenido de la página — intrusivo en mobile y especialmente molesto en
 * la PDP, donde tapaba la imagen del producto.
 */
export function PwaInstallLink() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(cachedPrompt);

  useEffect(() => {
    const listener = (ev: BeforeInstallPromptEvent | null) => setPrompt(ev);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (err) {
      console.warn("[PWA] install prompt failed:", err);
    } finally {
      setCachedPrompt(null);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  };

  if (!prompt) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="caption text-paper/60 hover:text-paper transition-colors inline-flex items-center gap-1.5"
    >
      <Download size={12} strokeWidth={1.5} />
      Instalar la app
    </button>
  );
}
