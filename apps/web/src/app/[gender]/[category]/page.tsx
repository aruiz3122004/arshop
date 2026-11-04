import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CATEGORIES,
  type CategorySlug,
  type Gender,
} from "@/lib/catalog";
import { fetchProducts } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { FilterBar } from "@/components/filter-bar";
import {
  applyFilters,
  availableSizes,
  parseFilters,
} from "@/lib/filters";

const VALID_G: Gender[] = ["hombre", "mujer"];

export function generateStaticParams() {
  const out: { gender: string; category: string }[] = [];
  for (const g of VALID_G) {
    for (const c of CATEGORIES) {
      if (c.genders.includes(g)) out.push({ gender: g, category: c.slug });
    }
  }
  return out;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ gender: string; category: string }>;
  searchParams: Promise<{ size?: string; price?: string; sort?: string }>;
}) {
  const { gender, category } = await params;
  const sp = await searchParams;
  if (!VALID_G.includes(gender as Gender)) notFound();
  const cat = CATEGORIES.find((c) => c.slug === category);
  if (!cat || !cat.genders.includes(gender as Gender)) notFound();

  const g = gender as Gender;
  const base = await fetchProducts({ gender: g, category: category as CategorySlug });
  const filterState = parseFilters(sp);
  const filtered = applyFilters(base, filterState);
  const sizes = availableSizes(base);
  const genderLabel = g === "mujer" ? "Mujer" : "Hombre";

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: genderLabel, href: `/${g}` },
          { label: cat.label },
        ]}
      />

      <SectionTitle>{cat.label}</SectionTitle>

      <FilterBar
        availableSizes={sizes}
        totalCount={base.length}
        shownCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <EmptyState
          hasBase={base.length > 0}
          backHref={`/${g}/${cat.slug}`}
        />
      ) : (
        <section className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 pt-8 pb-20">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </section>
      )}
    </div>
  );
}

function EmptyState({
  hasBase,
  backHref,
}: {
  hasBase: boolean;
  backHref: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <p className="text-graphite max-w-md">
        {hasBase
          ? "Ninguna pieza coincide con estos filtros. Prueba ampliando el rango de precio o liberando una talla."
          : "Aún no hay piezas en esta categoría."}
      </p>
      {hasBase && (
        <Link
          href={backHref}
          className="caption uppercase tracking-[0.16em] border-b border-carbon pb-1 text-carbon hover:opacity-70"
        >
          Quitar todos los filtros
        </Link>
      )}
    </div>
  );
}
