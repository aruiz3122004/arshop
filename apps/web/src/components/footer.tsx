import Link from "next/link";
import { PwaInstallLink } from "./pwa-install";

const groups = [
  {
    title: "Compra",
    links: [
      { label: "Mujer", href: "/mujer" },
      { label: "Hombre", href: "/hombre" },
      { label: "Novedades", href: "/" },
    ],
  },
  {
    title: "Atención",
    links: [
      { label: "Envíos", href: "/atencion#envios" },
      { label: "Devoluciones", href: "/atencion#devoluciones" },
      { label: "Contacto", href: "/atencion#contacto" },
    ],
  },
  {
    title: "Compañía",
    links: [
      { label: "Sobre ARShop", href: "/compania#sobre-arshop" },
      { label: "Sostenibilidad", href: "/compania#sostenibilidad" },
      { label: "FAQ", href: "/compania#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Política de privacidad", href: "/privacidad" },
      { label: "Tratamiento de datos", href: "/privacidad#datos" },
      { label: "Términos y condiciones", href: "/privacidad#stripe" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-carbon text-paper mt-24">
      <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-16">
        <div className="grid grid-cols-2 gap-6 sm:gap-8 md:grid-cols-4 md:gap-10">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="caption uppercase tracking-[0.14em] text-paper/70 mb-4">
                {g.title}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="caption text-paper hover:underline underline-offset-4"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t border-paper/15 pt-8 md:flex-row md:items-center">
          <span className="wordmark text-paper text-[22px]">ARShop</span>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <PwaInstallLink />
            <p className="caption text-paper/60">
              © {new Date().getFullYear()} ARShop. Moda oculta, sin sede física.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
