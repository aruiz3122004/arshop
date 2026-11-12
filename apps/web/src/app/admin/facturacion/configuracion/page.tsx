"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import {
  apiAdminCreateNumbering,
  apiAdminGetInvoicingSettings,
  apiAdminListNumbering,
  apiAdminTestInvoicing,
  apiAdminUpdateInvoicingSettings,
  apiAdminUpdateNumbering,
  type FiscalSettings,
  type FiscalSettingsInput,
  type InvoiceEnvironment,
  type InvoiceNumberingRange,
  type InvoiceProviderId,
} from "@/lib/api";
import {
  INVOICE_ENVIRONMENT_LABEL,
  INVOICE_PROVIDER_LABEL,
  formatInvoiceDate,
} from "@/lib/invoicing-display";

const PROVIDERS: InvoiceProviderId[] = [
  "DIAN_SIMULATED",
  "DIAN_FREE",
  "DIAN_OWN",
  "FACTUS",
];

const PROVIDER_HELP: Record<InvoiceProviderId, string> = {
  DIAN_SIMULATED:
    "Genera XML UBL 2.1, CUFE y QR localmente y simula la aceptación. Ideal para el portafolio. Solo habilitación.",
  DIAN_FREE:
    "Genera el XML y permite registrar manualmente el CUFE aceptado en el portal de facturación gratuita de la DIAN. Costo $0.",
  DIAN_OWN:
    "Requiere certificado .p12 y software propio registrado. El adaptador de transmisión aún no está instalado.",
  FACTUS:
    "Proveedor externo con sandbox gratuito. Requiere API key y configuración adicional.",
};

export default function AdminInvoicingSettingsPage() {
  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [ranges, setRanges] = useState<InvoiceNumberingRange[]>([]);
  const [form, setForm] = useState<FiscalSettingsInput>({});
  const [responsibilities, setResponsibilities] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSaving, setRangeSaving] = useState(false);

  const load = async () => {
    try {
      const [cfg, list] = await Promise.all([
        apiAdminGetInvoicingSettings(),
        apiAdminListNumbering(),
      ]);
      setSettings(cfg);
      setRanges(list);
      setForm({
        legalName: cfg.legal_name,
        tradeName: cfg.trade_name,
        nit: cfg.nit,
        dv: cfg.dv,
        taxRegime: cfg.tax_regime,
        address: cfg.address,
        municipalityCode: cfg.municipality_code,
        municipality: cfg.municipality,
        department: cfg.department,
        email: cfg.email,
        phone: cfg.phone,
        softwareId: cfg.software_id ?? "",
        invoiceProvider: cfg.invoice_provider,
        environment: cfg.environment,
        enabled: cfg.enabled,
        demoMode: cfg.demo_mode,
      });
      setResponsibilities(cfg.fiscal_responsibilities.join(", "));
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof FiscalSettingsInput>(
    key: K,
    value: FiscalSettingsInput[K],
  ) => {
    setForm((cur) => ({ ...cur, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiAdminUpdateInvoicingSettings({
        ...form,
        fiscalResponsibilities: responsibilities
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await apiAdminTestInvoicing();
      setTestResult({ ok: result.ok, message: result.message });
      await load();
    } catch (err: any) {
      setError(err?.message || "La prueba de conexión falló.");
    } finally {
      setTesting(false);
    }
  };

  const toggleRange = async (range: InvoiceNumberingRange) => {
    try {
      const updated = await apiAdminUpdateNumbering(range.id, {
        active: !range.active,
      });
      setRanges((cur) =>
        cur.map((r) => (r.id === updated.id ? updated : r)),
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el rango.");
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/facturacion"
            className="inline-flex items-center gap-1 caption text-[10.5px] uppercase tracking-wider text-graphite hover:text-carbon"
          >
            <ArrowLeft size={11} /> Facturación
          </Link>
          <h2 className="mt-1 font-serif text-xl text-carbon">
            Configuración fiscal
          </h2>
          <p className="caption text-[12px] text-graphite">
            Datos del emisor, proveedor de facturación y numeración.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-3 py-2 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          Guardar cambios
        </button>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-3 py-2.5 caption text-[12px] text-red-800">
          {error}
        </div>
      )}
      {saved && (
        <div className="border border-green-300 bg-green-50 px-3 py-2.5 caption text-[12px] text-green-800">
          Configuración guardada.
        </div>
      )}

      <section className="border border-smoke">
        <div className="border-b border-smoke bg-stone/30 px-3 py-2">
          <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
            Datos del emisor
          </h3>
        </div>
        <div className="grid gap-3 px-3 py-3 sm:grid-cols-2">
          <Input
            label="Razón social"
            value={form.legalName ?? ""}
            onChange={(v) => set("legalName", v)}
          />
          <Input
            label="Nombre comercial"
            value={form.tradeName ?? ""}
            onChange={(v) => set("tradeName", v)}
          />
          <Input
            label="NIT (sin DV)"
            value={form.nit ?? ""}
            onChange={(v) => set("nit", v)}
          />
          <Input
            label="Dígito de verificación"
            value={form.dv ?? ""}
            onChange={(v) => set("dv", v)}
          />
          <Input
            label="Régimen tributario"
            value={form.taxRegime ?? ""}
            onChange={(v) => set("taxRegime", v)}
          />
          <Input
            label="Responsabilidades fiscales"
            value={responsibilities}
            onChange={(v) => {
              setResponsibilities(v);
              setSaved(false);
            }}
            placeholder="O-48, O-13"
          />
          <Input
            label="Dirección"
            value={form.address ?? ""}
            onChange={(v) => set("address", v)}
          />
          <Input
            label="Código municipio (DANE)"
            value={form.municipalityCode ?? ""}
            onChange={(v) => set("municipalityCode", v)}
          />
          <Input
            label="Municipio"
            value={form.municipality ?? ""}
            onChange={(v) => set("municipality", v)}
          />
          <Input
            label="Departamento"
            value={form.department ?? ""}
            onChange={(v) => set("department", v)}
          />
          <Input
            label="Correo de facturación"
            value={form.email ?? ""}
            onChange={(v) => set("email", v)}
          />
          <Input
            label="Teléfono"
            value={form.phone ?? ""}
            onChange={(v) => set("phone", v)}
          />
          <Input
            label="Software ID (DIAN)"
            value={form.softwareId ?? ""}
            onChange={(v) => set("softwareId", v)}
          />
        </div>
      </section>

      <section className="border border-smoke">
        <div className="border-b border-smoke bg-stone/30 px-3 py-2">
          <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
            Proveedor y ambiente
          </h3>
        </div>
        <div className="flex flex-col gap-3 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="caption uppercase tracking-wider text-[10px] text-graphite">
                Proveedor
              </span>
              <select
                value={form.invoiceProvider ?? "DIAN_SIMULATED"}
                onChange={(e) =>
                  set("invoiceProvider", e.target.value as InvoiceProviderId)
                }
                className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {INVOICE_PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="caption uppercase tracking-wider text-[10px] text-graphite">
                Ambiente
              </span>
              <select
                value={form.environment ?? "HABILITACION"}
                onChange={(e) =>
                  set("environment", e.target.value as InvoiceEnvironment)
                }
                className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
              >
                {(["HABILITACION", "PRODUCCION"] as InvoiceEnvironment[]).map(
                  (e) => (
                    <option key={e} value={e}>
                      {INVOICE_ENVIRONMENT_LABEL[e]}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <p className="caption text-[11px] leading-relaxed text-graphite">
            {form.invoiceProvider
              ? PROVIDER_HELP[form.invoiceProvider]
              : PROVIDER_HELP.DIAN_SIMULATED}
          </p>

          <div className="flex flex-wrap gap-4">
            <Toggle
              label="Facturación activa"
              checked={Boolean(form.enabled)}
              onChange={(v) => set("enabled", v)}
            />
            <Toggle
              label="Modo demostración"
              checked={Boolean(form.demoMode)}
              onChange={(v) => set("demoMode", v)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-smoke pt-3">
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[10.5px] uppercase tracking-wider text-carbon hover:border-carbon disabled:opacity-40"
            >
              {testing ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ShieldCheck size={11} />
              )}
              Probar configuración
            </button>
            {settings?.last_test_at && (
              <span className="caption text-[10px] text-graphite">
                Última prueba: {formatInvoiceDate(settings.last_test_at)}{" "}
                {settings.last_test_ok ? "✓" : "✗"}
              </span>
            )}
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 border px-2.5 py-2 ${
                testResult.ok
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              ) : (
                <XCircle size={14} className="mt-0.5 shrink-0" />
              )}
              <p className="caption text-[11px] leading-relaxed">
                {testResult.message}
              </p>
            </div>
          )}

          <p className="caption text-[10.5px] leading-relaxed text-graphite">
            En modo demostración no se transmiten documentos ni se usan datos
            fiscales reales. Para producción se requiere software propio
            registrado, certificado digital y numeración autorizada por la DIAN.
          </p>
        </div>
      </section>

      <section className="border border-smoke">
        <div className="flex items-center justify-between border-b border-smoke bg-stone/30 px-3 py-2">
          <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
            Rangos de numeración
          </h3>
          <button
            type="button"
            onClick={() => setRangeOpen(true)}
            className="inline-flex items-center gap-1 border border-smoke bg-paper px-2.5 py-1 caption text-[10px] uppercase tracking-wider text-carbon hover:border-carbon"
          >
            <Plus size={11} /> Nuevo rango
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-smoke">
              <tr className="caption uppercase tracking-wider text-[9.5px] text-graphite">
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Prefijo</th>
                <th className="px-3 py-2">Rango</th>
                <th className="px-3 py-2">Siguiente</th>
                <th className="px-3 py-2">Vigencia</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {ranges.map((range) => (
                <tr
                  key={range.id}
                  className="border-b border-smoke/60 caption text-[11.5px] text-carbon last:border-b-0"
                >
                  <td className="px-3 py-2">{range.document_type}</td>
                  <td className="px-3 py-2 font-mono">{range.prefix}</td>
                  <td className="px-3 py-2 font-mono text-[10.5px]">
                    {range.range_from} – {range.range_to}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10.5px]">
                    {Math.max(range.current_number + 1, range.range_from)}
                  </td>
                  <td className="px-3 py-2 text-[10.5px] text-graphite">
                    {range.valid_from ?? "—"} → {range.valid_to ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider border ${
                        range.active
                          ? "border-carbon text-carbon"
                          : "border-smoke text-graphite"
                      }`}
                    >
                      {range.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleRange(range)}
                      className="caption text-[10px] uppercase tracking-wider text-carbon underline underline-offset-2"
                    >
                      {range.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
              {ranges.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center caption text-[11px] text-graphite"
                  >
                    No hay rangos configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {rangeOpen && (
        <NewRangeModal
          saving={rangeSaving}
          onClose={() => setRangeOpen(false)}
          onSubmit={async (dto) => {
            setRangeSaving(true);
            setError(null);
            try {
              const created = await apiAdminCreateNumbering(dto);
              setRanges((cur) => [...cur, created]);
              setRangeOpen(false);
            } catch (err: any) {
              setError(err?.message || "No se pudo crear el rango.");
            } finally {
              setRangeSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="caption uppercase tracking-wider text-[10px] text-graphite">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon focus:border-carbon"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-carbon"
      />
      <span className="caption text-[11.5px] text-carbon">{label}</span>
    </label>
  );
}

function NewRangeModal({
  saving,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: (dto: {
    documentType: "FV" | "NC" | "ND" | "POS";
    prefix: string;
    resolutionNumber?: string;
    resolutionDate?: string;
    rangeFrom: number;
    rangeTo: number;
    validFrom?: string;
    validTo?: string;
    technicalKey?: string;
  }) => void;
}) {
  const [documentType, setDocumentType] = useState<"FV" | "NC" | "ND" | "POS">(
    "FV",
  );
  const [prefix, setPrefix] = useState("");
  const [resolutionNumber, setResolutionNumber] = useState("");
  const [resolutionDate, setResolutionDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [technicalKey, setTechnicalKey] = useState("");

  const valid =
    prefix.trim() &&
    Number(rangeFrom) > 0 &&
    Number(rangeTo) >= Number(rangeFrom);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-carbon bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-smoke pb-2.5">
          <h3 className="font-serif text-lg text-carbon">Nuevo rango</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-graphite hover:text-carbon"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="caption uppercase tracking-wider text-[10px] text-graphite">
                Tipo
              </span>
              <select
                value={documentType}
                onChange={(e) =>
                  setDocumentType(e.target.value as "FV" | "NC" | "ND" | "POS")
                }
                className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
              >
                <option value="FV">Factura (FV)</option>
                <option value="NC">Nota crédito (NC)</option>
                <option value="ND">Nota débito (ND)</option>
                <option value="POS">POS</option>
              </select>
            </label>
            <Input label="Prefijo" value={prefix} onChange={setPrefix} />
            <Input
              label="Desde"
              value={rangeFrom}
              onChange={setRangeFrom}
              placeholder="990000000"
            />
            <Input
              label="Hasta"
              value={rangeTo}
              onChange={setRangeTo}
              placeholder="990999999"
            />
            <Input
              label="Resolución"
              value={resolutionNumber}
              onChange={setResolutionNumber}
            />
            <Input
              label="Fecha resolución"
              value={resolutionDate}
              onChange={setResolutionDate}
              placeholder="2025-01-15"
            />
            <Input
              label="Vigente desde"
              value={validFrom}
              onChange={setValidFrom}
              placeholder="2025-01-15"
            />
            <Input
              label="Vigente hasta"
              value={validTo}
              onChange={setValidTo}
              placeholder="2027-01-15"
            />
          </div>
          <Input
            label="Clave técnica"
            value={technicalKey}
            onChange={setTechnicalKey}
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={saving || !valid}
              onClick={() =>
                onSubmit({
                  documentType,
                  prefix: prefix.trim(),
                  resolutionNumber: resolutionNumber.trim() || undefined,
                  resolutionDate: resolutionDate.trim() || undefined,
                  rangeFrom: Number(rangeFrom),
                  rangeTo: Number(rangeTo),
                  validFrom: validFrom.trim() || undefined,
                  validTo: validTo.trim() || undefined,
                  technicalKey: technicalKey.trim() || undefined,
                })
              }
              className="flex-1 bg-carbon py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              {saving ? "Creando..." : "Crear rango"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-smoke px-4 py-2.5 caption text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
