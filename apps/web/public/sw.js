// ARShop · Service Worker
// Estrategia:
//   • Shell público (HTML + estáticos de /_next/static): cache-first / network-first con fallback.
//   • Recursos de terceros (Unsplash, Google Fonts, Stripe): passthrough; el
//     navegador los resuelve sin pasar por el SW.
//   • Imágenes propias y /_next/image: cache-first.
//   • Requests al backend y toda API: SOLO red (nunca cachear datos autenticados).
//   • Rutas privadas (/admin, /domiciliario, /cuenta): SOLO red, para que el
//     gate del `proxy.ts` se evalúe siempre y no se sirva HTML de sesiones previas.

const CACHE_VERSION = "arshop-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMG_CACHE = `${CACHE_VERSION}-img`;

// Prefijos que no se cachean: el servidor decide (sesión/rol) en cada request.
const PRIVATE_PREFIXES = ["/admin", "/domiciliario", "/cuenta"];

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiRequest(url) {
  // Sólo mismo origen: el rewrite de Next expone el backend en /api/*.
  return new URL(url).pathname.startsWith("/api/");
}

function isImageRequest(req) {
  return (
    req.destination === "image" ||
    /\.(png|jpe?g|webp|avif|svg|gif)(\?.*)?$/i.test(new URL(req.url).pathname)
  );
}

function isPrivatePage(url) {
  const { pathname } = new URL(url);
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res && res.ok && req.method === "GET") {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && req.method === "GET") {
    const cache = await caches.open(cacheName);
    cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Recursos de terceros (Unsplash, Google Fonts, Stripe…): los resuelve el
  // navegador directamente. Un fetch() hecho desde el SW hereda el
  // `connect-src` del documento; si el origen no está listado, la respuesta se
  // convierte en net::ERR_FAILED (las imágenes del admin y las fuentes
  // fallaban por esto). Además, las respuestas opacas nunca se pueden cachear,
  // así que interceptarlas no aportaba nada.
  if (url.origin !== self.location.origin) return;

  // API y auth: sólo red. Cachear respuestas autenticadas haría que, ante un
  // fallo de red o un cold start, se sirviera el perfil/pedidos de una sesión
  // anterior (y con 200, que el cliente lo tomara por válido).
  if (isApiRequest(req.url)) {
    event.respondWith(fetch(req));
    return;
  }

  // Rutas privadas: sólo red para que el proxy evalúe la cookie en cada visita.
  if (isPrivatePage(req.url)) {
    event.respondWith(fetch(req));
    return;
  }

  if (isImageRequest(req)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // HTML y assets públicos: network-first con fallback offline.
  event.respondWith(networkFirst(req, SHELL_CACHE));
});

// ─────────── Web Push ───────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "ARShop", body: "", url: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Una entrega simulada exige respuesta del cliente: la notificación se
      // queda en pantalla hasta que la cierre o abra el pedido.
      requireInteraction: Boolean(payload.requireInteraction),
      tag: payload.tag ?? undefined,
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        if ("focus" in c) {
          c.focus();
          if ("navigate" in c) {
            try {
              await c.navigate(target);
            } catch {}
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
