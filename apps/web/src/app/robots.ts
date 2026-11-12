import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://arshop-snowy.vercel.app/";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/hombre", "/mujer", "/product/", "/buscar"],
        disallow: [
          "/admin/",
          "/domiciliario/",
          "/cuenta/",
          "/checkout/",
          "/cart",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
