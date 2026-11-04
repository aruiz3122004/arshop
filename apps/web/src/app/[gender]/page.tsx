import { notFound } from "next/navigation";
import {
  getCategoriesForGender,
  type Gender,
} from "@/lib/catalog";
import { fetchProducts } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
import { CategoryCard } from "@/components/category-card";
import { SectionTitle } from "@/components/section-title";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FilterBar } from "@/components/filter-bar";
import { search } from "@/lib/search";
import {
  applyFilters,
  availableSizes,
  parseFilters,
} from "@/lib/filters";
import Link from "next/link";

const VALID: Gender[] = ["hombre", "mujer"];

export function generateStaticParams() {
  return VALID.map((gender) => ({ gender }));
}

export default async function GenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ gender: string }>;
  searchParams: Promise<{
    q?: string;
    size?: string;
    price?: string;
    sort?: string;
  }>;
}) {
  const { gender } = await params;
  const sp = await searchParams;
  if (!VALID.includes(gender as Gender)) notFound();

  const g = gender as Gender;
  const title = g === "mujer" ? "Mujer" : "Hombre";
  const query = (sp.q ?? "").trim();
  const filterState = parseFilters(sp);

  // ───── Modo búsqueda ─────
  if (query.length >= 2) {
    const results = await search(query, { limitProducts: 60, limitCategories: 0 });
    const base = results.products
      .map((h) => h.product)
      .filter((p) => p.gender === g);
    const filtered = applyFilters(base, filterState);
    const sizes = availableSizes(base);

    return (
      <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8">
        <Breadcrumbs
          items={[
            { label: "Inicio", href: "/" },
            { label: title, href: `/${g}` },
            { label: `“${query}”` },
          ]}
        />

        <div className="py-12 md:py-14 text-center">
          <p className="caption uppercase tracking-[0.14em] text-graphite mb-3">
            Resultados en {title}
          </p>
          <h1 className="font-display text-[28px] md:text-[30px] text-carbon">
            “{query}”
          </h1>
        </div>

        {base.length > 0 && (
          <FilterBar
            availableSizes={sizes}
            totalCount={base.length}
            shownCount={filtered.length}
          />
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-6 py-20 text-center">
            <p className="text-graphite max-w-md">
              {base.length === 0
                ? "No encontramos piezas que coincidan con esta búsqueda."
                : "Ninguna pieza de esta búsqueda coincide con los filtros aplicados."}
            </p>
            <Link
              href={`/${g}`}
              className="caption uppercase tracking-[0.16em] border-b border-carbon pb-1 text-carbon hover:opacity-70"
            >
              Volver a {title}
            </Link>
          </div>
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

  // ───── Modo catálogo normal ─────
  const categories = getCategoriesForGender(g);
  const base = await fetchProducts({ gender: g });
  const filtered = applyFilters(base, filterState);
  const sizes = availableSizes(base);

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: title }]} />

      <SectionTitle>{title}</SectionTitle>

      {/* Categorías */}
      <section className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6 pb-6">
        {categories.map((c) => (
          <CategoryCard
            key={c.slug}
            href={`/${g}/${c.slug}`}
            label={c.label.toUpperCase()}
            image={c.cover}
            aspect="square"
          />
        ))}
      </section>

      {/* Productos */}
      <SectionTitle>Novedades</SectionTitle>
      <FilterBar
        availableSizes={sizes}
        totalCount={base.length}
        shownCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-20 text-center">
          <p className="text-graphite max-w-md">
            Ninguna pieza coincide con estos filtros.
          </p>
          <Link
            href={`/${g}`}
            className="caption uppercase tracking-[0.16em] border-b border-carbon pb-1 text-carbon hover:opacity-70"
          >
            Quitar todos los filtros
          </Link>
        </div>
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
