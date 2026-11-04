import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (antes `middleware`) — Next.js 16 renombró la convención.
 *
 * Propósito: **gate de UX**, no de autorización.
 *
 * Las áreas privadas (`/admin`, `/domiciliario`, `/cuenta/pedidos/*`) se
 * protegían sólo en el cliente: el HTML viajaba a cualquiera y React redirigía
 * después de hidratar. Eso significaba servir la cáscara del panel (rutas,
 * nombres de secciones, estructura) a un visitante anónimo y gastar un render
 * completo para terminar rebotándolo.
 *
 * Aquí cortamos antes: si no hay cookie de sesión, redirigimos a /cuenta.
 * La autorización real sigue siendo del backend (JWT + RolesGuard), así que
 * falsificar una cookie sólo hace que el panel cargue y la API responda 401.
 *
 * Se acepta refresh además de access: el access token vive 1 h y expira
 * mientras la pestaña está abierta; si sólo miráramos esa cookie, un usuario
 * con sesión válida sería expulsado al recargar. `apiFetch` se encarga de
 * refrescar en background.
 */
const SESSION_COOKIES = ["arshop_access_token", "arshop_refresh_token"] as const;

/**
 * El sandbox de portafolio (demo-store.ts) vive en localStorage y NO crea
 * cookies reales. Sin esta excepción, "Entrar como Admin" en el modo demo
 * rebotaría a /cuenta. demo-store setea/limpia esta cookie junto con la
 * sesión demo (TTL 30 min).
 */
const DEMO_COOKIE = "arshop_demo";

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some(
    (name) => Boolean(request.cookies.get(name)?.value),
  );
  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === "1";

  if (hasSession || isDemo) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/cuenta";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Debe ser un literal: Next analiza el matcher de forma estática en build.
  matcher: [
    "/admin",
    "/admin/:path*",
    "/domiciliario",
    "/domiciliario/:path*",
    "/cuenta/pedidos/:path*",
  ],
};

