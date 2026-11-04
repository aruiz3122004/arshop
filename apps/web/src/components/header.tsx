"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Search, User, ShoppingCart, Menu, X, ArrowLeft } from "lucide-react";
import { useGender } from "@/lib/gender";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { getCategoriesForGender } from "@/lib/catalog";
import { useState, useRef } from "react";
import clsx from "clsx";
import { useDismiss } from "@/lib/use-dismiss";
import { SearchOverlay } from "./search-overlay";
import { CurrencySwitcher } from "./currency-switcher";

export function Header() {
  const pathname = usePathname() || "";
  const isAccountOrCart =
    pathname.startsWith("/cuenta") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout");
  const isAdmin = pathname.startsWith("/admin");
  const isDelivery = pathname.startsWith("/domiciliario");
  const hideCategories = isAccountOrCart || isAdmin || isDelivery;

  const { gender, setGender } = useGender();
  const { count } = useCart();
  const { user } = useAuth();
  const categories = getCategoriesForGender(gender);

  // ───── Search overlay ─────
  const [searchOpen, setSearchOpen] = useState(false);

  // ───── Mobile drawer ─────
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);
  useDismiss(mobileRef, mobileOpen, () => setMobileOpen(false));

  return (
    <header className="relative bg-paper">
      {/* ═════════ Nivel 1 — Header principal (3 zonas simétricas) ═════════ */}
      <div className="border-b border-smoke">
        <div className="mx-auto grid h-[64px] max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 md:h-[72px] md:gap-6 md:px-6">
          {/* ───── Zona izquierda ───── */}
          <div className="flex items-center gap-5">
            {hideCategories ? (
              <Link
                href="/"
                className="-ml-1 p-2 text-carbon transition-opacity hover:opacity-60 inline-flex items-center justify-center"
                aria-label="Volver al inicio"
                title="Volver al inicio"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="-ml-1 p-2 text-carbon lg:hidden"
                  aria-label="Abrir menú"
                >
                  <Menu size={20} strokeWidth={1.5} />
                </button>

                <nav
                  className="hidden items-center gap-5 lg:flex"
                  aria-label="Género"
                >
                  {(["mujer", "hombre"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={clsx(
                        "caption uppercase tracking-[0.14em] transition-colors",
                        gender === g
                          ? "text-carbon underline underline-offset-[7px] decoration-1"
                          : "text-graphite hover:text-carbon",
                      )}
                      aria-pressed={gender === g}
                    >
                      {g}
                    </button>
                  ))}
                </nav>
              </>
            )}
          </div>

          {/* ───── Zona central — Logo ───── */}
          <Link
            href="/"
            className="flex items-center justify-center select-none"
            aria-label="ARShop — inicio"
          >
            <Image
              src="/arshop-logo.jpg"
              alt="ARShop"
              width={64}
              height={64}
              priority
              className="h-10 w-10 object-contain md:h-12 md:w-12"
            />
          </Link>

          {/* ───── Zona derecha — cluster de iconos ───── */}
          <div className="flex items-center justify-end gap-0 md:gap-2">
            <CurrencySwitcher />

            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="p-1.5 text-carbon transition-opacity hover:opacity-60 md:p-2.5"
              aria-label="Buscar"
              aria-expanded={searchOpen}
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            <Link
              href="/cuenta"
              className="relative p-1.5 text-carbon transition-opacity hover:opacity-60 md:p-2.5"
              aria-label={user ? `Mi cuenta: ${user.email}` : "Mi cuenta"}
              title={user ? `Conectado como ${user.full_name || user.email}` : "Mi cuenta"}
            >
              <User size={18} strokeWidth={1.5} />
              {user && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-carbon md:top-2 md:right-2" />
              )}
            </Link>

            <Link
              href="/cart"
              className="group relative flex items-center justify-center p-1.5 text-carbon transition-opacity hover:opacity-60 md:p-2"
              aria-label={`Carrito, ${count} ${count === 1 ? "artículo" : "artículos"}`}
            >
              <ShoppingCart
                size={20}
                strokeWidth={1.5}
                className="transition-transform duration-200 group-hover:scale-105"
              />
              {count > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-carbon px-1 text-[10px] font-mono font-medium leading-none text-paper ring-2 ring-paper"
                  aria-hidden
                >
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* ═════════ Nivel 2 — Rail de categorías (lg+) ═════════ */}
        {!hideCategories && (
          <nav
            className="hidden lg:block border-t border-smoke/60"
            aria-label="Categorías"
          >
            <ul className="mx-auto flex max-w-[1280px] items-center justify-center gap-10 px-6">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/${gender}/${c.slug}`}
                    className="group inline-flex py-3 caption uppercase tracking-[0.14em] text-carbon"
                  >
                    <span className="relative">
                      {c.label}
                      <span className="absolute left-0 right-0 -bottom-0.5 h-px origin-center scale-x-0 bg-carbon transition-transform duration-200 group-hover:scale-x-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* ═════════ Search overlay (paleta de comandos) ═════════ */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ═════════ Mobile drawer (<lg) ═════════ */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-carbon/40 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!mobileOpen}
      />
      <aside
        ref={mobileRef}
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-[84%] max-w-[360px] bg-paper transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-label="Menú"
      >
        <div className="flex items-center justify-between border-b border-smoke px-5 py-4">
          <span className="caption uppercase tracking-[0.14em] text-graphite">
            Menú
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 text-carbon"
            aria-label="Cerrar menú"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-col px-5">
          {!hideCategories ? (
            <>
              <div className="flex items-center gap-6 border-b border-smoke py-5">
                {(["mujer", "hombre"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={clsx(
                      "caption uppercase tracking-[0.14em]",
                      gender === g
                        ? "text-carbon underline underline-offset-[7px] decoration-1"
                        : "text-graphite",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <ul className="flex flex-col py-3">
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/${gender}/${c.slug}`}
                      onClick={() => setMobileOpen(false)}
                      className="block py-3 text-[15px] text-carbon border-b border-smoke/70"
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="py-5 border-b border-smoke">
              <Link
                href={`/${gender}`}
                onClick={() => setMobileOpen(false)}
                className="caption uppercase tracking-[0.14em] text-carbon hover:text-graphite transition-colors"
              >
                ← Explorar catálogo
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-4 pt-5 pb-6 border-t border-smoke">
            <Link
              href="/cuenta"
              onClick={() => setMobileOpen(false)}
              className="caption uppercase tracking-[0.14em] text-carbon"
            >
              Mi cuenta
            </Link>
            <Link
              href="/cart"
              onClick={() => setMobileOpen(false)}
              className="caption uppercase tracking-[0.14em] text-carbon"
            >
              Carrito {count > 0 && `(${count})`}
            </Link>
          </div>
        </div>
      </aside>
    </header>
  );
}
