"use client";

import Link from "next/link";
import { SmartImage } from "@/components/smart-image";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useLocation } from "@/lib/location";
import { useCurrency } from "@/lib/currency";
import { SectionTitle } from "@/components/section-title";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default function CartPage() {
  const { items, updateQty, remove, total, count } = useCart();
  const { location } = useLocation();
  const { fmt } = useCurrency();

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 pb-24">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Carrito" }]} />
      <SectionTitle>Carrito</SectionTitle>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-24">
          <p className="text-graphite">Tu carrito está vacío.</p>
          <Link
            href="/"
            className="caption uppercase tracking-[0.16em] border-b border-carbon pb-1 text-carbon hover:opacity-70"
          >
            Volver a la tienda
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
          {/* ───── Items ───── */}
          <ul className="flex flex-col divide-y divide-smoke border-t border-b border-smoke">
            {items.map((it) => (
              <li
                key={`${it.productId}-${it.size}-${it.color}`}
                className="flex flex-col gap-4 py-6 sm:flex-row sm:gap-5"
              >
                {/* Imagen: arriba en móvil (full width), al lado en >= sm */}
                <div className="relative aspect-[3/4] w-full bg-stone sm:w-28 sm:shrink-0">
                  <SmartImage
                    src={it.image}
                    alt={it.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 112px"
                    className="object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between gap-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="caption uppercase tracking-wider text-graphite truncate">
                        {it.brand}
                      </p>
                      <Link
                        href={`/product/${it.slug}`}
                        className="text-[15px] text-carbon hover:underline underline-offset-4 block"
                      >
                        {it.name}
                      </Link>
                      <p className="caption text-graphite mt-1">
                        Talla {it.size} · {it.color}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(it.productId, it.size, it.color, it.variantId)}
                      className="p-1 text-graphite hover:text-carbon shrink-0"
                      aria-label="Eliminar"
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div className="flex items-center border border-smoke">
                      <button
                        onClick={() =>
                          updateQty(
                            it.productId,
                            it.size,
                            it.color,
                            it.quantity - 1,
                            it.variantId,
                          )
                        }
                        className="p-2 text-carbon hover:bg-stone"
                        aria-label="Disminuir"
                      >
                        <Minus size={14} strokeWidth={1.5} />
                      </button>
                      <span className="caption w-8 text-center">
                        {it.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQty(
                            it.productId,
                            it.size,
                            it.color,
                            it.quantity + 1,
                            it.variantId,
                          )
                        }
                        className="p-2 text-carbon hover:bg-stone"
                        aria-label="Aumentar"
                      >
                        <Plus size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                    <p className="caption text-carbon shrink-0">
                      {fmt(it.price * it.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* ───── Resumen ───── */}
          <aside className="h-fit border-t border-b border-smoke py-6 lg:border lg:p-6">
            <h2 className="caption uppercase tracking-[0.14em] text-carbon mb-5">
              Resumen
            </h2>
            <div className="caption flex items-center justify-between py-2 text-carbon">
              <span>Artículos</span>
              <span>{count}</span>
            </div>
            <div className="caption flex items-center justify-between py-2 text-carbon">
              <span>Subtotal</span>
              <span>{fmt(total)}</span>
            </div>
            <div className="flex items-start justify-between gap-6 py-2">
              <span className="caption text-graphite">Envío a</span>
              <span className="caption text-carbon text-right">
                {location.city}
                <br />
                <span className="text-graphite">{location.department}</span>
              </span>
            </div>
            <div className="flex items-center justify-between pt-5 border-t border-smoke mt-5">
              <span className="text-[15px] text-carbon">Total</span>
              <span className="text-[15px] text-carbon">
                {fmt(total)}
              </span>
            </div>

            <Link
              href="/checkout"
              className="mt-6 block w-full py-4 text-center caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors"
            >
              Ir al checkout
            </Link>
            <Link
              href="/"
              className="caption text-graphite block text-center mt-4 hover:text-carbon"
            >
              Seguir comprando
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
