"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Star, X } from "lucide-react";
import {
  apiAdminListReviews,
  apiAdminModerateReview,
  type AdminReview,
} from "@/lib/api";

type Tab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "REJECTED", label: "Rechazadas" },
];

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "border-emerald-600 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-500 bg-amber-50 text-amber-800",
  REJECTED: "border-red-400 bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "Pendiente",
  REJECTED: "Rechazada",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          strokeWidth={1.5}
          className={n <= value ? "text-carbon" : "text-smoke"}
          fill={n <= value ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<AdminReview[]>([]);
  const [tab, setTab] = useState<Tab>("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdminListReviews({ limit: 100 });
      setRows(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    return {
      ALL: rows.length,
      PENDING: rows.filter((r) => r.status === "PENDING").length,
      APPROVED: rows.filter((r) => r.status === "APPROVED").length,
      REJECTED: rows.filter((r) => r.status === "REJECTED").length,
    } as Record<Tab, number>;
  }, [rows]);

  const visible = useMemo(
    () => (tab === "ALL" ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  const moderate = async (
    review: AdminReview,
    status: "APPROVED" | "REJECTED" | "PENDING",
  ) => {
    setBusyId(review.id);
    setError(null);
    setNotice(null);
    try {
      await apiAdminModerateReview(review.id, { status });
      setRows((prev) =>
        prev.map((r) => (r.id === review.id ? { ...r, status } : r)),
      );
      setNotice(`Reseña ${STATUS_LABEL[status].toLowerCase()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-smoke pb-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-2xl text-carbon">
            <Star size={20} /> Reseñas verificadas
          </h2>
          <p className="caption mt-1 text-[12px] text-graphite">
            Sólo se publican reseñas ligadas a una compra pagada. Puedes
            ocultar una reseña sin borrar el histórico.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="caption border border-smoke px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-carbon transition-colors hover:border-carbon disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border px-3 py-1.5 caption text-[10.5px] uppercase tracking-wider transition-colors ${
              tab === t.key
                ? "border-carbon bg-carbon text-paper"
                : "border-smoke bg-paper text-carbon hover:border-carbon"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 border border-smoke bg-stone/30 p-3 caption text-[12px] text-carbon">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-graphite">
          <Loader2 size={16} className="animate-spin" />
          <span className="caption text-[12px]">Cargando reseñas...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-smoke p-10 text-center">
          <p className="caption text-[13px] text-graphite">
            No hay reseñas en este estado.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {visible.map((review) => (
            <article key={review.id} className="border border-smoke p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="caption text-[11px] font-medium uppercase tracking-[0.1em] text-carbon">
                      {review.author_name}
                    </span>
                    <span
                      className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${
                        STATUS_STYLE[review.status] ?? "border-smoke text-graphite"
                      }`}
                    >
                      {STATUS_LABEL[review.status] ?? review.status}
                    </span>
                    <time className="caption text-[10px] text-graphite">
                      {formatDate(review.created_at)}
                    </time>
                  </div>
                  <p className="caption mt-1 text-[11px] text-graphite">
                    {review.product ? (
                      <a
                        href={`/product/${review.product.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-carbon"
                      >
                        {review.product.name}
                      </a>
                    ) : (
                      "Producto eliminado"
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {review.status !== "APPROVED" && (
                    <button
                      type="button"
                      onClick={() => void moderate(review, "APPROVED")}
                      disabled={busyId === review.id}
                      className="inline-flex items-center gap-1 border border-carbon bg-carbon px-3 py-1.5 caption text-[10px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
                    >
                      <Check size={12} /> Aprobar
                    </button>
                  )}
                  {review.status !== "REJECTED" && (
                    <button
                      type="button"
                      onClick={() => void moderate(review, "REJECTED")}
                      disabled={busyId === review.id}
                      className="inline-flex items-center gap-1 border border-smoke px-3 py-1.5 caption text-[10px] uppercase tracking-wider text-carbon hover:border-carbon disabled:opacity-50"
                    >
                      <X size={12} /> Ocultar
                    </button>
                  )}
                </div>
              </div>

              {review.title && (
                <h3 className="mt-3 text-[14px] font-medium text-carbon">
                  {review.title}
                </h3>
              )}
              <p className="caption mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-graphite">
                {review.body}
              </p>
              {review.moderation_note && (
                <p className="caption mt-2 border-t border-smoke pt-2 text-[10.5px] italic text-graphite">
                  Nota de moderación: {review.moderation_note}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
