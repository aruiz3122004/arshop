import type { Product } from "./catalog";

export interface PriceRange {
  slug: string;
  label: string;
  min: number;
  max: number;
}

export const PRICE_RANGES: PriceRange[] = [
  { slug: "sub-250", label: "Menos de $250.000", min: 0, max: 250_000 },
  { slug: "250-500", label: "$250.000 — $500.000", min: 250_000, max: 500_000 },
  { slug: "500-800", label: "$500.000 — $800.000", min: 500_000, max: 800_000 },
  { slug: "800-plus", label: "Más de $800.000", min: 800_000, max: Number.POSITIVE_INFINITY },
];

export type SortKey = "newest" | "price-asc" | "price-desc" | "name-asc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Novedades" },
  { key: "price-asc", label: "Precio ↑" },
  { key: "price-desc", label: "Precio ↓" },
  { key: "name-asc", label: "Nombre A — Z" },
];

export interface FilterState {
  sizes: string[];
  priceSlug: string | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: FilterState = {
  sizes: [],
  priceSlug: null,
  sort: "newest",
};

export function parseFilters(sp: {
  size?: string;
  price?: string;
  sort?: string;
}): FilterState {
  const sizes = sp.size
    ? sp.size.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const priceSlug = PRICE_RANGES.find((p) => p.slug === sp.price)
    ? (sp.price as string)
    : null;
  const sort = (SORT_OPTIONS.find((s) => s.key === sp.sort)?.key ??
    "newest") as SortKey;
  return { sizes, priceSlug, sort };
}

export function applyFilters(products: Product[], state: FilterState): Product[] {
  let out = products;

  if (state.sizes.length) {
    const want = new Set(state.sizes.map((s) => s.toUpperCase()));
    out = out.filter((p) => p.sizes.some((s) => want.has(s.toUpperCase())));
  }

  if (state.priceSlug) {
    const range = PRICE_RANGES.find((r) => r.slug === state.priceSlug);
    if (range) {
      out = out.filter((p) => p.price >= range.min && p.price < range.max);
    }
  }

  switch (state.sort) {
    case "price-asc":
      return [...out].sort((a, b) => a.price - b.price);
    case "price-desc":
      return [...out].sort((a, b) => b.price - a.price);
    case "name-asc":
      return [...out].sort((a, b) => a.name.localeCompare(b.name, "es"));
    default:
      return out;
  }
}

export function availableSizes(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) p.sizes.forEach((s) => set.add(s));
  return [...set].sort(compareSize);
}

const LETTER_ORDER: Record<string, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
  XXL: 5,
};

function compareSize(a: string, b: string): number {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  const la = LETTER_ORDER[A];
  const lb = LETTER_ORDER[B];
  if (la !== undefined && lb !== undefined) return la - lb;
  if (la !== undefined) return -1; // letras antes que números
  if (lb !== undefined) return 1;
  const na = parseInt(A, 10);
  const nb = parseInt(B, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "es");
}

export function activeCount(state: FilterState): number {
  return (
    state.sizes.length +
    (state.priceSlug ? 1 : 0) +
    (state.sort !== "newest" ? 1 : 0)
  );
}
