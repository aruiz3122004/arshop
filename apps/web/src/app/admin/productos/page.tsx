"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shirt,
  Trash2,
  X,
} from "lucide-react";
import {
  apiAdminDeleteProduct,
  apiExportProductsJson,
  apiSearchProducts,
  fetchAdminProducts,
  type AdminProduct,
} from "@/lib/api";
import { CATEGORIES, formatPrice } from "@/lib/catalog";
import { SmartImage } from "@/components/smart-image";

type FilterDropdown = "gender" | "category" | "price" | "variants" | "status" | null;

const PAGE_SIZE = 20;
const MAX_PAGES = 20;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Pagination state (20 per page, max 20 pages)
  const [currentPage, setCurrentPage] = useState(1);

  // JSON export state
  const [isExporting, setIsExporting] = useState(false);

  // Search state (Isolated Full-Text / Elasticsearch)
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AdminProduct[] | null>(null);
  const [searchMeta, setSearchMeta] = useState<{ total: number; tookMs: number; source: string } | null>(null);

  // Filters state
  const [openDropdown, setOpenDropdown] = useState<FilterDropdown>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [genderFilter, setGenderFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priceRangeFilter, setPriceRangeFilter] = useState<string>("ALL");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const [variantFilter, setVariantFilter] = useState<string>("ALL");
  const [variantSort, setVariantSort] = useState<"none" | "desc" | "asc">("none");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "inactive">("ALL");

  const load = async () => {
    try {
      const list = await fetchAdminProducts();
      setProducts(list);
    } catch (err: any) {
      setError(err?.message || "Error cargando productos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Debounced smart search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearchMeta(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiSearchProducts(q, { includeInactive: true });
        setSearchResults(res.results);
        setSearchMeta({ total: res.total, tookMs: res.tookMs, source: res.source });
      } catch (err: any) {
        console.error("Error en búsqueda inteligente:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click or escape
  useEffect(() => {
    if (!openDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdown]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiAdminDeleteProduct(id);
      if (res.archived) {
        setNotice(
          "Este producto tiene pedidos asociados, así que no se borró para conservar el histórico: quedó inactivo (oculto del catálogo).",
        );
      }
      setConfirmId(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "No se pudo eliminar.");
    } finally {
      setBusyId(null);
    }
  };

  // Distinct options from data
  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.gender) set.add(p.gender);
    });
    return Array.from(set).sort();
  }, [products]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const formatCategoryLabel = (slug: string) => {
    const found = CATEGORIES.find((c) => c.slug === slug);
    if (found) return found.label;
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // Filter & sort logic (applies on search results or full product list)
  const filteredProducts = useMemo(() => {
    let list = searchResults !== null ? [...searchResults] : [...products];

    if (genderFilter !== "ALL") {
      list = list.filter(
        (p) => (p.gender || "").toLowerCase() === genderFilter.toLowerCase(),
      );
    }

    if (categoryFilter !== "ALL") {
      list = list.filter((p) => p.category === categoryFilter);
    }

    if (priceRangeFilter === "under_150k") {
      list = list.filter((p) => p.price < 150000);
    } else if (priceRangeFilter === "150k_300k") {
      list = list.filter((p) => p.price >= 150000 && p.price <= 300000);
    } else if (priceRangeFilter === "over_300k") {
      list = list.filter((p) => p.price > 300000);
    }

    if (variantFilter === "has_variants") {
      list = list.filter((p) => (p.variants?.length ?? 0) > 0);
    } else if (variantFilter === "no_variants") {
      list = list.filter((p) => (p.variants?.length ?? 0) === 0);
    }

    if (statusFilter === "active") {
      list = list.filter((p) => p.active);
    } else if (statusFilter === "inactive") {
      list = list.filter((p) => !p.active);
    }

    if (priceSort === "asc") {
      list.sort((a, b) => a.price - b.price);
    } else if (priceSort === "desc") {
      list.sort((a, b) => b.price - a.price);
    } else if (variantSort === "desc") {
      list.sort((a, b) => (b.variants?.length ?? 0) - (a.variants?.length ?? 0));
    } else if (variantSort === "asc") {
      list.sort((a, b) => (a.variants?.length ?? 0) - (b.variants?.length ?? 0));
    }

    return list;
  }, [
    products,
    searchResults,
    genderFilter,
    categoryFilter,
    priceRangeFilter,
    priceSort,
    variantFilter,
    variantSort,
    statusFilter,
  ]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    genderFilter,
    categoryFilter,
    priceRangeFilter,
    priceSort,
    variantFilter,
    variantSort,
    statusFilter,
  ]);

  // Paginación: 20 productos por página, máximo 20 páginas
  const totalPages = Math.min(
    Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE)),
    MAX_PAGES,
  );

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  const startItem =
    filteredProducts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, filteredProducts.length);

  // Descarga asíncrona de catálogo JSON de TODOS los registros totales (sin tocar DB principal y sin limitarse a la página actual)
  const handleExportJson = async () => {
    setIsExporting(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiExportProductsJson();
      // Garantizar que incluya TODOS los registros totales del catálogo
      const allRecords =
        data.products && data.products.length > 0 ? data.products : products;

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        totalProducts: allRecords.length,
        source: data.source || "isolated-search-engine",
        scope: "CATALOGO_COMPLETO_TODOS_LOS_REGISTROS",
        products: allRecords,
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `arshop_catalogo_completo_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(
        `Catálogo exportado exitosamente: ${allRecords.length} productos totales incluidos en el JSON (sin limitarse a la página actual y sin afectar la base de datos principal).`,
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo descargar el archivo JSON.");
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    genderFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    priceRangeFilter !== "ALL" ||
    priceSort !== "none" ||
    variantFilter !== "ALL" ||
    variantSort !== "none" ||
    statusFilter !== "ALL";

  const clearAllFilters = () => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchMeta(null);
    setGenderFilter("ALL");
    setCategoryFilter("ALL");
    setPriceRangeFilter("ALL");
    setPriceSort("none");
    setVariantFilter("ALL");
    setVariantSort("none");
    setStatusFilter("ALL");
    setOpenDropdown(null);
    setCurrentPage(1);
  };

  const toggleDropdown = (key: FilterDropdown) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  const isGenderActive = genderFilter !== "ALL";
  const isCategoryActive = categoryFilter !== "ALL";
  const isPriceActive = priceRangeFilter !== "ALL" || priceSort !== "none";
  const isVariantsActive = variantFilter !== "ALL" || variantSort !== "none";
  const isStatusActive = statusFilter !== "ALL";

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-xl text-carbon whitespace-nowrap">
            Productos ({filteredProducts.length}
            {hasActiveFilters && filteredProducts.length !== products.length
              ? ` de ${products.length}`
              : ""})
          </h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="caption text-[11px] text-graphite hover:text-carbon underline underline-offset-2 transition-colors whitespace-nowrap"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* BARRA DE BÚSQUEDA INTELIGENTE */}
        <div className="relative flex-1 max-w-md min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Búsqueda inteligente (nombre, slug, SKU, tela...)"
            className="w-full bg-paper border border-smoke pl-9 pr-9 py-2 text-[12px] caption text-carbon placeholder:text-graphite/60 focus:border-carbon transition-colors outline-none"
          />
          {isSearching ? (
            <Loader2
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-graphite"
            />
          ) : searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-graphite hover:text-carbon transition-colors"
              title="Borrar búsqueda"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={isExporting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 border border-smoke bg-paper px-3 py-2 caption uppercase tracking-widest text-carbon hover:border-carbon transition-colors text-[11px] disabled:opacity-50 whitespace-nowrap cursor-pointer sm:flex-initial"
            title="Descargar catálogo completo en formato JSON de forma asíncrona (desde motor aislado)"
          >
            {isExporting ? (
              <Loader2 size={13} className="animate-spin text-graphite" />
            ) : (
              <Download size={14} className="text-graphite" />
            )}
            <span>Exportar</span>
          </button>

          <Link
            href="/admin/productos/nuevo"
            className="inline-flex flex-1 items-center justify-center gap-2 border border-carbon bg-carbon px-4 py-2 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors text-[11px] whitespace-nowrap sm:flex-initial"
          >
            <Plus size={14} /> Nuevo producto
          </Link>
        </div>
      </div>

      {searchMeta && searchQuery.trim() && (
        <div className="flex items-center justify-between bg-stone/40 border border-smoke px-3 py-1.5 caption text-[11px] text-graphite">
          <span>
            Búsqueda inteligente para &ldquo;
            <strong className="text-carbon">{searchQuery}</strong>&rdquo;:{" "}
            {filteredProducts.length} producto(s) encontrado(s) en {searchMeta.tookMs} ms
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-graphite hover:text-carbon underline underline-offset-2 ml-2"
          >
            Quitar búsqueda
          </button>
        </div>
      )}

      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-smoke bg-paper p-3 caption text-[12px] text-graphite">
          {notice}
        </div>
      )}

      {/* Barra superior de estado y paginación rápida (evita tener que bajar al fondo de la página) */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-[11px] caption text-graphite">
        <div>
          Mostrando <strong className="text-carbon">{startItem}</strong>–
          <strong className="text-carbon">{endItem}</strong> de{" "}
          <strong className="text-carbon">{filteredProducts.length}</strong> productos
          {filteredProducts.length !== products.length && (
            <span className="text-[10px] ml-1 text-graphite/70">
              ({products.length} en catálogo)
            </span>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 border border-smoke bg-paper hover:border-carbon transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 uppercase tracking-wider text-[10px] text-carbon cursor-pointer"
              title="Página anterior"
            >
              <ChevronLeft size={11} />
              <span>Anterior</span>
            </button>
            <span className="px-2 font-mono text-[11px] text-carbon">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || currentPage >= MAX_PAGES}
              className="px-2.5 py-1 border border-smoke bg-paper hover:border-carbon transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 uppercase tracking-wider text-[10px] text-carbon cursor-pointer"
              title="Página siguiente"
            >
              <span>Siguiente</span>
              <ChevronRight size={11} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-smoke min-h-[360px]">
        <table className="min-w-full text-left">
          <thead className="bg-stone/30 border-b border-smoke">
            <tr className="caption uppercase tracking-wider text-[10px] text-graphite select-none">
              <th className="px-4 py-3">Imagen</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Nombre</th>

              {/* GÉNERO FILTER */}
              <th className="px-4 py-3">
                <div
                  ref={openDropdown === "gender" ? dropdownRef : null}
                  className="relative inline-flex items-center gap-1.5"
                >
                  <span
                    onClick={() => toggleDropdown("gender")}
                    className={`cursor-pointer hover:text-carbon transition-colors ${isGenderActive ? "text-carbon font-semibold" : ""
                      }`}
                  >
                    Género
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDropdown("gender");
                    }}
                    className={`p-0.5 transition-colors ${isGenderActive
                      ? "text-carbon"
                      : "text-graphite/40 hover:text-carbon"
                      }`}
                    title="Filtrar por género"
                  >
                    <Filter
                      size={11}
                      className={isGenderActive ? "fill-carbon text-carbon" : ""}
                    />
                  </button>

                  {openDropdown === "gender" && (
                    <div className="absolute left-0 top-full mt-2 z-50 min-w-[150px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                        Filtrar género
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGenderFilter("ALL");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${genderFilter === "ALL"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Todos</span>
                        {genderFilter === "ALL" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      {availableGenders.map((g) => {
                        const isSelected =
                          genderFilter.toLowerCase() === g.toLowerCase();
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              setGenderFilter(g);
                              setOpenDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors capitalize ${isSelected
                              ? "text-carbon font-semibold bg-stone/30"
                              : "text-graphite"
                              }`}
                          >
                            <span>{g}</span>
                            {isSelected && (
                              <Check size={12} className="text-carbon" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </th>

              {/* CATEGORÍA FILTER */}
              <th className="px-4 py-3">
                <div
                  ref={openDropdown === "category" ? dropdownRef : null}
                  className="relative inline-flex items-center gap-1.5"
                >
                  <span
                    onClick={() => toggleDropdown("category")}
                    className={`cursor-pointer hover:text-carbon transition-colors ${isCategoryActive ? "text-carbon font-semibold" : ""
                      }`}
                  >
                    Categoría
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDropdown("category");
                    }}
                    className={`p-0.5 transition-colors ${isCategoryActive
                      ? "text-carbon"
                      : "text-graphite/40 hover:text-carbon"
                      }`}
                    title="Filtrar por categoría"
                  >
                    <Filter
                      size={11}
                      className={isCategoryActive ? "fill-carbon text-carbon" : ""}
                    />
                  </button>

                  {openDropdown === "category" && (
                    <div className="absolute left-0 top-full mt-2 z-50 min-w-[170px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal max-h-72 overflow-y-auto">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                        Filtrar categoría
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter("ALL");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${categoryFilter === "ALL"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Todas</span>
                        {categoryFilter === "ALL" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      {availableCategories.map((c) => {
                        const isSelected = categoryFilter === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setCategoryFilter(c);
                              setOpenDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${isSelected
                              ? "text-carbon font-semibold bg-stone/30"
                              : "text-graphite"
                              }`}
                          >
                            <span>{formatCategoryLabel(c)}</span>
                            {isSelected && (
                              <Check size={12} className="text-carbon" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </th>

              {/* PRECIO FILTER & SORT */}
              <th className="px-4 py-3">
                <div
                  ref={openDropdown === "price" ? dropdownRef : null}
                  className="relative inline-flex items-center gap-1.5"
                >
                  <span
                    onClick={() => toggleDropdown("price")}
                    className={`cursor-pointer hover:text-carbon transition-colors ${isPriceActive ? "text-carbon font-semibold" : ""
                      }`}
                  >
                    Precio
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDropdown("price");
                    }}
                    className={`p-0.5 transition-colors ${isPriceActive
                      ? "text-carbon"
                      : "text-graphite/40 hover:text-carbon"
                      }`}
                    title="Filtrar u ordenar por precio"
                  >
                    <Filter
                      size={11}
                      className={isPriceActive ? "fill-carbon text-carbon" : ""}
                    />
                  </button>

                  {openDropdown === "price" && (
                    <div className="absolute left-0 top-full mt-2 z-50 min-w-[190px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                        Ordenar
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceSort("none");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceSort === "none"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Sin ordenar</span>
                        {priceSort === "none" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceSort("asc");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceSort === "asc"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Menor a mayor</span>
                        {priceSort === "asc" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceSort("desc");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceSort === "desc"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Mayor a menor</span>
                        {priceSort === "desc" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>

                      <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-t border-b border-smoke/60 mt-1">
                        Rango de precio
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceRangeFilter("ALL");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceRangeFilter === "ALL"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Todos los precios</span>
                        {priceRangeFilter === "ALL" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceRangeFilter("under_150k");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceRangeFilter === "under_150k"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Hasta $ 150.000</span>
                        {priceRangeFilter === "under_150k" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceRangeFilter("150k_300k");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceRangeFilter === "150k_300k"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>$ 150.000 – $ 300.000</span>
                        {priceRangeFilter === "150k_300k" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceRangeFilter("over_300k");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${priceRangeFilter === "over_300k"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Más de $ 300.000</span>
                        {priceRangeFilter === "over_300k" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </th>

              {/* VARIANTES FILTER & SORT */}
              <th className="px-4 py-3">
                <div
                  ref={openDropdown === "variants" ? dropdownRef : null}
                  className="relative inline-flex items-center gap-1.5"
                >
                  <span
                    onClick={() => toggleDropdown("variants")}
                    className={`cursor-pointer hover:text-carbon transition-colors ${isVariantsActive ? "text-carbon font-semibold" : ""
                      }`}
                  >
                    Variantes
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDropdown("variants");
                    }}
                    className={`p-0.5 transition-colors ${isVariantsActive
                      ? "text-carbon"
                      : "text-graphite/40 hover:text-carbon"
                      }`}
                    title="Filtrar u ordenar variantes"
                  >
                    <Filter
                      size={11}
                      className={isVariantsActive ? "fill-carbon text-carbon" : ""}
                    />
                  </button>

                  {openDropdown === "variants" && (
                    <div className="absolute left-0 top-full mt-2 z-50 min-w-[190px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                        Filtrar
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantFilter("ALL");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantFilter === "ALL"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Todas</span>
                        {variantFilter === "ALL" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantFilter("has_variants");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantFilter === "has_variants"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Con variantes (&gt; 0)</span>
                        {variantFilter === "has_variants" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantFilter("no_variants");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantFilter === "no_variants"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Sin variantes (0)</span>
                        {variantFilter === "no_variants" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>

                      <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-t border-b border-smoke/60 mt-1">
                        Ordenar
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantSort("none");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantSort === "none"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Sin ordenar</span>
                        {variantSort === "none" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantSort("desc");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantSort === "desc"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Mayor cantidad primero</span>
                        {variantSort === "desc" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVariantSort("asc");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${variantSort === "asc"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Menor cantidad primero</span>
                        {variantSort === "asc" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </th>

              {/* ESTADO FILTER */}
              <th className="px-4 py-3">
                <div
                  ref={openDropdown === "status" ? dropdownRef : null}
                  className="relative inline-flex items-center gap-1.5"
                >
                  <span
                    onClick={() => toggleDropdown("status")}
                    className={`cursor-pointer hover:text-carbon transition-colors ${isStatusActive ? "text-carbon font-semibold" : ""
                      }`}
                  >
                    Estado
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDropdown("status");
                    }}
                    className={`p-0.5 transition-colors ${isStatusActive
                      ? "text-carbon"
                      : "text-graphite/40 hover:text-carbon"
                      }`}
                    title="Filtrar por estado"
                  >
                    <Filter
                      size={11}
                      className={isStatusActive ? "fill-carbon text-carbon" : ""}
                    />
                  </button>

                  {openDropdown === "status" && (
                    <div className="absolute right-0 top-full mt-2 z-50 min-w-[150px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                        Filtrar estado
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("ALL");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${statusFilter === "ALL"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Todos</span>
                        {statusFilter === "ALL" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("active");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${statusFilter === "active"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Activo</span>
                        {statusFilter === "active" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("inactive");
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${statusFilter === "inactive"
                          ? "text-carbon font-semibold bg-stone/30"
                          : "text-graphite"
                          }`}
                      >
                        <span>Inactivo</span>
                        {statusFilter === "inactive" && (
                          <Check size={12} className="text-carbon" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </th>

              {/* ACCIONES */}
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map((p, index) => (
              <tr
                key={p.id}
                className={`border-b border-smoke/60 caption text-[13px] text-carbon hover:bg-stone/10 ${p.active ? "" : "opacity-60"
                  }`}
              >
                <td className="px-4 py-2">
                  {p.images[0] ? (
                    <div className="relative h-12 w-10 overflow-hidden border border-smoke bg-stone">
                      <SmartImage
                        src={p.images[0]}
                        alt={p.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                        skeletonDelayMs={(index % 10) * 45}
                        skeletonIcon={<Shirt size={15} strokeWidth={1.25} />}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-12 w-10 items-center justify-center border border-dashed border-smoke text-ash"
                      title="Sin imagen"
                    >
                      <Shirt size={15} strokeWidth={1.25} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[11px]">{p.slug}</td>
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3 capitalize">{p.gender}</td>
                <td className="px-4 py-3">{p.category}</td>
                <td className="px-4 py-3 font-mono text-[12px]">
                  {formatPrice(p.price)}
                </td>
                <td className="px-4 py-3 text-[12px] text-graphite">
                  {p.variants?.length ?? 0}
                </td>
                <td className="px-4 py-3 text-[11px] uppercase tracking-wider">
                  {p.active ? (
                    <span className="text-carbon">Activo</span>
                  ) : (
                    <span className="text-graphite">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {confirmId === p.id ? (
                    <div className="inline-flex items-center justify-end gap-2">
                      <span className="caption text-[11px] text-red-600 font-medium">
                        ¿Eliminar?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        disabled={busyId === p.id}
                        className="p-1 text-red-600 hover:text-red-800 transition-colors"
                        title="Confirmar eliminación"
                      >
                        {busyId === p.id ? (
                          <Loader2 size={15} className="animate-spin inline" />
                        ) : (
                          <Check size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="p-1 text-graphite hover:text-carbon transition-colors"
                        title="Cancelar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center justify-end gap-3 text-graphite">
                      <Link
                        href={`/admin/productos/${p.id}`}
                        className="p-1 text-graphite hover:text-carbon transition-colors"
                        title="Editar producto"
                      >
                        <Pencil size={16} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirmId(p.id)}
                        className="p-1 text-graphite hover:text-red-600 transition-colors"
                        title="Eliminar producto"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center caption text-graphite"
                >
                  {products.length === 0
                    ? "Aún no hay productos."
                    : "No se encontraron productos con los filtros seleccionados."}
                  {hasActiveFilters && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="caption text-[11px] uppercase tracking-wider text-carbon underline underline-offset-4"
                      >
                        Limpiar todos los filtros
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barra de paginación (20 por página, máximo 20 páginas) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3 py-3 px-1 border-t border-smoke/70 caption text-[11px] text-graphite">
          <div>
            Mostrando <strong className="text-carbon">{startItem}</strong>–
            <strong className="text-carbon">{endItem}</strong> de{" "}
            <strong className="text-carbon">{filteredProducts.length}</strong> productos
            {filteredProducts.length > PAGE_SIZE * MAX_PAGES && (
              <span className="text-[10px] ml-1 text-graphite/70">
                (tope de {MAX_PAGES} páginas)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 border border-smoke bg-paper hover:border-carbon transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 uppercase tracking-wider text-[10px] text-carbon cursor-pointer"
            >
              <ChevronLeft size={12} />
              <span>Anterior</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              if (
                totalPages > 7 &&
                pg !== 1 &&
                pg !== totalPages &&
                Math.abs(pg - currentPage) > 2
              ) {
                if (pg === 2 || pg === totalPages - 1) {
                  return (
                    <span key={pg} className="px-1 text-graphite/50">
                      …
                    </span>
                  );
                }
                return null;
              }

              const isCurrent = pg === currentPage;
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  className={`min-w-[28px] h-7 px-1.5 text-center text-[11px] border transition-colors cursor-pointer ${isCurrent
                    ? "border-carbon bg-carbon text-paper font-semibold"
                    : "border-smoke bg-paper text-carbon hover:border-carbon"
                    }`}
                >
                  {pg}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages || currentPage >= MAX_PAGES}
              className="px-2.5 py-1 border border-smoke bg-paper hover:border-carbon transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 uppercase tracking-wider text-[10px] text-carbon cursor-pointer"
            >
              <span>Siguiente</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

