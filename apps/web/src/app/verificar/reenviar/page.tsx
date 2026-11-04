"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock, Mail } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { apiResendVerification } from "@/lib/api";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiResendVerification(email.trim(), password);
      setAlreadyConfirmed(res.alreadyConfirmed);
      setSent(true);
    } catch (err: any) {
      setError(
        err?.message ||
          "No pudimos enviar el correo. Revisa el correo y la contraseña.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-[480px] px-4 md:px-6 pt-10 pb-24">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Reenviar verificación" },
        ]}
      />

      <SectionTitle>Verificar tu cuenta</SectionTitle>
      <p className="caption text-graphite mt-3 leading-relaxed">
        Te enviamos un correo de confirmación al registrarte. Si no llegó o
        expiró, pide uno nuevo. Por seguridad te pedimos la contraseña: sólo se
        envía a la bandeja del titular de la cuenta.
      </p>

      {sent ? (
        <div className="mt-10 border border-smoke p-8 text-center flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-carbon flex items-center justify-center">
            <Check size={18} className="text-paper" />
          </div>
          <div>
            <p className="caption text-carbon font-medium">
              {alreadyConfirmed ? "Tu correo ya está confirmado" : "Correo enviado"}
            </p>
            <p className="caption text-graphite text-[13px] mt-1">
              {alreadyConfirmed ? (
                <>Ya puedes iniciar sesión con {email}.</>
              ) : (
                <>
                  Revisa <span className="text-carbon">{email}</span> y usa el
                  botón o el código del correo. Si no aparece en unos minutos,
                  mira en spam.
                </>
              )}
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
        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5">
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
              Contraseña
            </span>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite pointer-events-none"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-smoke py-2.5 pl-9 pr-3 caption text-carbon focus:border-carbon focus:outline-none"
              />
            </div>
          </label>

          {error && (
            <p className="caption text-[12px] text-carbon border border-carbon/20 bg-stone/40 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={sending || !email.trim() || !password}
            className="flex items-center justify-center gap-2 border border-carbon bg-carbon py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              "Reenviar correo de verificación"
            )}
          </button>

          <p className="caption text-[12px] text-graphite text-center">
            ¿Ya confirmaste?{" "}
            <Link href="/cuenta" className="text-carbon underline underline-offset-2">
              Inicia sesión
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
