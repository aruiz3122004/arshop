"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiCompleteMfa, apiSendMfaEmail } from "@/lib/api";

interface Props {
  sessionId: string;
  onSuccess: (data: { accessToken: string; refreshToken: string; expiresAt: number; user: { id: string; email: string } }) => void;
  onError?: (error: string) => void;
}

type Method = "totp" | "email" | "backup";

export function MfaVerificationModal({ sessionId, onSuccess, onError }: Props) {
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Longitud esperada por método (TOTP y email: 6 dígitos; backup: 8 alfanuméricos).
  const expectedLen = method === "backup" ? 8 : 6;
  const isReady = code.length === expectedLen;

  const switchMethod = (next: Method) => {
    setMethod(next);
    setCode("");
    setError(null);
  };

  const handleVerify = async () => {
    if (!isReady) {
      setError(method === "backup" ? "Ingresa el código completo (8 caracteres)" : "Ingresa el código completo");
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const result = await apiCompleteMfa(sessionId, code, method);
      onSuccess(result);
    } catch (err: any) {
      const errMsg = err?.message || "Código inválido";
      setError(errMsg);
      onError?.(errMsg);
    } finally {
      setVerifying(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setError(null);

    try {
      await apiSendMfaEmail(sessionId);
      setMethod("email");
      setEmailSent(true);
      setCode("");
    } catch (err: any) {
      setError(err?.message || "Error enviando código por email");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md border border-smoke bg-paper p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-serif text-lg text-carbon">Verificar identidad</h3>
          <button
            type="button"
            disabled={verifying || sendingEmail}
            className="p-1 hover:bg-stone/20 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon mb-4">
            {error}
          </div>
        )}

        {method === "totp" && (
          <div className="space-y-4">
            <p className="caption text-[13px] text-graphite">
              Ingresa el código de 6 dígitos de tu aplicación de autenticación:
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              disabled={verifying}
              className="w-full border border-smoke px-4 py-3 caption text-[16px] text-center text-carbon outline-none tracking-[0.2em] font-mono"
            />

            <button
              onClick={handleVerify}
              disabled={!isReady || verifying}
              className="w-full py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : null}
              Verificar
            </button>

            <div className="border-t border-smoke pt-4 space-y-2">
              <p className="caption text-[12px] text-graphite">
                ¿No tienes acceso a tu autenticador?
              </p>
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="w-full py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
              >
                {sendingEmail ? "Enviando..." : "Enviar código por email"}
              </button>
              <button
                onClick={() => switchMethod("backup")}
                disabled={verifying}
                className="w-full py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
              >
                Usar código de respaldo
              </button>
            </div>
          </div>
        )}

        {method === "email" && (
          <div className="space-y-4">
            <p className="caption text-[13px] text-graphite">
              {emailSent
                ? "Se envió un código de 6 dígitos a tu correo. Ingrésalo aquí:"
                : "Ingresa el código que recibiste por email:"}
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              disabled={verifying || !emailSent}
              className="w-full border border-smoke px-4 py-3 caption text-[16px] text-center text-carbon outline-none tracking-[0.2em] font-mono disabled:opacity-50"
            />

            <button
              onClick={handleVerify}
              disabled={!isReady || verifying || !emailSent}
              className="w-full py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : null}
              Verificar
            </button>

            <button
              onClick={() => switchMethod("totp")}
              disabled={verifying}
              className="w-full py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
            >
              Usar autenticador
            </button>
          </div>
        )}

        {method === "backup" && (
          <div className="space-y-4">
            <p className="caption text-[13px] text-graphite">
              Ingresa uno de tus códigos de respaldo (8 caracteres). Cada código
              es de un solo uso.
            </p>

            <input
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 8),
                )
              }
              maxLength={9} // 8 chars + guión opcional
              disabled={verifying}
              className="w-full border border-smoke px-4 py-3 caption text-[16px] text-center text-carbon outline-none tracking-[0.3em] font-mono uppercase"
            />

            <button
              onClick={handleVerify}
              disabled={!isReady || verifying}
              className="w-full py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : null}
              Verificar
            </button>

            <button
              onClick={() => switchMethod("totp")}
              disabled={verifying}
              className="w-full py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
            >
              Usar autenticador
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
