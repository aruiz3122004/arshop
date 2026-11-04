import type { Response } from "express";
import type { CookieOptions } from "express";

/**
 * Nombres y helpers de las cookies de autenticación.
 *
 * - Access token (vida corta): se renueva con el refresh.
 * - Refresh token (vida larga): se usa para pedir nuevos access.
 *
 * Ambas son httpOnly: no accesibles desde JavaScript del cliente,
 * previene exfiltración vía XSS.
 */

export const ACCESS_COOKIE = "arshop_access_token";
export const REFRESH_COOKIE = "arshop_refresh_token";

/**
 * Cookie testigo (NO httpOnly) que indica "hay una sesión iniciada".
 *
 * Los tokens son httpOnly, así que el cliente no puede saber si hay sesión sin
 * preguntarle al backend (`/users/me`). Con el backend en Render free (frío =
 * 20-50s de arranque) eso significaba bloquear /cuenta en "Cargando cuenta..."
 * antes incluso de mostrar el formulario de login.
 *
 * Con este flag el front decide en el primer render: sin cookie → pinta el
 * login de inmediato y revalida en background; con cookie → hidrata desde el
 * último perfil cacheado. No contiene datos personales ni tokens.
 */
export const AUTH_HINT_COOKIE = "arshop_auth";
const AUTH_HINT_VALUE = "1";

const ACCESS_MAX_AGE_MS = 60 * 60 * 1000; // 1h
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

/**
 * En producción las cookies cruzan dominios (vercel.app ↔ onrender.com),
 * así que SameSite debe ser "none" + Secure obligatorio.
 * En dev (http://localhost) usamos "lax" porque "none" sin Secure es rechazado.
 */
function baseCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  const opts = baseCookieOptions();
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...opts,
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...opts,
    maxAge: REFRESH_MAX_AGE_MS,
  });
  // Testigo legible por JS: evita que el front bloquee la UI esperando /users/me.
  res.cookie(AUTH_HINT_COOKIE, AUTH_HINT_VALUE, {
    ...opts,
    httpOnly: false,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response) {
  const opts = baseCookieOptions();
  // Para que el navegador borre efectivamente la cookie, debemos pasarle
  // las MISMAS opciones (path/sameSite/secure/domain) con las que se seteó.
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
  res.clearCookie(AUTH_HINT_COOKIE, { ...opts, httpOnly: false });
}
