"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, X, Clock, TrendingUp } from "lucide-react";
import clsx from "clsx";
import {
  highlight,
  search,
  type CategoryHit,
  type ProductHit,
  type SearchResults,
} from "@/lib/search";
import { useGender } from "@/lib/gender";
import { useRecentSearches } from "@/lib/use-recent-searches";
import { useCurrency } from "@/lib/currency";
import { useDismiss } from "@/lib/use-dismiss";
import { SmartImage } from "./smart-image";

const TRENDING = [
  "Camisa blanca",
  "Pantalón recto",
  "Top satén",
  "Jean mom",
  "Mocasín",
  "Camiseta rib",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

type NavEntry =
  | { kind: "product"; hit: ProductHit; href: string }
  | { kind: "category"; hit: CategoryHit; href: string }
  | { kind: "query"; q: string; href: string };

export function SearchOverlay({ open, onClose }: Props) {
  const router = useRouter();
  const { gender } = useGender();
  const { fmt } = useCurrency();
  const { recent, push: pushRecent, remove: removeRecent, clear: clearRecent } =
    useRecentSearches();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, open, onClose);

  // Focus input al abrir, limpiar al cerrar
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setDebounced("");
      setCursor(-1);
    }
  }, [open]);

  // Debounce 120 ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Bloqueo del scroll de fondo mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const [results, setResults] = useState<SearchResults>({
    products: [],
    categories: [],
    total: 0,
    expansions: {},
  });

  useEffect(() => {
    if (!debounced || debounced.trim().length < 2) {
      setResults({ products: [], categories: [], total: 0, expansions: {} });
      return;
    }
    let cancelled = false;
    search(debounced)
      .then((r) => { if (!cancelled) setResults(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [debounced]);
  const hasQuery = debounced.trim().length >= 2;

  // Lista plana para navegación por teclado
  const navEntries: NavEntry[] = useMemo(() => {
    const list: NavEntry[] = [];
    for (const p of results.products) {
      list.push({
        kind: "product",
        hit: p,
        href: `/product/${p.product.slug}`,
      });
    }
    for (const c of results.categories) {
      list.push({
        kind: "category",
        hit: c,
        href: `/${c.gender}/${c.slug}`,
      });
    }
    if (hasQuery) {
      list.push({
        kind: "query",
        q: debounced,
        href: `/${gender}?q=${encodeURIComponent(debounced)}`,
      });
    }
    return list;
  }, [results, hasQuery, debounced, gender]);

  // Reset cursor al cambiar los resultados
  useEffect(() => setCursor(hasQuery && navEntries.length ? 0 : -1), [debounced, navEntries.length, hasQuery]);

  const goTo = useCallback(
    (href: string, trackQuery?: string) => {
      if (trackQuery) pushRecent(trackQuery);
      onClose();
      router.push(href);
    },
    [onClose, pushRecent, router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (navEntries.length) {
        setCursor((i) => (i + 1) % navEntries.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (navEntries.length) {
        setCursor((i) => (i - 1 + navEntries.length) % navEntries.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = navEntries[cursor] ?? navEntries[0];
      if (entry) {
        goTo(entry.href, query);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-carbon/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={clsx(
          "fixed left-0 right-0 top-0 z-50 bg-paper border-b border-smoke transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "-translate-y-full",
        )}
        role="dialog"
        aria-label="Buscador"
        aria-modal="true"
      >
        <div className="mx-auto max-w-[1280px] px-5 pt-5 pb-6 md:px-6 md:pt-6">
          {/* Input */}
          <div className="flex items-center gap-4 border-b border-ash pb-3">
            <SearchIcon size={20} strokeWidth={1.5} className="shrink-0 text-carbon" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="¿Qué estás buscando?"
              className="flex-1 py-1 text-[18px] md:text-[22px] text-carbon placeholder:text-ash"
              aria-label="Buscar"
              aria-autocomplete="list"
              aria-controls="search-results"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-graphite hover:text-carbon"
              aria-label="Cerrar"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Resultados / Estados */}
          <div
            id="search-results"
            className="mt-6 max-h-[70vh] overflow-y-auto scrollbar-clean"
          >
            {!hasQuery ? (
              <IdleState
                recent={recent}
                onPick={(q) => {
                  setQuery(q);
                }}
                onRemove={removeRecent}
                onClear={clearRecent}
              />
            ) : navEntries.length === 0 ? (
              <EmptyState query={debounced} />
            ) : (
              <>
                <ExpansionNotice expansions={results.expansions} />
                <ResultsList
                  entries={navEntries}
                  cursor={cursor}
                  setCursor={setCursor}
                  onPick={(entry) => goTo(entry.href, query)}
                  query={debounced}
                  fmt={fmt}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Idle ───────────────────────── */

function IdleState({
  recent,
  onPick,
  onRemove,
  onClear,
}: {
  recent: string[];
  onPick: (q: string) => void;
  onRemove: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-10 md:grid-cols-2">
      {recent.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="caption uppercase tracking-[0.14em] text-graphite flex items-center gap-2">
              <Clock size={13} strokeWidth={1.5} /> Buscado recientemente
            </h3>
            <button
              onClick={onClear}
              className="caption text-graphite hover:text-carbon"
            >
              Borrar
            </button>
          </div>
          <ul className="flex flex-col">
            {recent.map((q) => (
              <li
                key={q}
                className="flex items-center justify-between border-b border-smoke/70 py-2.5"
              >
                <button
                  onClick={() => onPick(q)}
                  className="text-left text-[15px] text-carbon hover:underline underline-offset-4"
                >
                  {q}
                </button>
                <button
                  onClick={() => onRemove(q)}
                  className="p-1 text-ash hover:text-carbon"
                  aria-label={`Olvidar ${q}`}
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-4 caption uppercase tracking-[0.14em] text-graphite flex items-center gap-2">
          <TrendingUp size={13} strokeWidth={1.5} /> Tendencias
        </h3>
        <div className="flex flex-wrap gap-2">
          {TRENDING.map((t) => (
            <button
              key={t}
              onClick={() => onPick(t)}
              className="caption border border-smoke px-3 py-1.5 text-carbon transition-colors hover:border-carbon"
            >
              {t}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── Empty ───────────────────────── */

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="text-[15px] text-carbon">
        No encontramos piezas para{" "}
        <span className="italic">&ldquo;{query}&rdquo;</span>.
      </p>
      <p className="caption text-graphite">
        Prueba con <em className="not-italic text-carbon">camisa</em>,{" "}
        <em className="not-italic text-carbon">pantalón recto</em>,{" "}
        <em className="not-italic text-carbon">mocasín</em> o{" "}
        <em className="not-italic text-carbon">top satén</em>.
      </p>
    </div>
  );
}

/* ───────────────────────── Lista de resultados ───────────────────────── */

function ResultsList({
  entries,
  cursor,
  setCursor,
  onPick,
  query,
  fmt,
}: {
  entries: NavEntry[];
  cursor: number;
  setCursor: (i: number) => void;
  onPick: (e: NavEntry) => void;
  query: string;
  fmt: (amount: number) => string;
}) {
  const products = entries.filter((e) => e.kind === "product") as Extract<
    NavEntry,
    { kind: "product" }
  >[];
  const categories = entries.filter((e) => e.kind === "category") as Extract<
    NavEntry,
    { kind: "category" }
  >[];
  const queryEntry = entries.find((e) => e.kind === "query") as
    | Extract<NavEntry, { kind: "query" }>
    | undefined;

  return (
    <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
      {/* Productos */}
      {products.length > 0 && (
        <section>
          <h3 className="mb-4 caption uppercase tracking-[0.14em] text-graphite">
            Productos
          </h3>
          <ul className="flex flex-col">
            {products.map((e, i) => {
              const globalIdx = entries.indexOf(e);
              const active = globalIdx === cursor;
              const p = e.hit.product;
              return (
                <li key={p.id}>
                  <Link
                    href={e.href}
                    onClick={(ev) => {
                      ev.preventDefault();
                      onPick(e);
                    }}
                    onMouseEnter={() => setCursor(globalIdx)}
                    className={clsx(
                      "group flex items-center gap-4 border-b border-smoke/70 py-3 transition-colors",
                      active ? "bg-stone/60" : "hover:bg-stone/40",
                    )}
                  >
                    <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-stone">
                      <SmartImage
                        src={p.images[0]}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="caption uppercase tracking-wider text-graphite">
                        {p.brand}
                      </p>
                      <p className="text-[15px] text-carbon truncate">
                        <HighlightedText text={p.name} matched={e.hit.matched} />
                      </p>
                      <p className="caption text-graphite capitalize">
                        {p.gender}
                      </p>
                    </div>
                    <span className="caption text-carbon shrink-0">
                      {fmt(p.price)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Categorías + "ver todos" */}
      <section className="flex flex-col gap-10">
        {categories.length > 0 && (
          <div>
            <h3 className="mb-4 caption uppercase tracking-[0.14em] text-graphite">
              Categorías
            </h3>
            <ul className="flex flex-col">
              {categories.map((e) => {
                const globalIdx = entries.indexOf(e);
                const active = globalIdx === cursor;
                return (
                  <li key={`${e.hit.gender}-${e.hit.slug}`}>
                    <Link
                      href={e.href}
                      onClick={(ev) => {
                        ev.preventDefault();
                        onPick(e);
                      }}
                      onMouseEnter={() => setCursor(globalIdx)}
                      className={clsx(
                        "flex items-center justify-between border-b border-smoke/70 py-3 transition-colors",
                        active ? "bg-stone/60" : "hover:bg-stone/40",
                      )}
                    >
                      <span className="text-[15px] text-carbon">
                        <HighlightedText
                          text={e.hit.label}
                          matched={e.hit.matched}
                        />
                      </span>
                      <span className="caption uppercase tracking-wider text-graphite">
                        {e.hit.gender}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {queryEntry && (
          <div>
            {(() => {
              const globalIdx = entries.indexOf(queryEntry);
              const active = globalIdx === cursor;
              return (
                <Link
                  href={queryEntry.href}
                  onClick={(ev) => {
                    ev.preventDefault();
                    onPick(queryEntry);
                  }}
                  onMouseEnter={() => setCursor(globalIdx)}
                  className={clsx(
                    "inline-flex items-center gap-3 border-b pb-1 caption uppercase tracking-[0.16em] transition-colors",
                    active
                      ? "border-carbon text-carbon"
                      : "border-smoke text-carbon hover:border-carbon",
                  )}
                >
                  Ver todos los resultados para &ldquo;{query}&rdquo;
                </Link>
              );
            })()}
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Expansion notice ───────────────────────── */

function ExpansionNotice({ expansions }: { expansions: Record<string, string[]> }) {
  const entries = Object.entries(expansions);
  if (entries.length === 0) return null;
  // Formato: "tenis → zapatilla, deportiva  ·  jean → denim"
  return (
    <p className="mb-4 caption text-graphite">
      Incluyendo también{" "}
      {entries.map(([token, syns], i) => (
        <span key={token}>
          {i > 0 && <span className="text-ash"> · </span>}
          <em className="not-italic text-carbon">{syns.slice(0, 3).join(", ")}</em>{" "}
          <span className="text-ash">(por "{token}")</span>
        </span>
      ))}
    </p>
  );
}

/* ───────────────────────── Highlighter ───────────────────────── */

function HighlightedText({
  text,
  matched,
}: {
  text: string;
  matched: Set<string>;
}) {
  const parts = highlight(text, matched);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <span
            key={i}
            className="relative text-carbon"
            style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
