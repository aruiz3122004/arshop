/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * Notas de diseño:
 * - `script-src` necesita `'unsafe-inline'`: Next inyecta scripts inline de
 *   hidratación (`self.__next_f`) y el layout raíz tiene un inline de warm-up
 *   del backend. Una CSP con nonce obligaría a renderizado dinámico en TODAS
 *   las rutas (hoy son estáticas), así que el trade-off no compensa.
 *   Aun así la política bloquea scripts de orígenes no declarados.
 * - Stripe Elements crea iframes y usa su red de fingerprinting
 *   (`*.stripe.network`); Apple Pay carga su SDK desde `applepay.cdn-apple.com`.
 * - Google Fonts se importa desde `globals.css` (style-src + font-src).
 * - En dev se permiten `'unsafe-eval'` y websockets de HMR.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://js.stripe.com https://applepay.cdn-apple.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://plus.unsplash.com https://picsum.photos https://fastly.picsum.photos https://*.supabase.co https://*.stripe.com https://*.stripe.network",
  `connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.stripe.network https://*.supabase.co${isProd ? "" : " ws://localhost:* http://localhost:*"}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.network",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isProd ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

/** Headers de seguridad aplicados a todas las rutas del frontend. */
function securityHeaders() {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    // Evita que el navegador "adivine" el tipo de contenido servido.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // La app no debe poder embeberse en iframes ajenos (clickjacking).
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // La cámara se usa en /domiciliario/scan; el resto se niega.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(self)",
    },
    // Necesario para que los wallets (Apple/Google Pay) abran su popup.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];

  if (isProd) {
    // HSTS sólo tiene sentido servido por HTTPS (Vercel lo es).
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // En dev evitamos el proxy /_next/image (devuelve 500 con URLs externas
    // lentas); en producción activamos la optimización con sharp.
    unoptimized: process.env.NODE_ENV !== "production",
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      // Supabase Storage (todos los proyectos). Pattern genérico porque el host
      // concreto depende del project ref (<ref>.supabase.co).
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },

  /**
   * Proxy del API: el browser habla a /api/* (same-origin, cookies httpOnly
   * funcionan sin trucos cross-site) y Vercel reenvía a la URL real del
   * backend definida en BACKEND_URL. Server-side seguimos hablando directo
   * al backend (ver apps/web/src/lib/api.ts).
   */
  async rewrites() {
    const backend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL_RAW ||
      "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
