"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bike, ClipboardList, LayoutGrid, Loader2, Package, Receipt, Users, ScrollText, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutGrid, exact: true },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/facturacion", label: "Facturación", icon: Receipt },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/domiciliarios", label: "Domiciliarios", icon: Bike },
  { href: "/admin/disputas", label: "Disputas", icon: AlertTriangle },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, sessionChecked } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // No redirigimos hasta que el probe de sesión haya terminado: si el
    // backend está despertando (Render free) un `user` todavía nulo no
    // significa "sin sesión".
    if (!sessionChecked) return;
    if (!user) {
      router.replace("/cuenta");
      return;
    }
    if (user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [user, sessionChecked, router]);

  if (!user || user.role !== "ADMIN") {
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
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-5 pb-8">
      <div className="flex items-center justify-between border-b border-carbon pb-3">
        <div>
          <p className="caption uppercase tracking-[0.2em] text-graphite text-[11px]">
            Panel de administración
          </p>
          <h1 className="font-serif text-xl text-carbon mt-0.5">ARShop · Admin</h1>
        </div>
        <Link
          href="/"
          className="caption uppercase tracking-wider text-[11px] text-carbon underline underline-offset-4"
        >
          Volver a la tienda
        </Link>
      </div>

      <nav className="mt-2.5 flex items-center gap-1 border-b border-smoke overflow-x-auto no-scrollbar flex-nowrap">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 caption uppercase tracking-[0.11em] text-[10.5px] whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                active
                  ? "border-carbon text-carbon font-medium"
                  : "border-transparent text-graphite hover:text-carbon"
              }`}
            >
              <Icon size={13} /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">{children}</div>
    </div>
  );
}
