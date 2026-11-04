"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import {
  apiAdminIssueInvoice,
  apiAdminListInvoices,
  apiAdminListIssuableOrders,
  type InvoiceStatus,
  type InvoicingListResponse,
  type IssuableOrder,
} from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import {
  INVOICE_ENVIRONMENT_LABEL,
  INVOICE_PROVIDER_LABEL,
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  formatInvoiceDate,
  shortCufe,
} from "@/lib/invoicing-display";

type StatusFilter = "ALL" | InvoiceStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "ISSUED", label: "Emitidas" },
  { value: "PENDING_MANUAL", label: "Radicación manual" },
  { value: "PENDING", label: "Pendientes" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "FAILED", label: "Fallidas" },
  { value: "VOID", label: "Anuladas" },
];

export default function AdminInvoicingPage() {
  const [data, setData] = useState<InvoicingListResponse | null>(null);
  const [issuable, setIssuable] = useState<IssuableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, pending] = await Promise.all([
        apiAdminListInvoices({ status, q: searchTerm || undefined }),
        apiAdminListIssuableOrders(),
      ]);
      setData(list);
      setIssuable(pending);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la facturación.");
    } finally {
      setLoading(false);
    }
  }, [status, searchTerm]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const issue = async (order: IssuableOrder) => {
    const ok = window.confirm(
      `¿Emitir factura electrónica para el pedido #${order.id.slice(0, 8)} por ${formatPrice(
        order.total_cop,
      )}?`,
    );
    if (!ok) return;
    setBusyId(order.id);
    setError(null);
    try {
      await apiAdminIssueInvoice(order.id);
      await load();
    } catch (err: any) {
      setError(err?.message || "No se pudo emitir la factura.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  const stats = data?.stats;
  const fiscal = data?.fiscal;
  const invoices = data?.invoices ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-xl text-carbon">
            Facturación electrónica
          </h2>
          <p className="caption text-[12px] text-graphite mt-0.5">
            Documentos UBL 2.1, CUFE, numeración y notas crédito.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          <Link
            href="/admin/facturacion/configuracion"
            className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85"
          >
            <Settings2 size={12} /> Configuración
          </Link>
        </div>
      </div>

      {fiscal?.demoMode && (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-amber-800" />
          <p className="caption text-[11.5px] leading-relaxed text-amber-900">
            <strong>Modo demostración.</strong> Los documentos se generan y se
            marcan como aceptados de forma simulada; no se transmiten a la DIAN
            ni usan datos fiscales reales. Proveedor:{" "}
            {fiscal ? INVOICE_PROVIDER_LABEL[fiscal.provider] : "—"} · Ambiente:{" "}
            {fiscal ? INVOICE_ENVIRONMENT_LABEL[fiscal.environment] : "—"}.
          </p>
        </div>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 px-3 py-2.5 caption text-[12px] text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Emitidas" value={String(stats?.issued ?? 0)} />
        <StatCard
          label="Pendientes / manuales"
          value={String((stats?.pending ?? 0) + (stats?.pendingManual ?? 0))}
        />
        <StatCard
          label="Con error"
          value={String((stats?.rejected ?? 0) + (stats?.failed ?? 0))}
        />
        <StatCard
          label="Facturado"
          value={formatPrice(stats?.totalIssuedCop ?? 0)}
        />
      </div>

      {issuable.length > 0 && (
        <section className="border border-smoke">
          <div className="flex items-center justify-between border-b border-smoke bg-stone/30 px-3 py-2">
            <h3 className="caption uppercase tracking-[0.12em] text-[11px] text-carbon">
              Órdenes por facturar ({issuable.length})
            </h3>
            <span className="caption text-[10px] text-graphite">
              Pedidos pagados sin factura emitida
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-smoke">
                <tr className="caption uppercase tracking-wider text-[10px] text-graphite">
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Adquiriente</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {issuable.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-smoke/60 caption text-[12px] text-carbon last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {order.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-graphite">
                      {formatInvoiceDate(order.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      {order.billing_legal_name ?? "Consumidor final"}
                      {order.billing_document_number ? (
                        <span className="ml-1 text-graphite">
                          · {order.billing_document_number}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {formatPrice(order.total_cop)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-graphite">
                      {order.status}
                      {order.invoice ? ` · ${order.invoice.status}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => issue(order)}
                        disabled={busyId === order.id}
                        className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-40"
                      >
                        {busyId === order.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <>
                            <Receipt size={11} />
                            {order.invoice ? "Reintentar" : "Emitir factura"}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={`whitespace-nowrap border-b-2 px-2.5 py-1.5 caption uppercase tracking-[0.1em] text-[10px] transition-colors ${
                  status === f.value
                    ? "border-carbon text-carbon"
                    : "border-transparent text-graphite hover:text-carbon"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchTerm(query.trim());
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-graphite"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Número, CUFE, NIT..."
                className="border border-smoke bg-paper pl-7 pr-2 py-1.5 caption text-[11.5px] text-carbon focus:border-carbon w-56"
              />
            </div>
            <button
              type="submit"
              className="border border-smoke bg-paper px-2.5 py-1.5 caption text-[10.5px] uppercase tracking-wider text-carbon hover:border-carbon"
            >
              Buscar
            </button>
          </form>
        </div>

        <div className="overflow-x-auto border border-smoke">
          <table className="min-w-full text-left">
            <thead className="bg-stone/30 border-b border-smoke">
              <tr className="caption uppercase tracking-wider text-[10px] text-graphite">
                <th className="px-3 py-2.5">Número</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Adquiriente</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">CUFE</th>
                <th className="px-3 py-2.5 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-smoke/60 caption text-[12.5px] text-carbon last:border-b-0 hover:bg-stone/10"
                >
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    <Link
                      href={`/admin/facturacion/${invoice.id}`}
                      className="underline underline-offset-2"
                    >
                      {invoice.full_number ?? "Sin número"}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-graphite">
                    {formatInvoiceDate(invoice.issue_date)}
                  </td>
                  <td className="px-3 py-2.5">
                    {invoice.order?.billing_legal_name ?? "Consumidor final"}
                    <span className="block text-[10.5px] text-graphite">
                      {invoice.order?.billing_document_number ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {formatPrice(invoice.total_cop)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider border ${
                        INVOICE_STATUS_CLASS[invoice.status]
                      }`}
                    >
                      {INVOICE_STATUS_LABEL[invoice.status]}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 font-mono text-[10.5px] text-graphite"
                    title={invoice.cufe ?? undefined}
                  >
                    {shortCufe(invoice.cufe)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/facturacion/${invoice.id}`}
                      className="inline-flex items-center gap-1 caption text-[10.5px] uppercase tracking-wider text-carbon underline underline-offset-2"
                    >
                      Ver <ArrowUpRight size={11} />
                    </Link>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center caption text-graphite"
                  >
                    <FileText className="mx-auto mb-2 h-5 w-5 text-graphite" />
                    No hay facturas con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-smoke bg-paper px-3 py-2.5">
      <p className="caption uppercase tracking-[0.12em] text-[9.5px] text-graphite">
        {label}
      </p>
      <p className="mt-1 font-serif text-lg text-carbon leading-none">{value}</p>
    </div>
  );
}
