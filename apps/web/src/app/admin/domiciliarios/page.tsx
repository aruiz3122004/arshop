"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  Check,
  Filter,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  apiAdminCreateDelivery,
  apiAdminDeleteDelivery,
  apiAdminListDeliveries,
  apiAdminUpdateDelivery,
  type DeliveryAvailability,
  type Domiciliario,
} from "@/lib/api";
import { COLOMBIA } from "@/lib/colombia";
import { highlight, normalize, scoreField, tokenize } from "@/lib/search";

type Row = Awaited<ReturnType<typeof apiAdminListDeliveries>>[number];

const DISPONIBILIDAD: DeliveryAvailability[] = [
  "DISPONIBLE",
  "OCUPADO",
  "INACTIVO",
];

type FilterDropdown = "location" | "disponibilidad" | null;

export default function AdminDomiciliariosPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<null | { mode: "create" } | { mode: "edit"; row: Row }>(null);

  // Filtros y búsqueda inteligente
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepto, setSelectedDepto] = useState<string>("ALL");
  const [selectedCity, setSelectedCity] = useState<string>("ALL");
  const [selectedDisponibilidad, setSelectedDisponibilidad] = useState<
    DeliveryAvailability | "ALL"
  >("ALL");

  const [openDropdown, setOpenDropdown] = useState<FilterDropdown>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiAdminListDeliveries());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cerrar dropdown al hacer click fuera o presionar Escape
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

  async function remove(id: string) {
    if (!confirm("¿Eliminar este domiciliario?")) return;
    try {
      await apiAdminDeleteDelivery(id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Opciones únicas disponibles en los datos
  const availableDeptos = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.departamento) set.add(r.departamento);
    });
    return Array.from(set).sort();
  }, [rows]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.ciudad) set.add(r.ciudad);
    });
    return Array.from(set).sort();
  }, [rows]);

  // Motor de filtrado y búsqueda inteligente conectada al motor de la app
  const { filteredRows, searchMatchedTokens } = useMemo(() => {
    let list = [...rows];

    if (selectedDepto !== "ALL") {
      list = list.filter((r) => r.departamento === selectedDepto);
    }
    if (selectedCity !== "ALL") {
      list = list.filter((r) => r.ciudad === selectedCity);
    }
    if (selectedDisponibilidad !== "ALL") {
      list = list.filter((r) => r.disponibilidad === selectedDisponibilidad);
    }

    const q = searchQuery.trim();
    const matchedTokens = new Set<string>();

    if (!q) {
      return { filteredRows: list, searchMatchedTokens: matchedTokens };
    }

    const tokens = tokenize(q);
    if (tokens.length === 0) {
      const normQ = normalize(q);
      const matchedList = list.filter((r) => {
        const haystack = normalize(
          `${r.nombre_completo} ${r.user?.email || ""} ${r.ciudad} ${r.departamento} ${r.vehiculo} ${r.placa} ${r.ciudad_placa || ""} ${r.disponibilidad}`,
        );
        if (haystack.includes(normQ)) {
          matchedTokens.add(normQ);
          return true;
        }
        return false;
      });
      return { filteredRows: matchedList, searchMatchedTokens: matchedTokens };
    }

    // Puntuar usando motor inteligente de la app con tolerancia a typos y ponderación
    const scored: { row: Row; score: number }[] = [];
    for (const r of list) {
      const rowTokensMatched = new Set<string>();
      let totalScore = 0;
      let allTokensMatch = true;

      const fields = [
        { raw: r.nombre_completo, weight: 1.0 },
        { raw: r.user?.email || "", weight: 0.9 },
        { raw: r.ciudad, weight: 0.95 },
        { raw: r.departamento, weight: 0.8 },
        { raw: r.placa, weight: 1.0 },
        { raw: r.vehiculo, weight: 0.85 },
        { raw: r.ciudad_placa || "", weight: 0.7 },
        { raw: r.disponibilidad, weight: 0.6 },
      ];

      for (const token of tokens) {
        let bestFieldScore = 0;
        for (const f of fields) {
          if (!f.raw) continue;
          const s = scoreField(token, f.raw);
          if (s > 0) {
            rowTokensMatched.add(token);
            const weighted = s * f.weight;
            if (weighted > bestFieldScore) bestFieldScore = weighted;
          }
        }
        if (bestFieldScore <= 0) {
          allTokensMatch = false;
          break;
        }
        totalScore += bestFieldScore;
      }

      if (allTokensMatch) {
        scored.push({ row: r, score: totalScore });
        for (const t of rowTokensMatched) matchedTokens.add(t);
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      filteredRows: scored.map((s) => s.row),
      searchMatchedTokens: matchedTokens,
    };
  }, [rows, selectedDepto, selectedCity, selectedDisponibilidad, searchQuery]);

  const isLocationActive = selectedDepto !== "ALL" || selectedCity !== "ALL";
  const isDisponibilidadActive = selectedDisponibilidad !== "ALL";
  const hasActiveFilters =
    searchQuery.trim().length > 0 || isLocationActive || isDisponibilidadActive;

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedDepto("ALL");
    setSelectedCity("ALL");
    setSelectedDisponibilidad("ALL");
    setOpenDropdown(null);
  };

  const toggleDropdown = (key: "location" | "disponibilidad") => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  return (
    <section>
      <div className="flex flex-col gap-4 border-b border-smoke pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-2xl text-carbon">
                Domiciliarios ({filteredRows.length}
                {hasActiveFilters && filteredRows.length !== rows.length
                  ? ` de ${rows.length}`
                  : ""}
                )
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="caption text-[11px] text-graphite hover:text-carbon underline underline-offset-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            <p className="caption text-graphite text-[12px] mt-0.5">
              Gestiona los repartidores y su disponibilidad geográfica.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpenForm({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider hover:bg-carbon/85 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>

        {/* BARRA DE BÚSQUEDA INTELIGENTE */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-lg min-w-[240px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Búsqueda inteligente (nombre, email, ciudad, placa, vehículo...)"
              className="w-full bg-paper border border-smoke pl-9 pr-9 py-2 text-[12px] caption text-carbon placeholder:text-graphite/60 focus:border-carbon transition-colors outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-graphite hover:text-carbon transition-colors cursor-pointer"
                title="Borrar búsqueda"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          {/* Chips de filtros activos */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedDepto !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-stone border border-smoke text-carbon">
                  Depto: <strong>{selectedDepto}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedDepto("ALL")}
                    className="p-0.5 hover:text-red-600 cursor-pointer"
                    title="Quitar filtro de departamento"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {selectedCity !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-stone border border-smoke text-carbon">
                  Ciudad: <strong>{selectedCity}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedCity("ALL")}
                    className="p-0.5 hover:text-red-600 cursor-pointer"
                    title="Quitar filtro de ciudad"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {selectedDisponibilidad !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-stone border border-smoke text-carbon">
                  Estado: <strong>{selectedDisponibilidad}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedDisponibilidad("ALL")}
                    className="p-0.5 hover:text-red-600 cursor-pointer"
                    title="Quitar filtro de estado"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {searchQuery.trim() && (
        <div className="mt-3 flex items-center justify-between bg-stone/40 border border-smoke px-3 py-1.5 caption text-[11px] text-graphite">
          <span>
            Búsqueda inteligente para &ldquo;
            <strong className="text-carbon">{searchQuery}</strong>&rdquo;:{" "}
            {filteredRows.length} domiciliario(s) encontrado(s)
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-graphite hover:text-carbon underline underline-offset-2 ml-2 cursor-pointer"
          >
            Quitar búsqueda
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-graphite" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-12 text-center">
          <Bike className="mx-auto h-10 w-10 text-graphite" />
          <p className="mt-2 text-sm text-graphite">
            Sin domiciliarios registrados.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto min-h-[300px]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-smoke caption uppercase tracking-wider text-[11px] text-graphite select-none">
                <th className="text-left py-2 px-2">Nombre</th>

                {/* BOTÓN DE FILTROS: DEPTO / CIUDAD */}
                <th className="text-left py-2 px-2">
                  <div
                    ref={openDropdown === "location" ? dropdownRef : null}
                    className="relative inline-flex items-center gap-1.5"
                  >
                    <span
                      onClick={() => toggleDropdown("location")}
                      className={`cursor-pointer hover:text-carbon transition-colors ${
                        isLocationActive ? "text-carbon font-semibold" : ""
                      }`}
                    >
                      Depto / Ciudad
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDropdown("location");
                      }}
                      className={`p-0.5 transition-colors cursor-pointer ${
                        isLocationActive
                          ? "text-carbon"
                          : "text-graphite/40 hover:text-carbon"
                      }`}
                      title="Filtrar por departamento o ciudad"
                    >
                      <Filter
                        size={11}
                        className={isLocationActive ? "fill-carbon text-carbon" : ""}
                      />
                    </button>

                    {openDropdown === "location" && (
                      <div className="absolute left-0 top-full mt-2 z-50 min-w-[210px] max-h-80 overflow-y-auto bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                        <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                          Filtrar ubicación
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDepto("ALL");
                            setSelectedCity("ALL");
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${
                            !isLocationActive
                              ? "text-carbon font-semibold bg-stone/30"
                              : "text-graphite"
                          }`}
                        >
                          <span>Todas las ubicaciones</span>
                          {!isLocationActive && (
                            <Check size={12} className="text-carbon" />
                          )}
                        </button>

                        {availableDeptos.length > 0 && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-t border-b border-smoke/60 mt-1">
                              Por Departamento
                            </div>
                            {availableDeptos.map((d) => {
                              const isSelected =
                                selectedDepto === d && selectedCity === "ALL";
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDepto(d);
                                    setSelectedCity("ALL");
                                    setOpenDropdown(null);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${
                                    isSelected
                                      ? "text-carbon font-semibold bg-stone/30"
                                      : "text-graphite"
                                  }`}
                                >
                                  <span>{d}</span>
                                  {isSelected && (
                                    <Check size={12} className="text-carbon" />
                                  )}
                                </button>
                              );
                            })}
                          </>
                        )}

                        {availableCities.length > 0 && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-t border-b border-smoke/60 mt-1">
                              Por Ciudad
                            </div>
                            {availableCities.map((c) => {
                              const isSelected = selectedCity === c;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCity(c);
                                    setSelectedDepto("ALL");
                                    setOpenDropdown(null);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${
                                    isSelected
                                      ? "text-carbon font-semibold bg-stone/30"
                                      : "text-graphite"
                                  }`}
                                >
                                  <span>{c}</span>
                                  {isSelected && (
                                    <Check size={12} className="text-carbon" />
                                  )}
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </th>

                <th className="text-left py-2 px-2">Vehículo · Placa</th>

                {/* BOTÓN DE FILTROS: DISPONIBILIDAD */}
                <th className="text-left py-2 px-2">
                  <div
                    ref={openDropdown === "disponibilidad" ? dropdownRef : null}
                    className="relative inline-flex items-center gap-1.5"
                  >
                    <span
                      onClick={() => toggleDropdown("disponibilidad")}
                      className={`cursor-pointer hover:text-carbon transition-colors ${
                        isDisponibilidadActive ? "text-carbon font-semibold" : ""
                      }`}
                    >
                      Disponibilidad
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDropdown("disponibilidad");
                      }}
                      className={`p-0.5 transition-colors cursor-pointer ${
                        isDisponibilidadActive
                          ? "text-carbon"
                          : "text-graphite/40 hover:text-carbon"
                      }`}
                      title="Filtrar por disponibilidad"
                    >
                      <Filter
                        size={11}
                        className={
                          isDisponibilidadActive ? "fill-carbon text-carbon" : ""
                        }
                      />
                    </button>

                    {openDropdown === "disponibilidad" && (
                      <div className="absolute left-0 top-full mt-2 z-50 min-w-[170px] bg-paper border border-smoke shadow-lg py-1 normal-case tracking-normal">
                        <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-graphite/70 font-semibold border-b border-smoke/60">
                          Filtrar disponibilidad
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDisponibilidad("ALL");
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${
                            selectedDisponibilidad === "ALL"
                              ? "text-carbon font-semibold bg-stone/30"
                              : "text-graphite"
                          }`}
                        >
                          <span>Todos</span>
                          {selectedDisponibilidad === "ALL" && (
                            <Check size={12} className="text-carbon" />
                          )}
                        </button>
                        {DISPONIBILIDAD.map((d) => {
                          const isSelected = selectedDisponibilidad === d;
                          const label =
                            d === "DISPONIBLE"
                              ? "Disponible"
                              : d === "OCUPADO"
                                ? "Ocupado"
                                : "Inactivo";
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setSelectedDisponibilidad(d);
                                setOpenDropdown(null);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] caption uppercase tracking-wider flex items-center justify-between hover:bg-stone/60 transition-colors ${
                                isSelected
                                  ? "text-carbon font-semibold bg-stone/30"
                                  : "text-graphite"
                              }`}
                            >
                              <span>{label}</span>
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

                <th className="text-right py-2 px-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-smoke/60 hover:bg-stone/20 transition-colors">
                  <td className="py-3 px-2">
                    <div className="font-medium text-carbon">
                      <HighlightedText
                        text={r.nombre_completo}
                        matched={searchMatchedTokens}
                      />
                    </div>
                    <div className="caption text-[11px] text-graphite">
                      <HighlightedText
                        text={r.user?.email ?? "—"}
                        matched={searchMatchedTokens}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <HighlightedText
                      text={r.departamento}
                      matched={searchMatchedTokens}
                    />{" "}
                    /{" "}
                    <strong>
                      <HighlightedText
                        text={r.ciudad}
                        matched={searchMatchedTokens}
                      />
                    </strong>
                  </td>
                  <td className="py-3 px-2">
                    <HighlightedText
                      text={r.vehiculo}
                      matched={searchMatchedTokens}
                    />{" "}
                    ·{" "}
                    <span className="font-mono">
                      <HighlightedText
                        text={r.placa}
                        matched={searchMatchedTokens}
                      />
                    </span>
                    <div className="caption text-[11px] text-graphite">
                      <HighlightedText
                        text={r.ciudad_placa}
                        matched={searchMatchedTokens}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <StatusBadge value={r.disponibilidad} />
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => setOpenForm({ mode: "edit", row: r })}
                        className="p-2 border border-smoke hover:border-carbon cursor-pointer"
                        aria-label="Editar"
                      >
                        <PencilLine size={14} />
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="p-2 border border-smoke hover:border-red-500 hover:text-red-500 cursor-pointer"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRows.length === 0 && (
            <div className="py-12 text-center border-b border-smoke">
              <Bike className="mx-auto h-8 w-8 text-graphite/60" />
              <p className="mt-2 text-sm text-graphite">
                No se encontraron domiciliarios con los filtros seleccionados.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 inline-flex items-center gap-1.5 border border-carbon px-3 py-1.5 text-[11px] uppercase tracking-wider text-carbon hover:bg-carbon hover:text-paper transition-colors cursor-pointer"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {openForm && (
        <FormModal
          initial={openForm.mode === "edit" ? openForm.row : undefined}
          onClose={() => setOpenForm(null)}
          onSaved={async () => {
            setOpenForm(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function HighlightedText({
  text,
  matched,
}: {
  text: string;
  matched: Set<string>;
}) {
  if (!text) return null;
  if (!matched || matched.size === 0) return <>{text}</>;
  const parts = highlight(text, matched);
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className="bg-amber-100 text-carbon font-semibold px-0.5 rounded-none"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function StatusBadge({ value }: { value: DeliveryAvailability }) {
  const label =
    value === "DISPONIBLE" ? "Disponible" : value === "OCUPADO" ? "Ocupado" : "Inactivo";
  const classes =
    value === "DISPONIBLE"
      ? "border-green-500/40 text-green-700 bg-green-50"
      : value === "OCUPADO"
        ? "border-amber-500/40 text-amber-700 bg-amber-50"
        : "border-smoke text-graphite bg-smoke/40";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] uppercase tracking-wider border ${classes}`}>
      {label}
    </span>
  );
}

function FormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Domiciliario;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombreCompleto: initial?.nombre_completo ?? "",
    email: "",
    password: "",
    departamento: initial?.departamento ?? "Atlántico",
    ciudad: initial?.ciudad ?? "",
    vehiculo: initial?.vehiculo ?? "",
    placa: initial?.placa ?? "",
    ciudadPlaca: initial?.ciudad_placa ?? "",
    disponibilidad: (initial?.disponibilidad ?? "DISPONIBLE") as DeliveryAvailability,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cities = useMemo(() => {
    const dept = COLOMBIA.find((d) => d.name === form.departamento);
    return dept?.cities ?? [];
  }, [form.departamento]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (initial) {
        await apiAdminUpdateDelivery(initial.id, {
          nombre_completo: form.nombreCompleto,
          departamento: form.departamento,
          ciudad: form.ciudad,
          vehiculo: form.vehiculo,
          placa: form.placa,
          ciudad_placa: form.ciudadPlaca,
          disponibilidad: form.disponibilidad,
        });
      } else {
        await apiAdminCreateDelivery({
          nombreCompleto: form.nombreCompleto,
          email: form.email,
          password: form.password,
          departamento: form.departamento,
          ciudad: form.ciudad,
          vehiculo: form.vehiculo,
          placa: form.placa,
          ciudadPlaca: form.ciudadPlaca,
          disponibilidad: form.disponibilidad,
        });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-lg bg-paper border border-carbon">
        <div className="flex items-center justify-between border-b border-smoke px-5 py-3">
          <h3 className="font-serif text-lg text-carbon">
            {initial ? "Editar domiciliario" : "Nuevo domiciliario"}
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-graphite hover:text-carbon">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Nombre completo" required>
            <input
              required
              value={form.nombreCompleto}
              onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
              className="input"
            />
          </Field>

          {!initial && (
            <>
              <Field label="Email de la cuenta" required>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                  placeholder="repartidor@arshop.co"
                />
              </Field>
              <Field label="Contraseña (mínimo 8)" required>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Departamento" required>
              <select
                className="input"
                value={form.departamento}
                onChange={(e) => setForm({ ...form, departamento: e.target.value, ciudad: "" })}
              >
                {COLOMBIA.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ciudad" required>
              <select
                className="input"
                required
                value={form.ciudad}
                onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
              >
                <option value="">Elige…</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehículo (marca y modelo)" required>
              <input
                required
                value={form.vehiculo}
                onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}
                className="input"
                placeholder="Suzuki AX100"
              />
            </Field>
            <Field label="Placa" required>
              <input
                required
                value={form.placa}
                onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                className="input font-mono uppercase"
                placeholder="JHT-156"
              />
            </Field>
          </div>

          <Field label="Ciudad de la placa">
            <input
              value={form.ciudadPlaca}
              onChange={(e) => setForm({ ...form, ciudadPlaca: e.target.value })}
              className="input"
              placeholder="Barranquilla"
            />
          </Field>

          <Field label="Disponibilidad">
            <select
              className="input"
              value={form.disponibilidad}
              onChange={(e) => setForm({ ...form, disponibilidad: e.target.value as DeliveryAvailability })}
            >
              {DISPONIBILIDAD.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          {err && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-smoke">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] border border-smoke">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-[12px] bg-carbon text-paper disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid var(--color-smoke, #e5e5e5);
          padding: 8px 10px;
          font-size: 13px;
          background: #fff;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block caption uppercase tracking-wider text-[10px] text-graphite mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
