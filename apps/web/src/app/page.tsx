"use client";

import { useEffect, useState } from "react";
import { useGender } from "@/lib/gender";
import {
  CATEGORIES,
  GENDER_HEROES,
  getCategoriesForGender,
  type Product,
} from "@/lib/catalog";
import { fetchProducts } from "@/lib/api";
import { HeroTile } from "@/components/hero-tile";
import { CategoryCard } from "@/components/category-card";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import Link from "next/link";

export default function HomePage() {
  const { gender } = useGender();
  const categoriesForGender = getCategoriesForGender(gender);
  const [featured, setFeatured] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts({ gender, limit: 4 })
      .then((prods) => {
        if (prods && prods.length > 0) {
          setFeatured(prods.slice(0, 4));
        }
      })
      .catch(() => {
        // Fallback silencioso: el bloque "Destacados" queda vacío si el
        // backend no responde (p. ej. cold start del rewrite de Next dev).
      });
  }, [gender]);

  const activeHero = GENDER_HEROES[gender];
  const otherGender = gender === "mujer" ? "hombre" : "mujer";
  const otherHero = GENDER_HEROES[otherGender];

  return (
    <>
      {/* ───────── HERO ───────── */}
      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pt-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <HeroTile
            href={`/${gender}`}
            label={activeHero.title.toUpperCase()}
            image={activeHero.image}
          />
          <HeroTile
            href={`/${otherGender}`}
            label={otherHero.title.toUpperCase()}
            image={otherHero.image}
          />
        </div>
      </section>

      {/* ───────── Elige sección ───────── */}
      <section className="mx-auto max-w-[1280px] px-4 md:px-6">
        <SectionTitle>Elige una sección</SectionTitle>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {categoriesForGender.slice(0, 4).map((c) => (
            <CategoryCard
              key={c.slug}
              href={`/${gender}/${c.slug}`}
              label={c.label.toUpperCase()}
              image={c.cover}
              aspect="portrait"
            />
          ))}
        </div>
      </section>

      {/* ───────── Destacados ───────── */}
      <section className="mx-auto max-w-[1280px] px-4 md:px-6">
        <SectionTitle>
          Moda para {gender === "mujer" ? "mujer" : "hombre"}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <div className="flex justify-center pt-12 pb-6">
          <Link
            href={`/${gender}`}
            className="caption uppercase tracking-[0.16em] text-carbon border-b border-carbon pb-1 hover:opacity-70"
          >
            Ver todo
          </Link>
        </div>
      </section>

      {/* ───────── Todas las categorías ───────── */}
      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pb-16">
        <SectionTitle>Explora el catálogo</SectionTitle>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.filter((c) => c.genders.includes(gender)).map((c) => (
            <CategoryCard
              key={c.slug}
              href={`/${gender}/${c.slug}`}
              label={c.label.toUpperCase()}
              image={c.cover}
              aspect="square"
            />
          ))}
        </div>
      </section>
    </>
  );
}
