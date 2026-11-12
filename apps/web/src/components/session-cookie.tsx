"use client";

import { useEffect } from "react";

const COOKIE_NAME = "arshop_session_id";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Setea una cookie anónima `arshop_session_id` al primer render.
 * No contiene datos personales — es un UUID para correlacionar la sesión
 * entre pestañas y para auditoría / analytics futura.
 */
export function SessionCookie() {
  useEffect(() => {
    if (readCookie(COOKIE_NAME)) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    writeCookie(COOKIE_NAME, id);
  }, []);
  return null;
}
