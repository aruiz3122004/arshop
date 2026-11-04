"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import clsx from "clsx";
import { Check, ChevronDown, X } from "lucide-react";
import {
  PRICE_RANGES,
  SORT_OPTIONS,
  activeCount,
  parseFilters,
  type SortKey,
} from "@/lib/filters";
import { useDismiss } from "@/lib/use-dismiss";

interface Props {
  availableSizes: string[];
  totalCount: number;
  shownCount: number;
}

export function FilterBar({ availableSizes, totalCount, shownCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [openDropdown, setOpenDropdown] = useState<"size" | "price" | "sort" | null>(null);

  const toggleDropdown = (key: "size" | "price" | "sort") => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  const closeDropdown = () => setOpenDropdown(null);

  const current = useMemo(
    () =>
      parseFilters({
        size: sp.get("size") ?? undefined,
        price: sp.get("price") ?? undefined,
        sort: sp.get("sort") ?? undefined,
      }),
    [sp],
  );

  const update = (patch: {
    sizes?: string[];
    price?: string | null;
    sort?: SortKey;
  }) => {
    const next = new URLSearchParams(sp.toString());
    if ("sizes" in patch) {
      if (patch.sizes && patch.sizes.length) next.set("size", patch.sizes.join(","));
      else next.delete("size");
    }
    if ("price" in patch) {
      if (patch.price) next.set("price", patch.price);
      else next.delete("price");
    }
    if ("sort" in patch) {
      if (patch.sort && patch.sort !== "newest") next.set("sort", patch.sort);
      else next.delete("sort");
    }
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const toggleSize = (s: string) => {
    const set = new Set(current.sizes);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    update({ sizes: [...set] });
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    const q = sp.get("q");
    if (q) next.set("q", q);
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const totalActive = activeCount(current);
  const activePrice = PRICE_RANGES.find((r) => r.slug === current.priceSlug);
  const activeSort = SORT_OPTIONS.find((s) => s.key === current.sort);

  return (
    <div className="relative z-20 flex flex-col gap-3 border-b border-smoke pb-4">
      {/* ───── Barra principal en una sola fila limpia y alineada ───── */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-2 sm:gap-3">
        {/* Filtros horizontales: sin clipping de overflow para que los dropdowns salgan de la sección */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Talla */}
          <Dropdown
            label="Talla"
            count={current.sizes.length}
            isOpen={openDropdown === "size"}
            onToggle={() => toggleDropdown("size")}
            onClose={closeDropdown}
            align="left"
          >
            {availableSizes.length === 0 ? (
              <p className="caption text-graphite px-1 py-2">
                Sin tallas disponibles
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 min-w-[200px]">
                {availableSizes.map((s) => {
                  const active = current.sizes
                    .map((x) => x.toUpperCase())
                    .includes(s.toUpperCase());
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSize(s)}
                      aria-pressed={active}
                      className={clsx(
                        "border px-2 py-1.5 caption text-center transition-colors",
                        active
                          ? "border-carbon text-carbon font-medium bg-stone/40"
                          : "border-smoke text-carbon hover:border-ash",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </Dropdown>

          {/* Precio */}
          <Dropdown
            label="Precio"
            count={current.priceSlug ? 1 : 0}
            isOpen={openDropdown === "price"}
            onToggle={() => toggleDropdown("price")}
            onClose={closeDropdown}
            align="left"
          >
            <ul className="flex flex-col min-w-[200px]">
              {PRICE_RANGES.map((r) => {
                const active = current.priceSlug === r.slug;
                return (
                  <li key={r.slug}>
                    <button
                      type="button"
                      onClick={() => {
                        update({ price: active ? null : r.slug });
                        closeDropdown();
                      }}
                      aria-pressed={active}
                      className={clsx(
                        "flex w-full items-center justify-between py-2 caption text-left transition-colors",
                        active
                          ? "text-carbon font-medium"
                          : "text-graphite hover:text-carbon",
                      )}
                    >
                      <span>{r.label}</span>
                      {active && <Check size={13} strokeWidth={1.5} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Dropdown>

          {/* Orden */}
          <Dropdown
            label="Ordenar"
            count={current.sort !== "newest" ? 1 : 0}
            isOpen={openDropdown === "sort"}
            onToggle={() => toggleDropdown("sort")}
            onClose={closeDropdown}
            align="left"
          >
            <ul className="flex flex-col min-w-[180px]">
              {SORT_OPTIONS.map((o) => {
                const active = current.sort === o.key;
                return (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => {
                        update({ sort: o.key });
                        closeDropdown();
                      }}
                      aria-pressed={active}
                      className={clsx(
                        "flex w-full items-center justify-between py-2 caption text-left transition-colors",
                        active
                          ? "text-carbon font-medium"
                          : "text-graphite hover:text-carbon",
                      )}
                    >
                      <span>{o.label}</span>
                      {active && <Check size={13} strokeWidth={1.5} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Dropdown>
        </div>

        {/* Contador alineado a la derecha en la misma línea */}
        <p className="caption text-graphite text-[12px] sm:text-[13px] shrink-0 whitespace-nowrap pl-1 sm:pl-2">
          {shownCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? "pieza" : "piezas"}`
            : `${shownCount} de ${totalCount} piezas`}
        </p>
      </div>

      {/* ───── Chips de filtros activos ───── */}
      {totalActive > 0 && (
        <ul className="flex flex-wrap items-center gap-2 pt-1">
          {current.sizes.map((s) => (
            <li key={`size-${s}`}>
              <FilterChip
                label={`Talla ${s}`}
                onRemove={() => toggleSize(s)}
              />
            </li>
          ))}
          {activePrice && (
            <li>
              <FilterChip
                label={activePrice.label}
                onRemove={() => update({ price: null })}
              />
            </li>
          )}
          {current.sort !== "newest" && activeSort && (
            <li>
              <FilterChip
                label={activeSort.label}
                onRemove={() => update({ sort: "newest" })}
              />
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={clearAll}
              className="caption text-graphite underline underline-offset-4 hover:text-carbon px-2 py-1"
            >
              Limpiar todo
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Dropdown ───────────────────────── */

function Dropdown({
  label,
  count,
  isOpen,
  onToggle,
  onClose,
  children,
  align = "left",
}: {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, isOpen, onClose);

  // Ajuste reactivo para evitar que el dropdown se desborde fuera de la pantalla en móviles
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const clampToViewport = () => {
      const el = menuRef.current;
      if (!el) return;
      el.style.transform = "";
      const rect = el.getBoundingClientRect();
      const padding = 16;
      const viewportWidth = window.innerWidth;

      if (rect.right > viewportWidth - padding) {
        const shift = rect.right - (viewportWidth - padding);
        el.style.transform = `translateX(-${shift}px)`;
      } else if (rect.left < padding) {
        const shift = padding - rect.left;
        el.style.transform = `translateX(${shift}px)`;
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={clsx(
          "group flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 caption uppercase tracking-[0.1em] sm:tracking-[0.14em] text-[12px] sm:text-[13px] transition-colors whitespace-nowrap",
          count > 0 || isOpen ? "text-carbon" : "text-graphite hover:text-carbon",
        )}
      >
        <span className="relative">
          {label}
          {count > 0 && (
            <span className="ml-1 text-carbon font-medium">({count})</span>
          )}
          <span
            className={clsx(
              "absolute left-0 right-0 -bottom-1 h-px bg-carbon transition-transform duration-200 origin-center",
              isOpen || count > 0 ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
            )}
          />
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={clsx(
            "transition-transform duration-200 shrink-0",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className={clsx(
            "absolute top-[calc(100%+6px)] z-30 border border-smoke bg-paper p-4 shadow-xl max-w-[calc(100vw-32px)]",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Chip ───────────────────────── */

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex items-center gap-1.5 border border-carbon px-2.5 py-1 caption text-carbon text-[12px] transition-opacity hover:opacity-70"
    >
      <span>{label}</span>
      <X size={12} strokeWidth={1.5} />
    </button>
  );
}
