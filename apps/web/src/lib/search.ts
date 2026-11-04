import {
  CATEGORIES,
  type CategorySlug,
  type Gender,
  type Product,
} from "./catalog";
import { fetchProducts } from "./api";

export interface ProductHit {
  type: "product";
  score: number;
  product: Product;
  matched: Set<string>; // tokens que acertaron, para resaltar
}

export interface CategoryHit {
  type: "category";
  score: number;
  gender: Gender;
  slug: CategorySlug;
  label: string;
  matched: Set<string>;
}

export type SearchHit = ProductHit | CategoryHit;

export interface SearchResults {
  products: ProductHit[];
  categories: CategoryHit[]
  total: number;
  /** token original → sinónimos distintos que realmente ayudaron en algún match */
  expansions: Record<string, string[]>;
}

/* ───────────────────────── Normalización (necesaria antes del índice) ───────────────────────── */

const DIACRITICS = /\p{Diacritic}/gu;

export function normalize(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "").toLowerCase().trim();
}

export function tokenize(q: string): string[] {
  return normalize(q)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/* ───────────────────────── Sinónimos ─────────────────────────
 * Vocabulario de moda es-CO con regionalismos LATAM y anglicismos frecuentes.
 * Cada grupo es simétrico: cualquier variante dispara a todas las demás.
 */
const SYNONYM_GROUPS: string[][] = [
  // ───── Calzado ─────
  ["tenis", "zapatilla", "zapatillas", "deportiva", "deportivas", "sneaker", "sneakers"],
  ["mocasin", "mocasines", "loafer", "loafers", "penny"],
  ["bota", "botas", "botin", "botines", "boot", "boots"],
  ["sandalia", "sandalias", "chancla", "chanclas", "sandal"],
  ["tacon", "tacones", "stiletto", "pump"],

  // ───── Prendas superiores ─────
  ["camiseta", "camisetas", "remera", "playera", "franela", "tee", "tshirt"],
  ["camisa", "camisas", "shirt"],
  ["blusa", "blusas"],
  ["top", "tops"],
  ["polo", "polos"],
  ["buzo", "sudadera", "sudaderas", "hoodie", "canguro", "capucha"],
  ["sweater", "sueter", "jersey", "pullover"],
  ["saco", "cardigan", "cardigans"],
  ["chaqueta", "chaquetas", "chompa", "jacket", "abrigo"],

  // ───── Prendas inferiores ─────
  ["pantalon", "pantalones", "pants", "trousers", "slacks"],
  ["jean", "jeans", "vaquero", "vaqueros", "mezclilla", "denim"],
  ["shorts", "short", "bermuda", "bermudas", "pantaloneta", "pantalonetas"],
  ["legging", "leggings", "licra", "licras", "mallas"],
  ["jogger", "joggers", "pants", "sweatpants"],

  // ───── Ropa interior / loungewear ─────
  ["panty", "pantys", "pantie", "panties", "bragas", "braga", "bombacha", "calzon", "calzones", "culotte", "culotes"],
  ["brasier", "brassier", "sosten", "sostenes", "sujetador", "sujetadores", "bra", "corpino"],
  ["medias", "calcetines", "calcetas", "socks"],
  ["boxer", "boxers", "calzoncillo", "calzoncillos"],
  ["body", "bodysuit", "bodies"],
  ["baby doll", "babydoll", "camison", "camisones", "nightie"],
  ["pijama", "piyama", "pajama"],

  // ───── Conjuntos y estructura ─────
  ["vestido", "vestidos", "dress"],
  ["enterizo", "mono", "overol", "jumpsuit"],
  ["corse", "corset", "bustier"],

  // ───── Accesorios ─────
  ["correa", "cinturon", "cinturones", "belt"],
  ["bolso", "cartera", "bolsa", "bag", "tote"],
  ["gorra", "cachucha", "visera", "cap"],
  ["gafas", "lentes", "sunglasses"],
  ["pañuelo", "panuelo", "scarf", "bufanda"],
];

/** Mapa de token-normalizado → grupo entero (incluyéndolo). Precomputado. */
const SYNONYM_INDEX: Record<string, string[]> = (() => {
  const index: Record<string, string[]> = {};
  for (const group of SYNONYM_GROUPS) {
    const norm = Array.from(new Set(group.map((t) => normalize(t))));
    for (const t of norm) {
      // si un token aparece en varios grupos, los unimos
      index[t] = Array.from(new Set([...(index[t] ?? []), ...norm]));
    }
  }
  return index;
})();

function expandSynonyms(token: string): string[] {
  return SYNONYM_INDEX[token] ?? [token];
}

/**
 * Devuelve puntaje de un token sobre un texto:
 * - 100 si el texto es exactamente el token
 * - 60 + bonus de posición si el texto empieza por el token
 * - 40 si lo contiene como palabra completa
 * - 25 si lo contiene como substring
 * - 15 si matchea con 1 error de edición (distancia ≤ 1, token ≥ 4)
 * - 0 en otro caso
 */
export function scoreField(token: string, raw: string): number {
  if (!raw) return 0;
  const text = normalize(raw);
  if (text === token) return 100;
  if (text.startsWith(token)) return 65;
  // palabra completa dentro
  const re = new RegExp(`\\b${escapeRe(token)}\\b`);
  if (re.test(text)) return 45;
  // match parcial sobre alguna palabra (prefijo de palabra interna)
  const words = text.split(/\s+/);
  if (words.some((w) => w.startsWith(token))) return 30;
  if (text.includes(token)) return 25;
  // Tolerancia a typos: 1 error de edición por palabra (token ≥ 4)
  if (
    token.length >= 4 &&
    words.some(
      (w) =>
        Math.abs(w.length - token.length) <= 1 &&
        levenshtein(token, w) <= 1,
    )
  )
    return 20;
  return 0;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Levenshtein pequeño (optimizado para strings cortos). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0);
  const cur = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Pesos por campo. El name manda; marca y categoría apoyan;
 * color/género son hints suaves que suben el score pero no bastan solos.
 */
const WEIGHTS = {
  name: 1.0,
  category: 0.8,
  brand: 0.5,
  color: 0.55,
  gender: 0.3,
} as const;

/** Puntúa cada variante del token (sinónimo), devuelve la mejor + registra las que acertaron. */
function bestVariantScore(
  token: string,
  matched: Set<string>,
  expansionTracker: Record<string, Set<string>>,
  scoreOf: (variant: string) => number,
): number {
  const variants = expandSynonyms(token);
  let best = 0;
  for (const v of variants) {
    const s = scoreOf(v);
    if (s > 0) {
      matched.add(v);
      if (v !== token) {
        (expansionTracker[token] ??= new Set()).add(v);
      }
      if (s > best) best = s;
    }
  }
  return best;
}

function scoreProduct(
  p: Product,
  tokens: string[],
  expansionTracker: Record<string, Set<string>>,
): ProductHit | null {
  const categoryLabel =
    CATEGORIES.find((c) => c.slug === p.category)?.label ?? p.category;

  let total = 0;
  const matched = new Set<string>();

  for (const t of tokens) {
    const best = bestVariantScore(t, matched, expansionTracker, (v) =>
      Math.max(
        scoreField(v, p.name) * WEIGHTS.name,
        scoreField(v, categoryLabel) * WEIGHTS.category,
        scoreField(v, p.brand) * WEIGHTS.brand,
        scoreField(v, p.gender) * WEIGHTS.gender,
        ...p.colors.map((c) => scoreField(v, c.name) * WEIGHTS.color),
      ),
    );
    if (best <= 0) return null; // AND entre tokens del usuario
    total += best;
  }

  return { type: "product", score: total, product: p, matched };
}

function scoreCategory(
  cat: { slug: CategorySlug; label: string; genders: Gender[] },
  gender: Gender,
  tokens: string[],
  expansionTracker: Record<string, Set<string>>,
): CategoryHit | null {
  let total = 0;
  const matched = new Set<string>();
  for (const t of tokens) {
    const best = bestVariantScore(t, matched, expansionTracker, (v) =>
      Math.max(
        scoreField(v, cat.label) * WEIGHTS.name,
        scoreField(v, gender) * WEIGHTS.gender,
      ),
    );
    if (best <= 0) return null;
    total += best;
  }
  return {
    type: "category",
    score: total,
    gender,
    slug: cat.slug,
    label: cat.label,
    matched,
  };
}

export async function search(
  query: string,
  opts: { limitProducts?: number; limitCategories?: number } = {},
): Promise<SearchResults> {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { products: [], categories: [], total: 0, expansions: {} };
  }

  const limitProducts = opts.limitProducts ?? 6;
  const limitCategories = opts.limitCategories ?? 4;

  const expansionTracker: Record<string, Set<string>> = {};

  // Fetch candidates from backend, then re-rank locally with synonym expansion
  let apiProducts: Product[] = [];
  try {
    apiProducts = await fetchProducts({ q: query, limit: 30 });
  } catch {
    // Search degrades gracefully when the API is unavailable
  }

  const products: ProductHit[] = [];
  for (const p of apiProducts) {
    const hit = scoreProduct(p, tokens, expansionTracker);
    if (hit) products.push(hit);
  }
  products.sort((a, b) => b.score - a.score);

  const categories: CategoryHit[] = [];
  for (const c of CATEGORIES) {
    for (const g of c.genders) {
      const hit = scoreCategory(c, g, tokens, expansionTracker);
      if (hit) categories.push(hit);
    }
  }
  const seen = new Set<string>();
  const dedup: CategoryHit[] = [];
  categories.sort((a, b) => b.score - a.score);
  for (const c of categories) {
    const key = `${c.gender}:${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(c);
  }

  const expansions: Record<string, string[]> = {};
  for (const [token, set] of Object.entries(expansionTracker)) {
    const list = [...set].filter((v) => v !== token);
    if (list.length > 0) expansions[token] = list;
  }

  return {
    products: products.slice(0, limitProducts),
    categories: dedup.slice(0, limitCategories),
    total: products.length + dedup.length,
    expansions,
  };
}

/**
 * Fragmenta un string en trozos marcados como "matched" o no, para resaltar
 * los tokens dentro del nombre/categoría preservando acentos originales.
 */
export function highlight(
  text: string,
  matched: Set<string>,
): { text: string; hit: boolean }[] {
  if (matched.size === 0 || !text) return [{ text, hit: false }];
  const tokens = [...matched].sort((a, b) => b.length - a.length);
  const norm = normalize(text);
  const marks: boolean[] = new Array(text.length).fill(false);

  for (const t of tokens) {
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = norm.indexOf(t, from);
      if (i === -1) break;
      for (let k = i; k < i + t.length && k < marks.length; k++) marks[k] = true;
      from = i + t.length;
    }
  }

  const out: { text: string; hit: boolean }[] = [];
  let buf = "";
  let state = marks[0] ?? false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] === state) {
      buf += text[i];
    } else {
      if (buf) out.push({ text: buf, hit: state });
      buf = text[i];
      state = marks[i];
    }
  }
  if (buf) out.push({ text: buf, hit: state });
  return out;
}
