"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { SmartImage } from "./smart-image";

interface Props {
  images: string[];
  alt: string;
}

export function ProductGallery({ images, alt }: Props) {
  const [index, setIndex] = useState(0);
  const total = images.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // ───── Zoom al cursor (sólo puntero fino / mouse) ─────
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    setZoomed(true);
  };
  const onPointerLeave = () => setZoomed(false);
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !zoomed) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  const go = useCallback(
    (next: number) => setIndex(((next % total) + total) % total),
    [total],
  );
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  // Teclado: ←/→ cuando el carrusel está en viewport con foco
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const active = document.activeElement;
      const hasFocus = el.contains(active);
      if (!hasFocus) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev, next]);

  // Swipe táctil (umbral 50px, ignora si gesto vertical dominante)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) prev();
    else next();
  };

  if (total === 0) return null;

  return (
    <div ref={rootRef} className="flex flex-col gap-4" tabIndex={-1}>
      {/* ───── Vitrina principal ───── */}
      <div
        ref={stageRef}
        className={clsx(
          "group relative aspect-[3/4] w-full overflow-hidden bg-stone touch-pan-y",
          "md:cursor-zoom-in",
        )}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        role="region"
        aria-roledescription="carrusel"
        aria-label={alt}
      >
        {images.map((src, i) => (
          <div
            key={i}
            aria-hidden={i !== index}
            style={{
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
            className={clsx(
              "absolute inset-0 ease-out will-change-transform",
              "transition-[opacity,transform] duration-[400ms]",
              i === index ? "opacity-100" : "opacity-0 pointer-events-none",
              zoomed && i === index ? "scale-[1.8]" : "scale-100",
            )}
          >
            <SmartImage
              src={src}
              alt={`${alt} — vista ${i + 1} de ${total}`}
              fill
              sizes="(min-width:1024px) 50vw, 100vw"
              priority={i === 0}
              className="object-cover"
            />
          </div>
        ))}

        {/* Flechas de navegación (discretas, no invasivas y en los extremos) */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Imagen anterior"
              className={clsx(
                "absolute left-2 sm:left-3 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center bg-paper/75 hover:bg-paper text-carbon border border-smoke/60 backdrop-blur-sm transition-all duration-200 shadow-sm",
                "sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100",
                zoomed && "!opacity-0 pointer-events-none",
              )}
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Imagen siguiente"
              className={clsx(
                "absolute right-2 sm:right-3 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center bg-paper/75 hover:bg-paper text-carbon border border-smoke/60 backdrop-blur-sm transition-all duration-200 shadow-sm",
                "sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100",
                zoomed && "!opacity-0 pointer-events-none",
              )}
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </>
        )}

        {/* Contador abajo-derecha discreto */}
        {total > 1 && (
          <div
            className={clsx(
              "absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 bg-paper/80 px-2 py-0.5 text-[11px] font-mono tracking-wider text-carbon backdrop-blur-sm border border-smoke/40 transition-opacity duration-200",
              zoomed && "opacity-0",
            )}
            aria-live="polite"
          >
            {index + 1} / {total}
          </div>
        )}
      </div>

      {/* ───── Thumbnails (desktop + mobile) ───── */}
      {total > 1 && (
        <div
          className="flex gap-2 overflow-x-auto scrollbar-clean"
          role="tablist"
          aria-label="Miniaturas del producto"
        >
          {images.map((src, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Ver imagen ${i + 1}`}
                onClick={() => setIndex(i)}
                className={clsx(
                  "relative aspect-[3/4] w-[64px] shrink-0 overflow-hidden bg-stone transition-opacity duration-200",
                  active ? "opacity-100" : "opacity-70 hover:opacity-100",
                )}
              >
                <SmartImage
                  src={src}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
                <span
                  className={clsx(
                    "pointer-events-none absolute inset-x-0 bottom-0 h-px transition-colors",
                    active ? "bg-carbon" : "bg-transparent",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      )}

      {/* ───── Barras indicadoras (sólo mobile, debajo de miniaturas) ───── */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 md:hidden" aria-hidden>
          {images.map((_, i) => (
            <span
              key={i}
              className={clsx(
                "h-px transition-all duration-300",
                i === index ? "w-8 bg-carbon" : "w-4 bg-smoke",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
