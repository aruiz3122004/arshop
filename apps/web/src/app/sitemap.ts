import type { MetadataRoute } from "next";
import { CATEGORIES, type Gender } from "@/lib/catalog";
import { API_BASE_URL, type ApiProduct } from "@/lib/api";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://arshop.co";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/hombre`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/mujer`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/atencion`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/compania`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacidad`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = [];
  for (const cat of CATEGORIES) {
    for (const gender of cat.genders as Gender[]) {
      categoryRoutes.push({
        url: `${SITE_URL}/${gender}/${cat.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    // Timeout estricto de 3 segundos para que Vercel nunca se bloquee en build time
    const res = await fetch(`${API_BASE_URL}/products?limit=100`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const products: ApiProduct[] = await res.json();
      productRoutes = products.map((p) => ({
        url: `${SITE_URL}/product/${p.slug}`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.85,
      }));
    }
  } catch {
    // Fallback silencioso si el API no responde en menos de 3s durante el build
    productRoutes = [];
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
