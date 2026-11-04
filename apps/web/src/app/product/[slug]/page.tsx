import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, formatPrice } from "@/lib/catalog";
import { fetchProductBySlug } from "@/lib/api";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductDetail } from "@/components/product-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug).catch(() => null);
  if (!product) {
    return {
      title: "Producto no encontrado",
    };
  }

  const priceFormatted = formatPrice(product.price);
  const title = `${product.name} (${priceFormatted})`;
  const description = `${product.description} · Marca ${product.brand}. Disponible en tallas ${product.sizes.join(", ")}. Envío a toda Colombia con IVA 19% incluido.`;
  const primaryImage = product.images[0];

  return {
    title,
    description,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
    openGraph: {
      type: "website",
      locale: "es_CO",
      title: `${product.name} | ARShop`,
      description,
      url: `/product/${product.slug}`,
      images: primaryImage
        ? [
            {
              url: primaryImage,
              width: 800,
              height: 1000,
              alt: product.name,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | ARShop`,
      description,
      images: primaryImage ? [primaryImage] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) notFound();

  const genderLabel = product.gender === "mujer" ? "Mujer" : "Hombre";
  const categoryLabel =
    CATEGORIES.find((c) => c.slug === product.category)?.label ?? product.category;

  const totalStock =
    product.variants?.reduce((sum, v) => sum + (v.stock ?? 0), 0) ?? 1;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images,
    sku: product.variants?.[0]?.sku ?? product.slug,
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    offers: {
      "@type": "Offer",
      url: `https://arshop.co/product/${product.slug}`,
      priceCurrency: "COP",
      price: product.price,
      availability:
        totalStock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-[1280px] px-4 pt-8 md:px-6">
        <Breadcrumbs
          items={[
            { label: "Inicio", href: "/" },
            { label: genderLabel, href: `/${product.gender}` },
            {
              label: categoryLabel,
              href: `/${product.gender}/${product.category}`,
            },
            { label: product.name },
          ]}
        />
      </div>
      <ProductDetail product={product} />
    </>
  );
}
