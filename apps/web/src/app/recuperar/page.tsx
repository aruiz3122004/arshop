"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import {
  apiRequestPasswordReset,
  apiUpdatePassword,
} from "@/lib/api";

type Mode = "request" | "update" | "invalid";

function parseHash(): { accessToken?: string; type?: string } {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return {};
  const params = new URLSearchParams(hash.slice(1));
  return {
    accessToken: params.get("access_token") ?? undefined,
    type: params.get("type") ?? undefined,
  };
}

export default function RecoveryPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("request");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Modo "request" (pedir email de recuperación)
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [slowServer, setSlowServer] = useState(false);
  const [sent, setSent] = useState(false);

  // Modo "update" (nueva contraseña)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { accessToken: tok, type } = parseHash();
    if (tok && type === "recovery") {
      setAccessToken(tok);
      setMode("update");
      // Limpia el hash para que el token no quede en la URL
      if (window.history.replaceState) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    } else if (window.location.hash && !tok) {
      // Hash presente pero no es un flujo de recovery válido
      setMode("invalid");
    }
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = email.trim().toLowerCase();
    const hash = await sha256(normalized);
    const cacheKey = `arshop:reset-sent:${hash}`;
    const cached = sessionStorage.getItem(cacheKey);
    const now = Date.now();

    if (cached) {
      const timestamp = parseInt(cached, 10);
      if (now - timestamp < 60_000) {
        setSent(true);
        return;
      }
    }

    setSending(true);
    setSlowServer(false);
    // Igual que en el login: si el backend está despertando, explicamos la
    // espera en vez de dejar el botón girando sin contexto.
    const slowTimer = window.setTimeout(() => setSlowServer(true), 3_000);
    try {
      await apiRequestPasswordReset(normalized);
      sessionStorage.setItem(cacheKey, String(now));
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el correo. Intenta de nuevo.");
    } finally {
      window.clearTimeout(slowTimer);
      setSlowServer(false);
      setSending(false);
    }
  };

  async function sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    const array = Array.from(new Uint8Array(digest));
    return array.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!accessToken) {
      setError("Enlace de recuperación inválido.");
      return;
    }

    setUpdating(true);
    try {
      await apiUpdatePassword(accessToken, newPassword);
      setUpdated(true);
      setTimeout(() => router.push("/cuenta"), 2500);
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="mx-auto max-w-[480px] px-4 md:px-6 pt-8 pb-24">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Cuenta", href: "/cuenta" },
          { label: "Recuperar contraseña" },
        ]}
      />

      <SectionTitle>
        {mode === "update" ? "Nueva contraseña" : "Recuperar contraseña"}
      </SectionTitle>

      {error && (
        <div className="mb-6 border border-carbon/20 bg-stone/40 p-3.5 text-center text-[13px] text-carbon">
          {error}
        </div>
      )}

      {mode === "invalid" && (
        <div className="border border-smoke p-6 text-center">
          <ShieldCheck className="mx-auto h-5 w-5 text-graphite" />
          <p className="caption text-carbon mt-3 text-[13px]">
            El enlace de recuperación no es válido o expiró.
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("request");
              setError(null);
            }}
            className="mt-5 inline-block border border-carbon bg-carbon px-6 py-2.5 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors"
          >
            Solicitar un nuevo enlace
          </button>
        </div>
      )}

      {mode === "request" && !sent && (
        <form onSubmit={handleRequest} className="flex flex-col gap-6">
          <p className="caption text-graphite text-[13px] leading-relaxed">
            Ingresa el correo asociado a tu cuenta ARShop. Te enviaremos un
            enlace para que puedas crear una nueva contraseña.
          </p>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Correo electrónico
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@dominio.com"
              className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            className="mt-2 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Mail size={14} /> Enviar enlace
              </>
            )}
          </button>

          {sending && slowServer && (
            <p className="caption -mt-2 text-center text-[11px] text-graphite">
              Despertando el servidor… la primera carga del día puede tardar
              unos segundos.
            </p>
          )}

          <p className="caption text-center text-graphite text-[12px] mt-2">
            ¿Recordaste tu contraseña?{" "}
            <Link
              href="/cuenta"
              className="text-carbon underline underline-offset-4"
            >
              Iniciar sesión
            </Link>
          </p>
        </form>
      )}

      {mode === "request" && sent && (
        <div className="border border-smoke p-6 text-center">
          <Check className="mx-auto h-5 w-5 text-carbon" />
          <p className="caption text-carbon mt-3 text-[13px]">
            Si existe una cuenta con{" "}
            <span className="font-medium">{email}</span>, enviaremos un correo
            con instrucciones.
          </p>
          <p className="caption text-graphite mt-2 text-[12px]">
            Revisa también tu carpeta de spam. El enlace expira en 1 hora.
          </p>
        </div>
      )}

      {mode === "update" && !updated && (
        <form onSubmit={handleUpdate} className="flex flex-col gap-6">
          <p className="caption text-graphite text-[13px] leading-relaxed">
            Elige una nueva contraseña segura de al menos 8 caracteres.
          </p>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Nueva contraseña
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Confirmar contraseña
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>

          <button
            type="submit"
            disabled={updating}
            className="mt-2 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {updating ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Actualizando...
              </>
            ) : (
              <>
                <Lock size={14} /> Actualizar contraseña
              </>
            )}
          </button>
        </form>
      )}

      {mode === "update" && updated && (
        <div className="border border-carbon p-6 text-center bg-stone/20">
          <Check className="mx-auto h-5 w-5 text-carbon" />
          <p className="caption text-carbon mt-3 text-[13px]">
            Contraseña actualizada. Te redirigimos a tu cuenta...
          </p>
        </div>
      )}
    </div>
  );
}
