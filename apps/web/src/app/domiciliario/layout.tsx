"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bike, ClipboardList, Coins, Loader2, QrCode, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/domiciliario", label: "Resumen", icon: Bike, exact: true },
  { href: "/domiciliario/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/domiciliario/scan", label: "Escanear", icon: QrCode },
  { href: "/domiciliario/bonos", label: "Bonos", icon: Coins },
  { href: "/domiciliario/configuracion", label: "Config", icon: Settings },
];

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const { user, sessionChecked } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Espera al probe de sesión antes de decidir: con el backend frío, un
    // `user` nulo transitorio no debe expulsar al repartidor.
    if (!sessionChecked) return;
    if (!user) {
      router.replace("/cuenta");
      return;
    }
    if (user.role !== "REPARTIDOR") {
      router.replace("/");
    }
  }, [user, sessionChecked, router]);

  if (!user || user.role !== "REPARTIDOR") {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16 pb-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
        <p className="caption mt-3 uppercase tracking-widest text-graphite">
          Verificando permisos...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1024px] px-5 pt-5 pb-28 md:pb-10">
      <div className="flex items-center justify-between border-b border-carbon pb-3">
        <div>
          <p className="caption uppercase tracking-[0.2em] text-graphite text-[11px]">
            Panel del domiciliario
          </p>
          <h1 className="font-serif text-xl text-carbon mt-0.5">ARShop · Repartidor</h1>
        </div>
        <Link
          href="/"
          className="caption uppercase tracking-wider text-[11px] text-carbon underline underline-offset-4"
        >
          Volver
        </Link>
      </div>

      {/* Desktop nav */}
      <nav className="mt-3 hidden md:flex flex-wrap gap-1 border-b border-smoke">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 px-4 py-2 caption uppercase tracking-[0.14em] text-[11px] border-b-2 transition-colors ${
                active
                  ? "border-carbon text-carbon font-medium"
                  : "border-transparent text-graphite hover:text-carbon"
              }`}
            >
              <Icon size={14} /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">{children}</div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-smoke grid grid-cols-5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-2 text-[10px] uppercase tracking-wider ${
                active ? "text-carbon" : "text-graphite"
              }`}
            >
              <Icon size={16} />
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
