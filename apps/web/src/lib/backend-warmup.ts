"use client";

/**
 * Warm-up del backend en Render free.
 *
 * El plan gratuito apaga la instancia a los ~15 min sin tráfico y la primera
 * request paga 20-50s de arranque (Nest + Supabase + Redis). Ese costo es
 * inevitable, pero no tiene por qué pagarlo el usuario *al enviar el login*:
 * lo adelantamos apenas se carga la página, mientras lee y escribe sus datos.
 *
 * `GET /health` es la ruta más barata del backend (`@Public`, sin DB).
 *
 * Ojo: el navegador pega contra `/api/health`, que Vercel reescribe al
 * `BACKEND_URL`. Si la función de Vercel corta la request antes de que Render
 * termine de arrancar, la instancia sigue despertando igual, así que
 * reintentamos en vez de rendirnos.
 */

const LAST_PING_KEY = "arshop:backend-ping";
const MIN_GAP_MS = 60_000; // no más de 1 ráfaga/min por pestaña
const KEEPALIVE_INTERVAL_MS = 10 * 60_000; // < 15 min de sleep de Render
const PING_TIMEOUT_MS = 25_000; // corta requests colgadas y permite reintentar
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;

let keepAliveTimer: number | null = null;
let visibilityBound = false;
// Evita solapar ráfagas (script inline + provider + visibilitychange + interval).
let warming = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

async function pingOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    // `keepalive` evita que el navegador cancele la request si el usuario
    // navega antes de que la instancia termine de despertar.
    const res = await fetch("/api/health", {
      cache: "no-store",
      signal: controller.signal,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Ráfaga de pings con reintentos: una sola a la vez por pestaña. */
async function ping(): Promise<void> {
  if (warming) return;
  warming = true;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (await pingOnce()) return;
      // Si el usuario se fue a otra pestaña, paramos: `visibilitychange` lo
      // vuelve a disparar cuando regrese.
      if (attempt < MAX_ATTEMPTS && isVisible()) {
        await delay(RETRY_DELAY_MS);
      } else {
        return;
      }
    }
  } finally {
    warming = false;
  }
}

/**
 * Dispara el arranque del backend como máximo una ráfaga por minuto.
 * `force` salta el throttle: lo usa el provider al montar, porque el script
 * inline del layout ya hizo un intento sin reintentos.
 */
export function warmUpBackend(force = false): void {
  if (typeof window === "undefined") return;
  if (!force) {
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(LAST_PING_KEY) ?? 0) || 0;
    } catch {
      last = 0;
    }
    if (Date.now() - last < MIN_GAP_MS) return;
  }
  try {
    window.sessionStorage.setItem(LAST_PING_KEY, String(Date.now()));
  } catch {
    // sessionStorage bloqueado: seguimos igual, sólo perdemos el throttle.
  }
  void ping();
}

/**
 * Mantiene la instancia caliente mientras haya una pestaña abierta y vuelve a
 * despertarla cuando el usuario regresa a la pestaña. Complementa al cron de
 * GitHub Actions (que cubre el caso "nadie tiene la app abierta").
 */
export function startBackendKeepAlive(): void {
  if (typeof window === "undefined" || keepAliveTimer !== null) return;
  keepAliveTimer = window.setInterval(() => warmUpBackend(), KEEPALIVE_INTERVAL_MS);

  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") warmUpBackend();
    });
  }
}
