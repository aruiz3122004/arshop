"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, ShieldCheck, Star, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  apiCreateReview,
  apiGetReviewEligibility,
  fetchProductReviews,
  type ProductReview,
  type ProductReviewsResponse,
  type ReviewEligibility,
} from "@/lib/api";

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value.toFixed(1)} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <Star
            key={n}
            size={size}
            strokeWidth={1.5}
            className={filled ? "text-carbon" : "text-smoke"}
            fill={filled ? "currentColor" : "none"}
            aria-hidden
          />
        );
      })}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function ProductReviews({
  slug,
  initial,
}: {
  slug: string;
  initial: ProductReviewsResponse;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ProductReviewsResponse>(initial);
  const [open, setOpen] = useState(false);
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reviewable = useMemo(
    () => eligibility?.items.filter((item) => !item.reviewed) ?? [],
    [eligibility],
  );

  const openForm = async () => {
    setOpen(true);
    setError(null);
    setDone(false);
    if (!user) return;
    setLoadingEligibility(true);
    try {
      const result = await apiGetReviewEligibility(slug);
      setEligibility(result);
      const firstItem = result.items.find((item) => !item.reviewed);
      setSelectedItem(firstItem?.orderItemId ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingEligibility(false);
    }
  };

  const closeForm = () => {
    if (submitting) return;
    setOpen(false);
    setEligibility(null);
    setSelectedItem("");
    setRating(5);
    setTitle("");
    setBody("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedItem) {
      setError("Selecciona la compra que quieres reseñar.");
      return;
    }
    if (body.trim().length < 20) {
      setError("Cuéntanos un poco más: mínimo 20 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await apiCreateReview({
        orderItemId: selectedItem,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
      });
      const refreshed = await fetchProductReviews(slug);
      setData(refreshed);
      setDone(true);
      setEligibility(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo publicar la reseña.");
    } finally {
      setSubmitting(false);
    }
  };

  const { summary } = data;

  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-24 md:px-6">
      <div className="border-t border-carbon pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-[22px] text-carbon">
              Reseñas de la comunidad
            </h2>
            <p className="caption mt-1 text-[12px] text-graphite">
              Sólo clientes con compra verificada. Sin incentivos, sin filtros.
            </p>
          </div>
          <button
            type="button"
            onClick={openForm}
            className="border border-carbon bg-carbon px-5 py-2.5 caption text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-carbon/85"
          >
            Escribir una reseña
          </button>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-12">
          {/* Resumen */}
          <aside className="lg:col-span-4">
            <div className="border border-smoke p-6">
              <div className="flex items-end gap-4">
                <p className="font-serif text-[52px] leading-none text-carbon">
                  {summary.count > 0
                    ? summary.average.toFixed(1).replace(".", ",")
                    : "—"}
                </p>
                <div className="pb-1">
                  <Stars value={summary.average} size={16} />
                  <p className="caption mt-1 text-[11px] text-graphite">
                    {summary.count === 1
                      ? "1 reseña verificada"
                      : `${summary.count} reseñas verificadas`}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count =
                    summary.distribution[n as 1 | 2 | 3 | 4 | 5] ?? 0;
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <span className="caption w-3 text-right text-[11px] text-graphite">
                        {n}
                      </span>
                      <Star
                        size={11}
                        className="text-graphite"
                        aria-hidden
                      />
                      <div className="h-1.5 flex-1 bg-smoke">
                        <div
                          className="h-full bg-carbon"
                          style={{ width: `${percent(count, summary.count)}%` }}
                        />
                      </div>
                      <span className="caption w-7 text-right text-[10px] text-graphite">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex items-start gap-2 border-t border-smoke pt-4">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-carbon" />
                <p className="caption text-[11px] leading-relaxed text-graphite">
                  Cada reseña está ligada a una línea de pedido pagada. No se
                  puede reseñar dos veces la misma compra.
                </p>
              </div>
            </div>
          </aside>

          {/* Listado */}
          <div className="lg:col-span-8">
            {data.items.length === 0 ? (
              <div className="border border-smoke p-8 text-center">
                <p className="caption text-[13px] text-carbon">
                  Este producto todavía no tiene reseñas.
                </p>
                <p className="caption mt-1 text-[12px] text-graphite">
                  Si ya lo compraste, tu opinión ayuda al siguiente cliente.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {data.items.map((review, index) => (
                  <li
                    key={review.id}
                    className={`py-6 ${index === 0 ? "pt-0" : ""} ${
                      index > 0 ? "border-t border-smoke" : ""
                    }`}
                  >
                    <ReviewRow review={review} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modal de escritura */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-carbon bg-paper p-6">
            <div className="flex items-start justify-between gap-4 border-b border-smoke pb-3">
              <h3
                id="review-dialog-title"
                className="font-serif text-[20px] text-carbon"
              >
                Escribir una reseña
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="text-graphite transition-colors hover:text-carbon"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {!user ? (
              <div className="mt-6">
                <p className="caption text-[13px] leading-relaxed text-graphite">
                  Inicia sesión con la cuenta que usaste para comprar. Las
                  reseñas son anónimas para el público, pero necesitamos
                  verificar tu compra.
                </p>
                <Link
                  href={`/cuenta?next=${encodeURIComponent(`/product/${slug}`)}`}
                  className="mt-5 inline-block border border-carbon bg-carbon px-6 py-3 caption text-[11px] uppercase tracking-[0.14em] text-paper hover:bg-carbon/85"
                >
                  Iniciar sesión
                </Link>
              </div>
            ) : done ? (
              <div className="mt-8 flex flex-col items-center text-center">
                <span className="flex size-12 items-center justify-center border border-carbon">
                  <Check size={20} />
                </span>
                <p className="mt-4 font-serif text-[20px] text-carbon">
                  Reseña publicada
                </p>
                <p className="caption mt-1 text-[12px] text-graphite">
                  Gracias por ayudar a otros clientes a elegir mejor.
                </p>
                <button
                  type="button"
                  onClick={closeForm}
                  className="mt-6 border border-carbon px-6 py-2.5 caption text-[11px] uppercase tracking-[0.14em] text-carbon hover:bg-stone"
                >
                  Cerrar
                </button>
              </div>
            ) : loadingEligibility ? (
              <div className="flex items-center gap-2 py-10 text-graphite">
                <Loader2 size={16} className="animate-spin" />
                <span className="caption text-[12px]">
                  Verificando tus compras...
                </span>
              </div>
            ) : reviewable.length === 0 ? (
              <div className="mt-6">
                <p className="caption text-[13px] leading-relaxed text-graphite">
                  No encontramos una compra pagada, enviada o entregada de este
                  producto en tu cuenta. Si acabas de comprar, espera a que el
                  pago se confirme.
                </p>
                <button
                  type="button"
                  onClick={closeForm}
                  className="mt-5 border border-carbon px-6 py-2.5 caption text-[11px] uppercase tracking-[0.14em] text-carbon hover:bg-stone"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
                <label className="flex flex-col gap-1.5">
                  <span className="caption text-[11px] uppercase tracking-[0.12em] text-graphite">
                    Compra verificada
                  </span>
                  <select
                    value={selectedItem}
                    onChange={(e) => setSelectedItem(e.target.value)}
                    className="caption cursor-pointer border border-smoke bg-paper p-2.5 text-[12px] text-carbon focus:border-carbon"
                  >
                    {reviewable.map((item) => (
                      <option key={item.orderItemId} value={item.orderItemId}>
                        {item.productName} · {item.variantLabel} ·{" "}
                        {formatDate(item.purchasedAt)}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="flex flex-col gap-2">
                  <legend className="caption text-[11px] uppercase tracking-[0.12em] text-graphite">
                    Calificación
                  </legend>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
                        aria-pressed={rating === n}
                        className="p-1"
                      >
                        <Star
                          size={24}
                          strokeWidth={1.5}
                          className={
                            n <= rating ? "text-carbon" : "text-smoke"
                          }
                          fill={n <= rating ? "currentColor" : "none"}
                        />
                      </button>
                    ))}
                    <span className="caption ml-2 text-[12px] text-graphite">
                      {rating}/5
                    </span>
                  </div>
                </fieldset>

                <label className="flex flex-col gap-1.5">
                  <span className="caption text-[11px] uppercase tracking-[0.12em] text-graphite">
                    Título (opcional)
                  </span>
                  <input
                    type="text"
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. La talla queda perfecta"
                    className="caption border-b border-smoke py-1.5 text-[13px] text-carbon focus:border-carbon"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="caption text-[11px] uppercase tracking-[0.12em] text-graphite">
                    Tu reseña
                  </span>
                  <textarea
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={5}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Cuéntanos sobre la tela, el calce y cómo la usaste."
                    className="caption resize-y border border-smoke p-3 text-[13px] text-carbon focus:border-carbon"
                  />
                  <span className="caption text-right text-[10px] text-graphite">
                    {body.length}/2000
                  </span>
                </label>

                {error && (
                  <p className="caption border border-carbon/20 bg-stone/40 p-2.5 text-[12px] text-carbon">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 bg-carbon py-3.5 caption text-[11px] uppercase tracking-[0.16em] text-paper transition-colors hover:bg-carbon/85 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    "Publicar reseña verificada"
                  )}
                </button>
              </form>
            )}

            {error && !user && (
              <p className="caption mt-4 text-[12px] text-carbon">{error}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewRow({ review }: { review: ProductReview }) {
  return (
    <article>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stars value={review.rating} />
          <span className="caption text-[11px] uppercase tracking-[0.1em] text-carbon">
            {review.author_name}
          </span>
          <span className="inline-flex items-center gap-1 border border-smoke px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-graphite">
            <Check size={9} /> Compra verificada
          </span>
        </div>
        <time
          className="caption text-[10px] uppercase tracking-[0.1em] text-graphite"
          dateTime={review.created_at}
        >
          {formatDate(review.created_at)}
        </time>
      </div>
      {review.title && (
        <h3 className="mt-2 text-[14px] font-medium text-carbon">
          {review.title}
        </h3>
      )}
      <p className="caption mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-graphite">
        {review.body}
      </p>
    </article>
  );
}
