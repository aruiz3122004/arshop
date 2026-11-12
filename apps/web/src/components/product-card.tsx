"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import clsx from "clsx";
import { type Product } from "@/lib/catalog";
import { useCurrency } from "@/lib/currency";
import { toCartItem, useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useDismiss } from "@/lib/use-dismiss";
import { SmartImage } from "./smart-image";
import { useRouter } from "next/navigation";

export function ProductCard({ product }: { product: Product }) {
  const primary = product.images[0];
  const secondary = product.images[1];
  const [swapArmed, setSwapArmed] = useState(false);
  const [added, setAdded] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const { add } = useCart();
  const { user } = useAuth();
  const { fmt } = useCurrency();
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);
  useDismiss(popoverRef, showSizes, () => setShowSizes(false));
  const prefetchedRef = useRef(false);

  const prefetchHero = () => {
    if (prefetchedRef.current || typeof document === "undefined") return;
    prefetchedRef.current = true;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = primary;
    document.head.appendChild(link);
  };

  const sizes =
    product.sizes && product.sizes.length > 0 ? product.sizes : ["Única"];

  const handleAdd = (size: string) => {
    add(
      toCartItem(product, {
        size,
        color: product.colors[0]?.name ?? "",
      }),
    );
    setShowSizes(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const onCartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/cuenta?next=${encodeURIComponent(`/product/${product.slug}`)}`);
      return;
    }
    if (sizes.length > 1) {
      setShowSizes((v) => !v);
    } else {
      handleAdd(sizes[0]);
    }
  };

  return (
    <div
      className="group relative flex flex-col"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          setSwapArmed(true);
          prefetchHero();
        }
      }}
      onTouchStart={prefetchHero}
    >
      {/* ───── Imagen con enlace al producto ───── */}
      <Link
        href={`/product/${product.slug}`}
        className="relative aspect-[3/4] w-full overflow-hidden bg-stone block"
        aria-label={`Ver ${product.name}`}
      >
        {/* Imagen principal */}
        <SmartImage
          src={primary}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-opacity duration-500 group-hover:opacity-0"
        />
        {/* Imagen secundaria: sólo se monta tras el primer hover */}
        {swapArmed && secondary && (
          <SmartImage
            src={secondary}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <span className="absolute top-2.5 left-2.5 z-10 bg-carbon px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-paper">
            -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}%
          </span>
        )}
      </Link>

      {/* ───── Detalles del producto + botón de carrito ───── */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <Link
          href={`/product/${product.slug}`}
          className="flex flex-col gap-1 min-w-0 flex-1 transition-opacity hover:opacity-75"
        >
          <p className="caption uppercase tracking-wider text-graphite truncate">
            {product.brand}
          </p>
          <p className="text-[15px] leading-tight text-carbon">
            {product.name}
          </p>
          <div className="flex items-center gap-2">
            <p className="caption text-carbon font-medium">
              {fmt(product.price)}
            </p>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <p className="caption text-graphite line-through text-[12px]">
                {fmt(product.compareAtPrice)}
              </p>
            )}
          </div>
        </Link>

        {/* ───── Botón de carrito de compra ───── */}
        <div ref={popoverRef} className="relative shrink-0 pt-0.5">
          <button
            type="button"
            onClick={onCartClick}
            aria-label={
              added
                ? `Añadido ${product.name} al carrito`
                : `Añadir ${product.name} al carrito`
            }
            className={clsx(
              "flex h-[36px] w-[36px] sm:h-[38px] sm:w-[38px] items-center justify-center border transition-all duration-200",
              added
                ? "border-carbon bg-carbon text-paper"
                : "border-smoke text-carbon bg-paper hover:border-carbon hover:bg-stone/60",
            )}
            title="Añadir al carrito"
          >
            {added ? (
              <Check size={16} strokeWidth={2} />
            ) : (
              <ShoppingCart size={16} strokeWidth={1.5} />
            )}
          </button>

          {/* Quick-select de talla si hay más de una */}
          {showSizes && (
            <div
              className="absolute bottom-[calc(100%+6px)] right-0 z-30 min-w-[150px] border border-smoke bg-paper p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="caption uppercase tracking-[0.12em] text-graphite text-[11px] mb-2 font-medium">
                Selecciona talla
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleAdd(s)}
                    className="border border-smoke px-2.5 py-1 text-[12px] text-carbon transition-colors hover:border-carbon hover:bg-carbon hover:text-paper"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
