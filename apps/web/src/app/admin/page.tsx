"use client";

import Link from "next/link";
import { ClipboardList, Package, Users } from "lucide-react";

const CARDS = [
  {
    href: "/admin/productos",
    icon: Package,
    title: "Productos",
    desc: "Gestiona el catálogo, variantes, stock y precios.",
  },
  {
    href: "/admin/pedidos",
    icon: ClipboardList,
    title: "Pedidos",
    desc: "Marca envíos y entregas, revisa el historial.",
  },
  {
    href: "/admin/usuarios",
    icon: Users,
    title: "Usuarios",
    desc: "Bloquea cuentas sospechosas y revisa clientes.",
  },
];

export default function AdminHome() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            key={c.href}
            href={c.href}
            className="group border border-smoke p-6 transition-colors hover:border-carbon"
          >
            <Icon size={20} className="text-carbon" />
            <h2 className="font-serif text-xl text-carbon mt-4">{c.title}</h2>
            <p className="caption text-graphite text-[13px] mt-2 leading-relaxed">
              {c.desc}
            </p>
            <span className="caption text-[11px] text-carbon uppercase tracking-widest mt-4 inline-block underline underline-offset-4">
              Abrir →
            </span>
          </Link>
        );
      })}
    </div>
  );
}
