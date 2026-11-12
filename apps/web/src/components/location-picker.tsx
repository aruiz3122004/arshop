"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Check, X } from "lucide-react";
import clsx from "clsx";
import { COLOMBIA } from "@/lib/colombia";
import { useLocation } from "@/lib/location";
import { useDismiss } from "@/lib/use-dismiss";
import { FlagColombia } from "./flag-colombia";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function LocationPicker() {
  const { location, setLocation } = useLocation();
  const [open, setOpen] = useState(false);
  const [draftDept, setDraftDept] = useState(location.department);
  const [deptQuery, setDeptQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<"dept" | "city">("dept");
  const panelRef = useRef<HTMLDivElement>(null);

  useDismiss(panelRef, open, () => setOpen(false));

  const departments = useMemo(() => {
    if (!deptQuery.trim()) return COLOMBIA;
    const q = norm(deptQuery);
    return COLOMBIA.filter((d) => norm(d.name).includes(q));
  }, [deptQuery]);

  const currentCities = useMemo(() => {
    const dept = COLOMBIA.find((d) => d.name === draftDept);
    if (!dept) return [];
    if (!cityQuery.trim()) return dept.cities;
    const q = norm(cityQuery);
    return dept.cities.filter((c) => norm(c).includes(q));
  }, [draftDept, cityQuery]);

  const handleToggle = () => {
    setOpen((v) => {
      if (!v) {
        setDraftDept(location.department);
        setDeptQuery("");
        setCityQuery("");
        setMobileTab("dept");
      }
      return !v;
    });
  };

  const selectCity = (city: string) => {
    setLocation({ department: draftDept, city });
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón trigger responsivo */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Cambiar destino de entrega"
        className="flex items-center gap-1.5 sm:gap-2 py-1.5 pr-1 text-carbon hover:opacity-80 transition-opacity"
      >
        <FlagColombia className="h-3.5 w-5 shrink-0" />
        <span className="caption hidden md:inline tracking-wide">
          {location.city}
          <span className="text-graphite"> · </span>
          <span className="text-graphite">{location.department}</span>
        </span>
        <span className="caption md:hidden text-carbon font-medium truncate max-w-[110px] xs:max-w-[140px]">
          {location.city}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={clsx("transition-transform duration-200 shrink-0", open && "rotate-180")}
        />
      </button>

      {/* Dropdown panel responsivo */}
      {open && (
        <div
          role="dialog"
          aria-label="Selector de ubicación en Colombia"
          className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-12 sm:top-[calc(100%+8px)] z-50 w-auto sm:w-[620px] max-w-[calc(100vw-24px)] border border-smoke bg-paper shadow-2xl"
        >
          {/* Encabezado */}
          <div className="flex items-center justify-between border-b border-smoke px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <FlagColombia className="h-4 w-6 shrink-0" />
              <div className="min-w-0">
                <p className="caption uppercase tracking-[0.14em] text-carbon font-medium truncate">
                  Enviamos en toda Colombia
                </p>
                <p className="caption text-graphite text-[12px] mt-0.5 truncate sm:whitespace-normal">
                  Elige tu departamento y ciudad para calcular envíos y tiempos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-graphite hover:text-carbon sm:hidden"
                aria-label="Cerrar modal"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
              <MapPin size={16} strokeWidth={1.5} className="text-graphite hidden sm:block" />
            </div>
          </div>

          {/* Selector de pestañas para móviles (< sm) */}
          <div className="flex sm:hidden border-b border-smoke bg-stone/30">
            <button
              type="button"
              onClick={() => setMobileTab("dept")}
              className={clsx(
                "flex-1 py-2.5 caption uppercase tracking-wider text-center border-b-2 transition-colors",
                mobileTab === "dept"
                  ? "border-carbon text-carbon font-medium bg-paper"
                  : "border-transparent text-graphite hover:text-carbon",
              )}
            >
              1. Departamento
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("city")}
              className={clsx(
                "flex-1 py-2.5 caption uppercase tracking-wider text-center border-b-2 transition-colors truncate px-2",
                mobileTab === "city"
                  ? "border-carbon text-carbon font-medium bg-paper"
                  : "border-transparent text-graphite hover:text-carbon",
              )}
            >
              2. Ciudad ({draftDept})
            </button>
          </div>

          {/* Dos columnas en sm+, tab switch en móviles */}
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {/* Columna: Departamentos */}
            <div
              className={clsx(
                "border-b border-smoke sm:border-b-0 sm:border-r",
                mobileTab === "city" && "hidden sm:block",
              )}
            >
              <div className="px-4 pt-3 pb-2 sm:px-5 sm:pt-4">
                <label className="caption uppercase tracking-[0.14em] text-graphite">
                  Departamento
                </label>
                <input
                  type="text"
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  placeholder="Buscar departamento"
                  className="caption mt-2 w-full border-b border-ash py-2 text-carbon placeholder:text-ash focus:border-carbon bg-transparent outline-none"
                />
              </div>
              <ul
                className="max-h-60 sm:max-h-72 overflow-y-auto scrollbar-clean"
                role="listbox"
                aria-label="Departamentos"
              >
                {departments.length === 0 && (
                  <li className="caption px-4 py-4 sm:px-5 sm:py-3 text-graphite">
                    Sin resultados
                  </li>
                )}
                {departments.map((d) => {
                  const isSelected = draftDept === d.name;
                  return (
                    <li key={d.name}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setDraftDept(d.name);
                          setCityQuery("");
                          setMobileTab("city");
                        }}
                        className={clsx(
                          "group flex w-full items-center justify-between px-4 py-2.5 sm:px-5 text-left caption transition-colors",
                          isSelected
                            ? "bg-stone text-carbon font-medium"
                            : "text-graphite hover:text-carbon hover:bg-stone/50",
                        )}
                      >
                        <span
                          className={clsx(
                            "transition-colors truncate mr-2",
                            isSelected
                              ? "text-carbon"
                              : "text-graphite group-hover:text-carbon",
                          )}
                        >
                          {d.name}
                        </span>
                        <span
                          className={clsx(
                            "caption transition-colors shrink-0",
                            isSelected
                              ? "text-carbon font-medium"
                              : "text-graphite group-hover:text-carbon",
                          )}
                        >
                          {d.cities.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Columna: Ciudades */}
            <div className={clsx(mobileTab === "dept" && "hidden sm:block")}>
              <div className="px-4 pt-3 pb-2 sm:px-5 sm:pt-4">
                <label className="caption uppercase tracking-[0.14em] text-graphite">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder={`Buscar ciudad en ${draftDept}`}
                  className="caption mt-2 w-full border-b border-ash py-2 text-carbon placeholder:text-ash focus:border-carbon bg-transparent outline-none"
                />
              </div>
              <ul
                className="max-h-60 sm:max-h-72 overflow-y-auto scrollbar-clean"
                role="listbox"
                aria-label="Ciudades"
              >
                {currentCities.length === 0 && (
                  <li className="caption px-4 py-4 sm:px-5 sm:py-3 text-graphite">
                    Sin resultados
                  </li>
                )}
                {currentCities.map((c) => {
                  const active =
                    location.department === draftDept && location.city === c;
                  return (
                    <li key={c}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => selectCity(c)}
                        className={clsx(
                          "group flex w-full items-center justify-between px-4 py-2.5 sm:px-5 text-left caption transition-colors",
                          active
                            ? "bg-stone text-carbon font-medium"
                            : "text-graphite hover:text-carbon hover:bg-stone/50",
                        )}
                      >
                        <span
                          className={clsx(
                            "transition-colors truncate mr-2",
                            active
                              ? "text-carbon font-medium"
                              : "text-graphite group-hover:text-carbon",
                          )}
                        >
                          {c}
                        </span>
                        {active && (
                          <Check
                            size={14}
                            strokeWidth={1.5}
                            className="text-carbon shrink-0"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
