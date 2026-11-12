import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";
import { PwaInstall } from "@/components/pwa-install";
import { SessionCookie } from "@/components/session-cookie";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://arshop.co";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ARShop · Moda Minimalista Colombiana",
    template: "%s | ARShop",
  },
  description:
    "ARShop es una tienda de moda minimalista en Colombia. Prendas seleccionadas, sin ruido visual, enviadas directamente a tu puerta con verificación QR.",
  applicationName: "ARShop",
  keywords: [
    "moda minimalista colombia",
    "ropa minimalista",
    "ARShop",
    "camisas hombre mujer",
    "calzado minimalista",
    "tienda de ropa online colombia",
  ],
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: SITE_URL,
    siteName: "ARShop",
    title: "ARShop · Moda Minimalista Colombiana",
    description:
      "Moda oculta, sin sede física. Prendas minimalistas enviadas directamente a tu puerta en toda Colombia.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ARShop · Moda Minimalista Colombiana",
    description:
      "Moda oculta, sin sede física. Prendas minimalistas enviadas directamente a tu puerta en toda Colombia.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ARShop",
  },
  icons: {
    icon: "/favicon.jpg",
    shortcut: "/favicon.jpg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="font-sans">
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        {/*
          Warm-up del backend lo antes posible: se ejecuta durante el parseo
          del HTML, antes de que React hidrate. El backend (Render free) duerme
          a los 15 min y tarda 20-50s en despertar; así el arranque corre en
          paralelo a la carga de la página en vez de al enviar el login.
          Ver apps/web/src/lib/backend-warmup.ts para el resto del ciclo.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="arshop:backend-ping",l=+sessionStorage.getItem(k)||0;if(Date.now()-l<60000)return;sessionStorage.setItem(k,String(Date.now()));fetch("/api/health",{cache:"no-store",keepalive:true})["catch"](function(){});}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          <AnnouncementBar />
          <Header />
          <main className="overflow-x-clip max-w-full min-w-0">{children}</main>
          <Footer />
          <PwaInstall />
          <SessionCookie />
        </Providers>
      </body>
    </html>
  );
}
