"use client";

import type { UserProfile } from "./api";

/**
 * Cache local de la sesión para pintar la cuenta sin esperar al backend.
 *
 * Contexto: el backend vive en Render free, que duerme a los 15 min y tarda
 * 20-50s en despertar. Antes, entrar a /cuenta implicaba un `GET /users/me`
 * bloqueante: el usuario veía "Cargando cuenta..." durante todo el cold start.
 *
 * Aquí guardamos:
 *   1. El último perfil conocido (localStorage) para hidratar la vista al
 *      instante y revalidar en background.
 *   2. Una cookie testigo (no httpOnly, la setea el backend) para saber si hay
 *      sesión antes de hacer cualquier request.
 *
 * Nada de esto es fuente de verdad: si `/users/me` responde 401, se limpia.
 */

const CACHED_USER_KEY = "arshop:last-user:v1";
const AUTH_HINT_COOKIE = "arshop_auth";

export function hasAuthHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((row) => row.startsWith(`${AUTH_HINT_COOKIE}=`) && row.length > AUTH_HINT_COOKIE.length + 1);
}

export function setAuthHint(): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const sameSite = secure ? "; SameSite=None" : "; SameSite=Lax";
  // 30 días, igual que el refresh token.
  document.cookie = `${AUTH_HINT_COOKIE}=1; Max-Age=${60 * 60 * 24 * 30}; Path=/${sameSite}${secure}`;
}

export function clearAuthHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** Perfil cacheado de la última sesión válida (o `null`). */
export function readCachedUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    // Validación mínima: si el shape cambió, preferimos no hidratar.
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.email !== "string") {
      return null;
    }
    return parsed as UserProfile;
  } catch {
    return null;
  }
}

export function writeCachedUser(user: UserProfile | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // localStorage lleno o bloqueado (modo privado): no es crítico.
  }
}
