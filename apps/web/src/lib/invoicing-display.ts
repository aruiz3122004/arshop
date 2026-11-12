import type {
  InvoiceEnvironment,
  InvoiceEventType,
  InvoiceProviderId,
  InvoiceStatus,
} from "./api";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: "Pendiente",
  PENDING_MANUAL: "Radicación manual",
  ISSUED: "Emitida",
  REJECTED: "Rechazada",
  FAILED: "Fallida",
  VOID: "Anulada",
};

export const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  PENDING: "border-amber-400 text-amber-800 bg-amber-50",
  PENDING_MANUAL: "border-sky-400 text-sky-800 bg-sky-50",
  ISSUED: "border-carbon bg-carbon text-paper",
  REJECTED: "border-red-400 text-red-800 bg-red-50",
  FAILED: "border-red-400 text-red-800 bg-red-50",
  VOID: "border-smoke text-graphite bg-stone/40",
};

export const INVOICE_PROVIDER_LABEL: Record<InvoiceProviderId, string> = {
  DIAN_SIMULATED: "DIAN simulada",
  DIAN_FREE: "Facturación gratuita DIAN",
  DIAN_OWN: "Software propio",
  FACTUS: "Factus",
};

export const INVOICE_ENVIRONMENT_LABEL: Record<InvoiceEnvironment, string> = {
  HABILITACION: "Habilitación",
  PRODUCCION: "Producción",
};

export const INVOICE_EVENT_LABEL: Record<InvoiceEventType, string> = {
  CREATED: "Documento generado",
  SENT: "Enviado a la DIAN",
  ACCEPTED: "Aceptado por la DIAN",
  REJECTED: "Rechazado",
  RETRY: "Reintento",
  MANUAL_MARK: "Registro manual",
  CREDIT_NOTE: "Nota crédito",
  VOID: "Anulada",
};

export function formatInvoiceDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortCufe(cufe: string | null | undefined) {
  if (!cufe) return "—";
  return `${cufe.slice(0, 10)}…${cufe.slice(-6)}`;
}
