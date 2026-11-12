"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  apiAdminCreateCreditNote,
  apiAdminDownloadInvoiceXml,
  apiAdminGetInvoice,
  apiAdminInvoiceRepresentation,
  apiAdminMarkInvoiceIssued,
  apiAdminRetryInvoice,
  type InvoiceDetail,
  type InvoiceEventType,
} from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import {
  INVOICE_ENVIRONMENT_LABEL,
  INVOICE_EVENT_LABEL,
  INVOICE_PROVIDER_LABEL,
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  formatInvoiceDate,
} from "@/lib/invoicing-display";

const EVENT_DOT: Record<InvoiceEventType, string> = {
  CREATED: "border-graphite",
  SENT: "border-sky-600",
  ACCEPTED: "border-green-700 bg-green-700",
  REJECTED: "border-red-600 bg-red-600",
  RETRY: "border-amber-500",
  MANUAL_MARK: "border-sky-600 bg-sky-600",
  CREDIT_NOTE: "border-carbon bg-carbon",
  VOID: "border-carbon bg-carbon",
};

export default function AdminInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markOpen, setMarkOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [markCufe, setMarkCufe] = useState("");
  const [markNumber, setMarkNumber] = useState("");
  const [markMessage, setMarkMessage] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await apiAdminGetInvoice(id);
      setInvoice(detail);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la factura.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<InvoiceDetail>) => {
    setBusy(key);
    setError(null);
    try {
      const updated = await fn();
      setInvoice(updated);
      return true;
    } catch (err: any) {
      setError(err?.message || "La operación falló.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const downloadXml = async () => {
    setBusy("xml");
    setError(null);
    try {
      const { filename, xml } = await apiAdminDownloadInvoiceXml(id);
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "No se pudo descargar el XML.");
    } finally {
      setBusy(null);
    }
  };

  const openRepresentation = async () => {
    setBusy("html");
    setError(null);
    try {
      const { html } = await apiAdminInvoiceRepresentation(id);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      setError(err?.message || "No se pudo abrir la representación.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="border border-smoke px-4 py-10 text-center">
        <p className="caption text-[12px] text-graphite">
          {error ?? "Factura no encontrada."}
        </p>
        <Link
          href="/admin/facturacion"
          className="mt-3 inline-flex caption text-[11px] uppercase tracking-wider text-carbon underline underline-offset-2"
        >
          Volver a facturación
        </Link>
      </div>
    );
  }

  const seller = invoice.seller_snapshot as Record<string, any>;
  const buyer = invoice.buyer_snapshot ?? {};
  const canRetry = ["FAILED", "REJECTED", "PENDING"].includes(invoice.status);
  const canMark = invoice.status === "PENDING_MANUAL";
  const canCredit = invoice.status === "ISSUED";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/facturacion"
            className="inline-flex items-center gap-1 caption text-[10.5px] uppercase tracking-wider text-graphite hover:text-carbon"
          >
            <ArrowLeft size={11} /> Facturación
          </Link>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-xl text-carbon">
              {invoice.full_number ?? "Factura sin número"}
            </h2>
            <span
              className={`inline-flex px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider border ${
                INVOICE_STATUS_CLASS[invoice.status]
              }`}
            >
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
          </div>
          <p className="caption text-[11px] text-graphite mt-0.5">
            {INVOICE_PROVIDER_LABEL[invoice.provider]} ·{" "}
            {INVOICE_ENVIRONMENT_LABEL[invoice.environment]} · Pedido{" "}
            <Link
              href="/admin/pedidos"
              className="underline underline-offset-2"
            >
              #{invoice.order_id.slice(0, 8)}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {invoice.xml_content && (
            <button
              type="button"
              onClick={downloadXml}
              disabled={busy === "xml"}
              className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-carbon hover:border-carbon disabled:opacity-40"
            >
              {busy === "xml" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Download size={11} />
              )}
              XML
            </button>
          )}
          <button
            type="button"
            onClick={openRepresentation}
            disabled={busy === "html"}
            className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-carbon hover:border-carbon disabled:opacity-40"
          >
            {busy === "html" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Printer size={11} />
            )}
            Representación
          </button>
          {invoice.public_url && (
            <a
              href={invoice.public_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-carbon hover:border-carbon"
            >
              <ExternalLink size={11} /> Enlace público
            </a>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={() => run("retry", () => apiAdminRetryInvoice(id))}
              disabled={busy === "retry"}
              className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-40"
            >
              {busy === "retry" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} />
              )}
              Reintentar
            </button>
          )}
          {canMark && (
            <button
              type="button"
              onClick={() => {
                setMarkNumber(invoice.number ? String(invoice.number) : "");
                setMarkCufe(invoice.cufe ?? "");
                setMarkOpen(true);
              }}
              className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-paper hover:bg-carbon/85"
            >
              <ShieldCheck size={11} /> Registrar aceptación
            </button>
          )}
          {canCredit && (
            <button
              type="button"
              onClick={() => {
                setCreditAmount(String(invoice.total_cop));
                setCreditReason("");
                setCreditOpen(true);
              }}
              className="inline-flex items-center gap-1.5 border border-red-300 bg-red-50 px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-red-800 hover:bg-red-100"
            >
              <Undo2 size={11} /> Nota crédito
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-3 py-2.5 caption text-[12px] text-red-800">
          {error}
        </div>
      )}

      {invoice.environment === "HABILITACION" && (
        <div className="border border-smoke bg-stone/20 px-3 py-2 caption text-[11px] text-graphite">
          Ambiente de habilitación.{" "}
          {invoice.provider === "DIAN_SIMULATED"
            ? "Documento simulado: no fue transmitido a la DIAN."
            : "Documento generado localmente para radicación manual."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Documento
              </h3>
            </div>
            <div className="grid gap-4 px-3 py-3 sm:grid-cols-2">
              <div>
                <p className="caption uppercase tracking-wider text-[9.5px] text-graphite">
                  Emisor
                </p>
                <p className="mt-1 text-[12.5px] text-carbon">
                  {seller.legal_name ?? "—"}
                </p>
                <p className="caption text-[11px] text-graphite">
                  NIT {seller.nit ?? "—"}-{seller.dv ?? "—"} ·{" "}
                  {seller.municipality ?? "—"}
                </p>
                <p className="caption text-[11px] text-graphite">
                  {seller.address ?? "—"}
                </p>
              </div>
              <div>
                <p className="caption uppercase tracking-wider text-[9.5px] text-graphite">
                  Adquiriente
                </p>
                <p className="mt-1 text-[12.5px] text-carbon">
                  {buyer.legal_name ?? "Consumidor final"}
                </p>
                <p className="caption text-[11px] text-graphite">
                  {buyer.document_type ?? "CC"} {buyer.document_number ?? "—"}
                </p>
                <p className="caption text-[11px] text-graphite">
                  {buyer.email ?? "Sin correo"} ·{" "}
                  {[buyer.municipality, buyer.department]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3 border-t border-smoke pt-3">
                <Field label="Fecha de emisión" value={formatInvoiceDate(invoice.issue_date)} />
                <Field label="Aceptación DIAN" value={formatInvoiceDate(invoice.accepted_at)} />
                <Field label="Forma de pago" value={invoice.payment_method} />
                <Field label="Moneda" value={invoice.currency} />
              </div>
              <div className="sm:col-span-2 border-t border-smoke pt-3">
                <p className="caption uppercase tracking-wider text-[9.5px] text-graphite">
                  CUFE (SHA-384)
                </p>
                <p className="mt-1 break-all font-mono text-[10.5px] leading-relaxed text-carbon">
                  {invoice.cufe ?? "Sin CUFE"}
                </p>
                {invoice.dian_status_code && (
                  <p className="mt-1 caption text-[10.5px] text-graphite">
                    Código DIAN {invoice.dian_status_code}
                    {invoice.dian_message ? ` · ${invoice.dian_message}` : ""}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Líneas
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="border-b border-smoke">
                  <tr className="caption uppercase tracking-wider text-[9.5px] text-graphite">
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Unitario</th>
                    <th className="px-3 py-2 text-right">Descuento</th>
                    <th className="px-3 py-2 text-right">IVA 19%</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-smoke/60 caption text-[11.5px] text-carbon last:border-b-0"
                    >
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPrice(line.unit_price_cop)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {line.discount_cop ? `−${formatPrice(line.discount_cop)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPrice(line.tax_cop)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPrice(line.line_total_cop)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-1 border-t border-smoke px-3 py-3">
              <TotalRow label="Base gravable" value={invoice.taxable_base_cop} />
              <TotalRow label="IVA 19% (incluido)" value={invoice.tax_cop} />
              <div className="mt-1 flex items-baseline gap-6">
                <span className="caption uppercase tracking-wider text-[10px] text-graphite">
                  Total
                </span>
                <span className="font-serif text-lg text-carbon">
                  {formatPrice(invoice.total_cop)}
                </span>
              </div>
            </div>
          </section>

          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Línea de tiempo
              </h3>
            </div>
            <ol className="flex flex-col gap-3 px-3 py-3">
              {invoice.events.map((event) => (
                <li key={event.id} className="flex gap-2.5">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full border ${
                      EVENT_DOT[event.type] ?? "border-graphite"
                    }`}
                  />
                  <div>
                    <p className="caption text-[11.5px] text-carbon">
                      {INVOICE_EVENT_LABEL[event.type] ?? event.type}
                    </p>
                    <p className="caption text-[10px] text-graphite">
                      {formatInvoiceDate(event.created_at)}
                      {event.payload?.message
                        ? ` · ${String(event.payload.message)}`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
              {invoice.events.length === 0 && (
                <li className="caption text-[11px] text-graphite">
                  Sin eventos registrados.
                </li>
              )}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Resumen
              </h3>
            </div>
            <dl className="flex flex-col gap-2 px-3 py-3">
              <Field label="Estado" value={INVOICE_STATUS_LABEL[invoice.status]} />
              <Field label="Intentos" value={String(invoice.retry_count)} />
              <Field
                label="Track DIAN"
                value={invoice.dian_track_id ?? "—"}
                mono
              />
              {invoice.last_error && (
                <div className="mt-1 border border-red-200 bg-red-50 px-2 py-1.5">
                  <p className="caption text-[10px] uppercase tracking-wider text-red-700">
                    Último error
                  </p>
                  <p className="caption text-[10.5px] text-red-800">
                    {invoice.last_error}
                  </p>
                </div>
              )}
            </dl>
          </section>

          {invoice.qr_data_url && (
            <section className="border border-smoke">
              <div className="border-b border-smoke bg-stone/30 px-3 py-2">
                <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                  QR DIAN
                </h3>
              </div>
              <div className="flex justify-center px-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={invoice.qr_data_url}
                  alt="Código QR de la factura"
                  className="h-40 w-40"
                />
              </div>
            </section>
          )}

          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Notas crédito
              </h3>
            </div>
            <div className="flex flex-col gap-2 px-3 py-3">
              {invoice.credit_notes.length === 0 && (
                <p className="caption text-[11px] text-graphite">
                  Sin notas crédito.
                </p>
              )}
              {invoice.credit_notes.map((note) => (
                <div key={note.id} className="border border-smoke px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-carbon">
                      {note.full_number ?? "—"}
                    </span>
                    <span className="font-mono text-[11px] text-carbon">
                      {formatPrice(note.amount_cop)}
                    </span>
                  </div>
                  <p className="caption text-[10.5px] text-graphite">
                    {note.reason}
                  </p>
                  <p className="caption text-[9.5px] text-graphite">
                    {formatInvoiceDate(note.issued_at)} · {note.status}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-smoke">
            <div className="border-b border-smoke bg-stone/30 px-3 py-2">
              <h3 className="caption uppercase tracking-[0.12em] text-[10.5px] text-carbon">
                Pedido
              </h3>
            </div>
            <div className="flex flex-col gap-1.5 px-3 py-3">
              <Field
                label="Referencia"
                value={`#${invoice.order_id.slice(0, 8)}`}
                mono
              />
              <Field
                label="Estado del pedido"
                value={invoice.order?.status ?? "—"}
              />
              <Field
                label="Total del pedido"
                value={formatPrice(invoice.order?.total_cop ?? invoice.total_cop)}
              />
              <Link
                href={`/admin/pedidos`}
                className="mt-1 inline-flex items-center gap-1 caption text-[10px] uppercase tracking-wider text-carbon underline underline-offset-2"
              >
                <FileText size={10} /> Ver pedidos
              </Link>
            </div>
          </section>
        </aside>
      </div>

      {markOpen && (
        <Modal title="Registrar aceptación DIAN" onClose={() => setMarkOpen(false)}>
          <p className="caption text-[11px] leading-relaxed text-graphite">
            Usa esta opción en el flujo de facturación gratuita: genera el XML,
            radícalo manualmente en el portal de la DIAN y registra aquí el CUFE
            que te devuelva el portal.
          </p>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-[10px] text-graphite">
              Número aceptado
            </span>
            <input
              type="number"
              value={markNumber}
              onChange={(e) => setMarkNumber(e.target.value)}
              className="border border-smoke bg-paper p-2 caption text-[12px] font-mono text-carbon"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-[10px] text-graphite">
              CUFE *
            </span>
            <input
              type="text"
              value={markCufe}
              onChange={(e) => setMarkCufe(e.target.value)}
              placeholder="Hex SHA-384 entregado por la DIAN"
              className="border border-smoke bg-paper p-2 caption text-[11px] font-mono text-carbon"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-[10px] text-graphite">
              Mensaje (opcional)
            </span>
            <input
              type="text"
              value={markMessage}
              onChange={(e) => setMarkMessage(e.target.value)}
              className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
            />
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={busy === "mark" || !markCufe.trim()}
              onClick={async () => {
                const ok = await run("mark", () =>
                  apiAdminMarkInvoiceIssued(id, {
                    cufe: markCufe.trim(),
                    number: markNumber ? Number(markNumber) : undefined,
                    message: markMessage.trim() || undefined,
                  }),
                );
                if (ok) setMarkOpen(false);
              }}
              className="flex-1 bg-carbon py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              {busy === "mark" ? "Guardando..." : "Marcar como emitida"}
            </button>
            <button
              type="button"
              onClick={() => setMarkOpen(false)}
              className="border border-smoke px-4 py-2.5 caption text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {creditOpen && (
        <Modal title="Emitir nota crédito" onClose={() => setCreditOpen(false)}>
          <p className="caption text-[11px] leading-relaxed text-graphite">
            Se genera una nota crédito con numeración propia. Si el monto es
            igual al total, la factura queda anulada.
          </p>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-[10px] text-graphite">
              Motivo *
            </span>
            <input
              type="text"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              placeholder="Ej. Devolución total del pedido"
              className="border border-smoke bg-paper p-2 caption text-[12px] text-carbon"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-[10px] text-graphite">
              Monto (COP)
            </span>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="border border-smoke bg-paper p-2 caption text-[12px] font-mono text-carbon"
            />
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={busy === "credit" || !creditReason.trim()}
              onClick={async () => {
                const amount = Number(creditAmount);
                const ok = await run("credit", () =>
                  apiAdminCreateCreditNote(id, {
                    reason: creditReason.trim(),
                    amountCop:
                      Number.isFinite(amount) && amount > 0
                        ? Math.round(amount)
                        : undefined,
                  }),
                );
                if (ok) setCreditOpen(false);
              }}
              className="flex-1 bg-carbon py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
            >
              {busy === "credit" ? "Emitiendo..." : "Emitir nota crédito"}
            </button>
            <button
              type="button"
              onClick={() => setCreditOpen(false)}
              className="border border-smoke px-4 py-2.5 caption text-[11px] uppercase tracking-wider text-graphite hover:text-carbon"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="caption uppercase tracking-wider text-[9.5px] text-graphite">
        {label}
      </dt>
      <dd
        className={`text-right text-[11.5px] text-carbon ${
          mono ? "font-mono break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-6 min-w-[220px]">
      <span className="caption text-[11px] text-graphite">{label}</span>
      <span className="font-mono text-[11.5px] text-carbon">
        {formatPrice(value)}
      </span>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
          <h3 className="font-serif text-lg text-carbon">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-graphite hover:text-carbon"
          >
            <X size={15} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}
