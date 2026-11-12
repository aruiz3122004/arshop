"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, ShieldAlert } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { apiVerifyEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Confirmación de cuenta.
 *
 * Dos caminos válidos:
 * 1. El usuario pulsó el botón del correo: Supabase valida el token y lo
 *    redirige acá (con `#access_token=...` o `?code=...`). El correo ya quedó
 *    confirmado del lado servidor, sólo mostramos el éxito.
 * 2. El enlace se abrió en otro dispositivo: escribe el código del correo y
 *    nosotros hacemos `verifyOtp` (POST /auth/verify-email), que además deja
 *    la sesión iniciada.
 */
export default function VerifyPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Supabase agrega el resultado de la verificación en el hash o en el query.
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash || window.location.search);

    const initial = new URLSearchParams(window.location.search).get("email");
    if (initial) setEmail(initial);

    if (params.get("error") || params.get("error_description")) {
      setError(
        "El enlace expiró o ya se usó. Puedes pedir uno nuevo con tu correo y contraseña.",
      );
    } else if (params.get("access_token") || params.get("code")) {
      // El correo ya quedó confirmado del lado servidor al abrir el enlace.
      setDone(true);
      // La cookie de sesión no la tenemos: pedimos el perfil para que si el
      // backend ya reconoce la sesión, el header se actualice solo.
      void refreshUser();
    }
  }, [refreshUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiVerifyEmail(email.trim(), code.trim());
      await refreshUser();
      setDone(true);
      router.replace("/cuenta");
    } catch (err: any) {
      setError(
        err?.message ||
          "No pudimos confirmar tu correo. Revisa el código e intenta de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[480px] px-4 md:px-6 pt-10 pb-24">
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/" }, { label: "Confirmar cuenta" }]}
      />

      <SectionTitle>Confirmar tu correo</SectionTitle>

      {done ? (
        <div className="mt-8 border border-smoke p-8 text-center flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-carbon flex items-center justify-center">
            <Check size={18} className="text-paper" />
          </div>
          <div>
            <p className="caption text-carbon font-medium">Correo confirmado</p>
            <p className="caption text-graphite text-[13px] mt-1">
              Tu cuenta está activa. Ya puedes iniciar sesión y comprar.
            </p>
          </div>
          <Link
            href="/cuenta"
            className="mt-2 inline-flex items-center border border-carbon bg-carbon px-6 py-2.5 caption uppercase tracking-widest text-paper text-[11px] hover:bg-carbon/85 transition-colors"
          >
            Ir a mi cuenta
          </Link>
        </div>
      ) : (
        <>
          <p className="caption text-graphite mt-3 leading-relaxed">
            Escribe el código que enviamos a tu correo. Si el enlace del correo
            ya se abrió, esta pantalla se actualiza sola.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                Correo electrónico
              </span>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite pointer-events-none"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@dominio.com"
                  className="w-full border border-smoke py-2.5 pl-9 pr-3 caption text-carbon focus:border-carbon focus:outline-none"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                Código de confirmación
              </span>
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="12345678"
                className="w-full border border-smoke py-2.5 px-3 caption text-carbon tracking-[0.25em] focus:border-carbon focus:outline-none"
              />
            </label>

            {error && (
              <p className="caption text-[12px] text-carbon border border-carbon/20 bg-stone/40 px-3 py-2 flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !code.trim()}
              className="flex items-center justify-center gap-2 border border-carbon bg-carbon py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Confirmando...</span>
                </>
              ) : (
                "Confirmar mi correo"
              )}
            </button>

            <p className="caption text-[12px] text-graphite text-center">
              ¿No te llegó o expiró?{" "}
              <Link
                href="/verificar/reenviar"
                className="text-carbon underline underline-offset-2"
              >
                Pedir otro correo
              </Link>
            </p>
          </form>
        </>
      )}
    </div>
  );
}
