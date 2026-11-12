"use client";

import { useEffect, useState } from "react";
import {
  Download,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  apiMfaBackupCodesCount,
  apiMfaDisable,
  apiMfaGenerateBackupCodes,
  apiMfaListFactors,
  apiMfaSetup,
  apiMfaVerify,
} from "@/lib/api";
import { isDemoActive } from "@/lib/demo-store";

type Modal = "setup" | "disable" | "backup" | null;

/**
 * Panel de configuración de MFA reutilizable para cualquier usuario.
 * Antes vivía sólo en /admin/settings; ahora todo cliente puede proteger
 * su cuenta con app autenticadora + códigos de respaldo single-use.
 */
export function MfaSettings() {
  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  // El modo demo se resuelve en el cliente (localStorage), así que lo leemos en
  // un efecto: leerlo durante el render provocaría un desajuste de hidratación
  // (el servidor siempre responde `false`).
  const [demoMode, setDemoMode] = useState(false);

  // Setup modal state
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [setupFactorId, setSetupFactorId] = useState<string>("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Disable modal state
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  // Backup codes modal state
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [generatingBackups, setGeneratingBackups] = useState(false);

  useEffect(() => {
    setDemoMode(isDemoActive());
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setError(null);
      const factors = await apiMfaListFactors();
      if (factors.totp) {
        setMfaEnabled(true);
        setFactorId(factors.totp.id);
        const { count } = await apiMfaBackupCodesCount().catch(() => ({ count: 0 }));
        setBackupCount(count);
      } else {
        setMfaEnabled(false);
        setFactorId(null);
        setBackupCount(null);
      }
    } catch (err: any) {
      setError(err?.message || "Error cargando estado de verificación");
    } finally {
      setLoading(false);
    }
  }

  /** Cierra y limpia el wizard de configuración (el secreto no debe quedar en memoria). */
  function closeSetup() {
    setModal(null);
    setVerifyCode("");
    setQrCode("");
    setSecret("");
    setSetupFactorId("");
  }

  async function handleSetupClick() {
    setError(null);

    // En modo demo no hay cuenta real: el backend devolvería un `qrCode`
    // inexistente y el modal aparecería en blanco. Abrimos el mismo modal para
    // explicar por qué no hay QR, en vez de dejar un hueco vacío.
    if (isDemoActive()) {
      setDemoMode(true);
      setModal("setup");
      return;
    }

    setLoading(true);
    try {
      const result = await apiMfaSetup();
      setSetupFactorId(result.id);
      setSecret(result.secret);
      setQrCode(result.qrCode);
      setModal("setup");
    } catch (err: any) {
      setError(err?.message || "Error configurando 2FA");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotp() {
    if (!verifyCode || verifyCode.length !== 6) {
      setError("Código debe tener 6 dígitos");
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      await apiMfaVerify(setupFactorId, verifyCode);
      setMfaEnabled(true);
      setFactorId(setupFactorId);
      closeSetup();
      // Automáticamente ofrecer generar backup codes como siguiente paso
      await generateBackups();
    } catch (err: any) {
      setError(err?.message || "Código inválido");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisableTotp() {
    if (!disableCode || disableCode.length !== 6 || !factorId) {
      setError("Código debe tener 6 dígitos");
      return;
    }
    setDisabling(true);
    setError(null);
    try {
      await apiMfaDisable(factorId, disableCode);
      setMfaEnabled(false);
      setFactorId(null);
      setBackupCount(null);
      setModal(null);
      setDisableCode("");
    } catch (err: any) {
      setError(err?.message || "Código inválido");
    } finally {
      setDisabling(false);
    }
  }

  async function generateBackups() {
    setGeneratingBackups(true);
    setError(null);
    try {
      const { codes } = await apiMfaGenerateBackupCodes();
      setBackupCodes(codes);
      setBackupCount(codes.length);
      setModal("backup");
    } catch (err: any) {
      setError(err?.message || "Error generando códigos");
    } finally {
      setGeneratingBackups(false);
    }
  }

  function downloadBackupCodes() {
    if (!backupCodes) return;
    const header =
      "ARShop — Códigos de respaldo (8 single-use)\n" +
      "Guárdalos en un lugar seguro. Cada código sirve una sola vez.\n" +
      "Generados el " + new Date().toLocaleString("es-CO") + "\n\n";
    const body = backupCodes.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const blob = new Blob([header + body + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arshop-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="border border-smoke p-6 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      {/* Autenticación TOTP */}
      <div className="border border-smoke p-6">
        <div className="flex items-center gap-3 mb-3">
          {mfaEnabled ? (
            <ShieldCheck size={20} className="text-carbon" />
          ) : (
            <Shield size={20} className="text-graphite" />
          )}
          <h3 className="font-serif text-lg text-carbon">
            {mfaEnabled ? "Verificación en dos pasos activa" : "Verificación en dos pasos"}
          </h3>
        </div>

        <p className="caption text-[12px] text-graphite mb-4 leading-relaxed">
          {mfaEnabled
            ? "Tu cuenta está protegida con un segundo factor TOTP. Al iniciar sesión te pediremos un código de tu app de autenticación."
            : "Agrega una segunda capa de seguridad con Google Authenticator, Authy, Microsoft Authenticator o cualquier app TOTP. Te pedirán un código de 6 dígitos al iniciar sesión."}
        </p>

        <button
          onClick={mfaEnabled ? () => setModal("disable") : handleSetupClick}
          disabled={loading}
          className={`px-4 py-2 caption text-[11px] uppercase tracking-wider transition-colors ${
            mfaEnabled
              ? "border border-carbon text-carbon hover:bg-stone/20"
              : "bg-carbon text-paper hover:bg-carbon/85"
          }`}
        >
          {mfaEnabled ? "Desactivar" : "Activar"}
        </button>
      </div>

      {/* Códigos de respaldo */}
      {mfaEnabled && (
        <div className="border border-smoke p-6">
          <div className="flex items-center gap-3 mb-3">
            <KeyRound size={20} className="text-carbon" />
            <h3 className="font-serif text-lg text-carbon">Códigos de respaldo</h3>
          </div>

          <p className="caption text-[12px] text-graphite mb-4 leading-relaxed">
            Son 8 códigos de un solo uso. Úsalos si pierdes acceso a tu app de
            autenticación (teléfono roto, cambio de dispositivo). Cada código
            funciona una sola vez.
          </p>

          <div className="mb-4 text-[13px] text-carbon">
            {backupCount === null
              ? "—"
              : backupCount === 0
                ? "No tienes códigos activos. Genera una tanda."
                : `Te quedan ${backupCount} ${backupCount === 1 ? "código" : "códigos"} activos.`}
          </div>

          <button
            onClick={generateBackups}
            disabled={generatingBackups}
            className="inline-flex items-center gap-2 px-4 py-2 caption text-[11px] uppercase tracking-wider border border-carbon text-carbon hover:bg-stone/20 transition-colors disabled:opacity-50"
          >
            {generatingBackups ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {backupCount && backupCount > 0 ? "Regenerar códigos" : "Generar códigos"}
          </button>
          {backupCount !== null && backupCount > 0 && (
            <p className="caption text-[11px] text-graphite mt-3">
              Regenerar invalida los códigos actuales y crea una tanda nueva.
            </p>
          )}
        </div>
      )}

      {/* Setup modal — QR + código inicial */}
      {modal === "setup" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl border border-smoke bg-paper p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-lg text-carbon">Configurar verificación</h3>
              <button
                type="button"
                onClick={closeSetup}
                className="p-1 hover:bg-stone/20 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon mb-4">
                {error}
              </div>
            )}

            {demoMode ? (
              // El QR sólo puede generarlo el backend para una cuenta real, así
              // que en el sandbox no mostramos ni QR ni secreto ni el paso de
              // verificación: sería un flujo imposible de completar.
              <div>
                <h4 className="caption text-[12px] font-medium text-carbon mb-3 uppercase tracking-wider">
                  1. Escanea el código QR
                </h4>
                <div className="border border-smoke bg-stone/20 px-6 py-10 text-center">
                  <QrCode
                    size={32}
                    strokeWidth={1.25}
                    className="mx-auto mb-3 text-graphite"
                  />
                  <p className="caption text-[13px] text-carbon">
                    Debes iniciar sesión para usar este QR
                  </p>
                  <p className="caption text-[11px] text-graphite mt-2 leading-relaxed">
                    El código se genera con tu cuenta real. Crea una cuenta o
                    inicia sesión con tu usuario para configurar la verificación
                    en dos pasos.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="caption text-[12px] font-medium text-carbon mb-3 uppercase tracking-wider">
                    1. Escanea el código QR
                  </h4>
                  <p className="caption text-[13px] text-graphite mb-4">
                    Abre tu app de autenticación (Google Authenticator, Authy,
                    Microsoft Authenticator, 1Password, etc.) y escanea este QR:
                  </p>
                  {qrCode && (
                    <div className="flex justify-center mb-4 p-2 sm:p-4 bg-stone/10">
                      {/*
                        Ojo: `--spacing` es 8px en este design system, así que
                        `w-56 h-56` equivalía a 448×448px y el `max-width:100%`
                        del preflight sólo recortaba el ancho → el QR salía
                        estirado verticalmente. Con ancho limitado y `h-auto`
                        la imagen conserva su proporción cuadrada.
                      */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCode}
                        alt="Código QR para configurar la verificación en dos pasos"
                        className="block h-auto w-full max-w-[224px] border-2 border-smoke p-3 bg-paper"
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-smoke pt-6">
                  <h4 className="caption text-[12px] font-medium text-carbon mb-3 uppercase tracking-wider">
                    2. ¿No puedes escanear? Ingresa manualmente
                  </h4>
                  <div className="bg-stone/20 p-4 font-mono text-[12px] text-carbon mb-4 select-all break-all border border-smoke">
                    {secret}
                  </div>
                </div>

                <div className="border-t border-smoke pt-6">
                  <h4 className="caption text-[12px] font-medium text-carbon mb-3 uppercase tracking-wider">
                    3. Verifica el código que muestra tu app
                  </h4>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) =>
                      setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    maxLength={6}
                    className="w-full border border-smoke px-4 py-3 caption text-[16px] text-center text-carbon outline-none tracking-[0.2em] font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-6">
              {demoMode ? (
                <button
                  type="button"
                  onClick={closeSetup}
                  className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors"
                >
                  Entendido
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closeSetup}
                    className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleVerifyTotp}
                    disabled={verifyCode.length !== 6 || verifying}
                    className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
                  >
                    {verifying ? "Verificando..." : "Activar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backup codes modal — mostrar los 8 UNA SOLA VEZ */}
      {modal === "backup" && backupCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-carbon bg-paper p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-lg text-carbon">
                Tus códigos de respaldo
              </h3>
            </div>

            <p className="caption text-[12px] text-carbon mb-5 leading-relaxed">
              <strong>Guárdalos ahora.</strong> No podrás verlos de nuevo.
              Cada código funciona una sola vez.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-5 font-mono text-[13px] text-carbon">
              {backupCodes.map((c, i) => (
                <div
                  key={i}
                  className="border border-smoke bg-stone/20 px-3 py-2 tracking-[0.1em] select-all text-center"
                >
                  {c}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={downloadBackupCodes}
                className="inline-flex items-center justify-center gap-2 w-full py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors"
              >
                <Download size={12} /> Descargar .txt
              </button>
              <button
                onClick={() => {
                  setModal(null);
                  setBackupCodes(null);
                  void loadStatus();
                }}
                className="w-full py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
              >
                Ya los guardé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable modal */}
      {modal === "disable" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-carbon bg-paper p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-lg text-carbon">Desactivar verificación</h3>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setDisableCode("");
                }}
                className="p-1 hover:bg-stone/20 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon mb-4">
                {error}
              </div>
            )}

            <p className="caption text-[13px] text-graphite mb-4">
              Para desactivar, ingresa el código actual de tu app:
            </p>

            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              maxLength={6}
              className="w-full border border-smoke px-4 py-3 caption text-[16px] text-center text-carbon outline-none tracking-[0.2em] font-mono mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setDisableCode("");
                }}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisableTotp}
                disabled={disableCode.length !== 6 || disabling}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
              >
                {disabling ? "Desactivando..." : "Desactivar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
