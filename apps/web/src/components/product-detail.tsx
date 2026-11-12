"use client";

import { useState } from "react";
import { Ruler, X } from "lucide-react";
import { ProductGallery } from "./product-gallery";
import { DropBadge } from "./drop-badge";
import clsx from "clsx";
import { getDefaultSizeGuide, type Product } from "@/lib/catalog";
import { useCurrency } from "@/lib/currency";
import { toCartItem, useCart } from "@/lib/cart";
import { useRouter } from "next/navigation";

const FIT_LABELS: Record<string, string> = {
  slim: "Slim Fit (Entallado)",
  regular: "Regular Fit (Clásico)",
  relaxed: "Relaxed Fit (Holgado)",
  oversize: "Oversize (Amplio)",
};

export function ProductDetail({ product }: { product: Product }) {
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [added, setAdded] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const sizeGuide = getDefaultSizeGuide(product.category, product.gender);
  const hasDiscount =
    Boolean(product.compareAtPrice) && product.compareAtPrice! > product.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100,
      )
    : 0;

  // Variante seleccionada (match por talla + color), para pintar "quedan N"
  const selectedVariantId =
    size && product.variants
      ? (product.variants.find(
          (v) => v.size === size && v.color_name === color,
        )?.id ?? null)
      : null;
  const { add } = useCart();
  const { fmt } = useCurrency();
  const router = useRouter();

  const canAdd = Boolean(size);

  const handleAdd = () => {
    if (!canAdd) return;
    add(toCartItem(product, { size: size!, color }));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuy = () => {
    if (!canAdd) return;
    add(toCartItem(product, { size: size!, color }));
    router.push("/cart");
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-8 pb-24 md:px-6">
      {/*
        grid-cols-1 explícito en mobile: sin él, un `grid` CSS sin
        grid-template-columns deja a los items dimensionarse por min-content;
        el stage `aspect-[3/4] w-full` entonces ignora el ancho del padre
        y desborda a la derecha, cortándose por el overflow-x:clip del body.
      */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
        {/* ───── Imágenes (carrusel) ───── */}
        <div className="min-w-0">
          <ProductGallery images={product.images} alt={product.name} />
        </div>

        {/* ───── Info ───── */}
        <div className="min-w-0">
          <p className="caption uppercase tracking-[0.14em] text-graphite">
            {product.brand}
          </p>
          <h1 className="font-display text-[28px] md:text-[30px] text-carbon mt-2 leading-tight">
            {product.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <p className="text-carbon text-[18px] font-medium">
              {fmt(product.price)}
            </p>
            {hasDiscount && (
              <>
                <p className="text-graphite line-through text-[15px]">
                  {fmt(product.compareAtPrice!)}
                </p>
                <span className="bg-carbon px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-paper">
                  Ahorras {discountPct}%
                </span>
              </>
            )}
          </div>
          <p className="caption text-graphite text-[11px] mt-1">
            IVA 19% incluido · Cambios y retracto hasta 5 días hábiles (Ley 1480)
          </p>

          <DropBadge slug={product.slug} selectedVariantId={selectedVariantId} />

          {/* Color */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <span className="caption uppercase tracking-[0.14em] text-carbon">
                Color
              </span>
              <span className="caption text-graphite">{color}</span>
            </div>
            <div className="mt-3 flex gap-2">
              {product.colors.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setColor(c.name)}
                  aria-pressed={color === c.name}
                  aria-label={c.name}
                  className={clsx(
                    "size-8 border transition-opacity",
                    color === c.name
                      ? "border-carbon"
                      : "border-smoke hover:border-ash",
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>

          {/* Talla */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="caption uppercase tracking-[0.14em] text-carbon">
                  Talla
                </span>
                {product.fit && (
                  <span className="border border-smoke bg-stone/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-graphite">
                    {FIT_LABELS[product.fit] ?? product.fit}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSizeGuide(true)}
                className="inline-flex items-center gap-1.5 caption text-graphite underline underline-offset-4 hover:text-carbon transition-colors"
              >
                <Ruler size={13} />
                Guía de tallas
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-6">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  aria-pressed={size === s}
                  className={clsx(
                    "border py-3 caption transition-colors",
                    size === s
                      ? "border-carbon text-carbon"
                      : "border-smoke text-carbon hover:border-ash",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-col gap-3">
            <button
              onClick={handleBuy}
              disabled={!canAdd}
              className={clsx(
                "w-full py-4 caption uppercase tracking-[0.18em] transition-colors",
                canAdd
                  ? "bg-carbon text-paper hover:bg-carbon/85"
                  : "bg-smoke text-graphite cursor-not-allowed",
              )}
            >
              Comprar ahora
            </button>
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className={clsx(
                "w-full py-4 caption uppercase tracking-[0.18em] border transition-colors",
                canAdd
                  ? "border-carbon text-carbon hover:bg-carbon hover:text-paper"
                  : "border-smoke text-graphite cursor-not-allowed",
              )}
            >
              {added ? "Añadido al carrito" : "Añadir al carrito"}
            </button>
            {!canAdd && (
              <p className="caption text-graphite">
                Selecciona una talla para continuar.
              </p>
            )}
          </div>

          {/* Descripción */}
          <div className="mt-14 border-t border-smoke pt-6">
            <h2 className="caption uppercase tracking-[0.14em] text-carbon mb-3">
              Detalles
            </h2>
            <p className="text-[15px] leading-[1.6] text-carbon">
              {product.description}
            </p>
          </div>
        </div>
      </div>

      {/* Modal Guía de tallas interactiva (G5) */}
      {showSizeGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4"
          onClick={() => setShowSizeGuide(false)}
        >
          <div
            className="w-full max-w-lg border border-smoke bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-smoke pb-4">
              <div>
                <p className="caption uppercase tracking-[0.16em] text-graphite text-[11px]">
                  Medidas de referencia · {product.gender}
                </p>
                <h2 className="font-display text-xl text-carbon mt-1">
                  Guía de tallas — {product.name}
                </h2>
                {product.fit && (
                  <p className="caption text-graphite text-[12px] mt-1">
                    Calce de esta prenda:{" "}
                    <strong className="text-carbon">
                      {FIT_LABELS[product.fit] ?? product.fit}
                    </strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSizeGuide(false)}
                aria-label="Cerrar guía de tallas"
                className="p-1 text-graphite hover:text-carbon"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-carbon text-[11px] uppercase tracking-wider text-graphite">
                    {sizeGuide.columns.map((col) => (
                      <th key={col} className="py-2.5 pr-3 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-smoke text-[13px] text-carbon">
                  {sizeGuide.rows.map((row) => (
                    <tr
                      key={row.size}
                      className={clsx(
                        "transition-colors",
                        size && row.size.startsWith(size)
                          ? "bg-stone/70 font-medium"
                          : "hover:bg-stone/30",
                      )}
                    >
                      <td className="py-2.5 pr-3 font-mono">{row.size}</td>
                      <td className="py-2.5 pr-3">{row.chestOrWaist}</td>
                      <td className="py-2.5 pr-3">{row.lengthOrHip}</td>
                      <td className="py-2.5">{row.sleeveOrInseam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 border border-smoke bg-stone/30 p-3 caption text-[12px] text-graphite">
              <strong className="text-carbon">Consejo de medición:</strong>{" "}
              {sizeGuide.tip}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSizeGuide(false)}
                className="bg-carbon px-5 py-2.5 caption text-[11px] uppercase tracking-[0.16em] text-paper hover:bg-carbon/85"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
