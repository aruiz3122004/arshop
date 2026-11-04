"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  clearDemoSession,
  getDemoSession,
  resetDemoDatabase,
} from "@/lib/demo-store";

export function DemoBanner() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [role, setRole] = useState<string>("");
  const [remainingSecs, setRemainingSecs] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkState = () => {
      const sess = getDemoSession();
      if (sess && sess.expiresAt > Date.now()) {
        setActive(true);
        setRole(sess.role);
        setRemainingSecs(Math.max(0, Math.floor((sess.expiresAt - Date.now()) / 1000)));
      } else {
        if (active) {
          setActive(false);
          clearDemoSession();
          void refreshUser();
          router.push("/cuenta");
        }
      }
    };

    checkState();
    const interval = setInterval(checkState, 1000);
    return () => clearInterval(interval);
  }, [active, refreshUser, router, user]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!active || !user) return null;

  const minutes = Math.floor(remainingSecs / 60);
  const seconds = remainingSecs % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  const handleExit = async () => {
    setBusy(true);
    setOpen(false);
    clearDemoSession();
    await refreshUser();
    router.push("/cuenta");
  };

  const handleReset = async () => {
    setBusy(true);
    setOpen(false);
    resetDemoDatabase();
    await refreshUser();
    router.refresh();
    setBusy(false);
  };

  const roleLabel =
    role === "ADMIN"
      ? "ADMIN"
      : role === "REPARTIDOR"
        ? "REPARTIDOR"
        : "CLIENTE";

  return (
    <div
      ref={containerRef}
      /*
        En mobile la pill queda justo encima del bottom-tab-bar del panel
        (68px de alto + safe-area) para no tapar ni bloquear los tabs.
        En desktop vuelve a la esquina inferior derecha.
      */
      className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-50 flex flex-col items-end select-none md:right-4 md:bottom-6"
    >
      {/* Menú desplegable con solo 2 opciones al hacer clic */}
      {open && (
        <div className="mb-2 w-[288px] max-w-[calc(100vw-2rem)] border border-carbon bg-paper shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            className="flex w-full items-center justify-between px-3 py-2 text-left caption text-[11px] uppercase tracking-wider text-carbon hover:bg-stone/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span>Reiniciar datos</span>
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
          </button>
          <div className="h-[1px] bg-smoke" />
          <button
            type="button"
            onClick={handleExit}
            disabled={busy}
            className="flex w-full items-center justify-between px-3 py-2 text-left caption text-[11px] uppercase tracking-wider text-carbon hover:bg-stone/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span>Salir</span>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Pill minimalista monocromática (blanco y negro) */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 border border-carbon bg-carbon text-paper hover:bg-carbon/90 px-3 py-1.5 shadow-lg transition-all text-[11px] font-mono tracking-wider cursor-pointer"
        title="Modo Demostración · Clic para opciones"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-paper shrink-0" />
        <span className="font-semibold">{roleLabel}</span>
        <span className="text-paper/40">·</span>
        <span className="tabular-nums">{timeFormatted}</span>
        <ChevronUp
          size={11}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}
