"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  apiAdminUploadProductImage,
  type AdminProductInput,
  type AdminVariantInput,
} from "@/lib/api";
import type { CategorySlug, Gender } from "@/lib/catalog";

const GENDERS: Gender[] = ["hombre", "mujer"];
const CATEGORIES: CategorySlug[] = [
  "camisas",
  "camisetas",
  "tops",
  "ropa-interior",
  "calzado",
  "pantalones",
];

export interface ProductAdminFormProps {
  initial?: Partial<AdminProductInput>;
  submitLabel?: string;
  onSubmit: (dto: AdminProductInput) => Promise<void>;
}

const EMPTY_VARIANT: AdminVariantInput = {
  size: "",
  colorName: "",
  colorHex: "#111111",
  sku: "",
  stock: 0,
};

export function ProductAdminForm({
  initial,
  submitLabel = "Guardar",
  onSubmit,
}: ProductAdminFormProps) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "ARShop");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "hombre");
  const [category, setCategory] = useState<CategorySlug>(
    initial?.category ?? "camisas",
  );
  const [priceCop, setPriceCop] = useState<number>(initial?.priceCop ?? 0);
  const [compareAtPriceCop, setCompareAtPriceCop] = useState<string>(
    initial?.compareAtPriceCop ? String(initial.compareAtPriceCop) : "",
  );
  const [fit, setFit] = useState<"slim" | "regular" | "relaxed" | "oversize">(
    initial?.fit ?? "regular",
  );
  const [imagesRaw, setImagesRaw] = useState<string>(
    initial?.images?.join("\n") ?? "",
  );
  const [variants, setVariants] = useState<AdminVariantInput[]>(
    initial?.variants && initial.variants.length > 0
      ? initial.variants
      : [{ ...EMPTY_VARIANT }],
  );
  const [active, setActive] = useState(initial?.active ?? true);
  // Formato datetime-local esperado: "YYYY-MM-DDTHH:mm" (sin TZ)
  const [dropStartsAt, setDropStartsAt] = useState<string>(
    isoToLocalInput(initial?.dropStartsAt),
  );
  const [dropEndsAt, setDropEndsAt] = useState<string>(
    isoToLocalInput(initial?.dropEndsAt),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const url = await apiAdminUploadProductImage(file);
        uploaded.push(url);
      }
      setImagesRaw((cur) =>
        [cur.trim(), ...uploaded].filter(Boolean).join("\n"),
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const imageList = imagesRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const removeImage = (idx: number) =>
    setImagesRaw(imageList.filter((_, i) => i !== idx).join("\n"));

  /** La primera imagen es la que se muestra en el catálogo. */
  const makePrimary = (idx: number) =>
    setImagesRaw(
      [imageList[idx], ...imageList.filter((_, i) => i !== idx)].join("\n"),
    );

  const updateVariant = <K extends keyof AdminVariantInput>(
    i: number,
    k: K,
    v: AdminVariantInput[K],
  ) => {
    setVariants((cur) => cur.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  };

  const addVariant = () => setVariants((v) => [...v, { ...EMPTY_VARIANT }]);
  const removeVariant = (i: number) =>
    setVariants((v) => (v.length === 1 ? v : v.filter((_, idx) => idx !== i)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const images = imagesRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (images.length === 0) {
      setError("Agrega al menos una URL de imagen.");
      return;
    }

    for (const v of variants) {
      if (!v.size || !v.colorName || !v.sku) {
        setError("Cada variante requiere talla, color y SKU.");
        return;
      }
    }

    const starts = localInputToIso(dropStartsAt);
    const ends = localInputToIso(dropEndsAt);
    if (starts && ends && Date.parse(starts) >= Date.parse(ends)) {
      setError("La fecha de inicio del drop debe ser anterior a la de fin.");
      return;
    }

    const dto: AdminProductInput = {
      slug: slug.trim(),
      name: name.trim(),
      brand: brand.trim(),
      description: description.trim(),
      gender,
      category,
      priceCop: Number(priceCop),
      compareAtPriceCop:
        compareAtPriceCop.trim() && Number(compareAtPriceCop) > 0
          ? Number(compareAtPriceCop)
          : null,
      fit,
      images,
      variants: variants.map((v) => ({
        ...v,
        stock: Number(v.stock),
      })),
      active,
      dropStartsAt: starts,
      dropEndsAt: ends,
    };

    setSaving(true);
    try {
      await onSubmit(dto);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-2">
          Información básica
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Slug *
            </span>
            <input
              required
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="camisa-oxford-blanca"
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Nombre *
            </span>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Marca *
            </span>
            <input
              required
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Precio (COP) *
            </span>
            <input
              required
              type="number"
              min={0}
              value={priceCop}
              onChange={(e) => setPriceCop(Number(e.target.value))}
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Precio antes / Tachado (COP, opcional)
            </span>
            <input
              type="number"
              min={0}
              value={compareAtPriceCop}
              onChange={(e) => setCompareAtPriceCop(e.target.value)}
              placeholder="Ej: 240000"
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Calce / Fit de la prenda
            </span>
            <select
              value={fit}
              onChange={(e) =>
                setFit(e.target.value as "slim" | "regular" | "relaxed" | "oversize")
              }
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors bg-paper"
            >
              <option value="slim">Slim Fit (Entallado)</option>
              <option value="regular">Regular Fit (Clásico)</option>
              <option value="relaxed">Relaxed Fit (Holgado)</option>
              <option value="oversize">Oversize (Amplio)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Género *
            </span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors bg-paper"
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Categoría *
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategorySlug)}
              className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors bg-paper"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Descripción *
            </span>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="caption border border-smoke bg-paper p-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="caption uppercase tracking-wider text-graphite text-[11px]">
                Imágenes (una URL por línea) *
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 border border-smoke bg-paper px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Subiendo...
                  </>
                ) : (
                  <>
                    <Upload size={12} /> Subir imagen
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
            {imageList.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {imageList.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className={`relative w-24 border ${
                      idx === 0 ? "border-carbon" : "border-smoke"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Imagen ${idx + 1}`}
                      className="h-28 w-full object-cover bg-stone/30"
                    />
                    <div className="flex items-center justify-between px-1 py-1 bg-paper">
                      {idx === 0 ? (
                        <span className="caption text-[9px] uppercase tracking-wider text-carbon">
                          Principal
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makePrimary(idx)}
                          className="caption text-[9px] uppercase tracking-wider text-graphite hover:text-carbon"
                          title="Usar como imagen principal"
                        >
                          Principal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="p-0.5 text-graphite hover:text-carbon"
                        title="Quitar imagen"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <textarea
              required
              value={imagesRaw}
              onChange={(e) => setImagesRaw(e.target.value)}
              rows={3}
              placeholder="https://..."
              className="caption border border-smoke bg-paper p-2 text-carbon focus:border-carbon transition-colors font-mono text-[12px]"
            />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-carbon"
            />
            <span className="caption text-graphite text-[12px]">
              Activo (visible en el catálogo)
            </span>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-2">
          Ventana de venta (flash drop)
        </h2>
        <p className="caption text-graphite text-[12px]">
          Déjalos vacíos para que el producto se venda siempre. Si pones solo
          fin, la venta cierra en esa fecha. Si pones solo inicio, no se puede
          comprar antes.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Inicio
            </span>
            <input
              type="datetime-local"
              value={dropStartsAt}
              onChange={(e) => setDropStartsAt(e.target.value)}
              className="caption border border-smoke bg-paper p-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
              Fin
            </span>
            <input
              type="datetime-local"
              value={dropEndsAt}
              onChange={(e) => setDropEndsAt(e.target.value)}
              className="caption border border-smoke bg-paper p-2 text-carbon focus:border-carbon transition-colors"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-carbon pb-2">
          <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
            Variantes
          </h2>
          <button
            type="button"
            onClick={addVariant}
            className="inline-flex items-center gap-1.5 caption text-[11px] uppercase tracking-wider text-carbon border border-smoke bg-paper px-3 py-1.5 hover:border-carbon transition-colors"
          >
            <Plus size={12} /> Añadir
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {variants.map((v, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr_80px_1.5fr_1fr_auto] border border-smoke p-3 items-end"
            >
              <label className="flex flex-col gap-1">
                <span className="caption uppercase tracking-wider text-graphite text-[10px]">
                  Talla
                </span>
                <input
                  required
                  type="text"
                  value={v.size}
                  onChange={(e) => updateVariant(i, "size", e.target.value)}
                  placeholder="M"
                  className="caption border-b border-smoke py-1 text-carbon focus:border-carbon transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="caption uppercase tracking-wider text-graphite text-[10px]">
                  Color (nombre)
                </span>
                <input
                  required
                  type="text"
                  value={v.colorName}
                  onChange={(e) => updateVariant(i, "colorName", e.target.value)}
                  placeholder="Negro"
                  className="caption border-b border-smoke py-1 text-carbon focus:border-carbon transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="caption uppercase tracking-wider text-graphite text-[10px]">
                  Hex
                </span>
                <input
                  type="color"
                  value={v.colorHex}
                  onChange={(e) => updateVariant(i, "colorHex", e.target.value)}
                  className="h-8 w-full border border-smoke"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="caption uppercase tracking-wider text-graphite text-[10px]">
                  SKU
                </span>
                <input
                  required
                  type="text"
                  value={v.sku}
                  onChange={(e) => updateVariant(i, "sku", e.target.value)}
                  placeholder="ARS-001-M-NEG"
                  className="caption border-b border-smoke py-1 text-carbon focus:border-carbon transition-colors font-mono text-[12px]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="caption uppercase tracking-wider text-graphite text-[10px]">
                  Stock
                </span>
                <input
                  required
                  type="number"
                  min={0}
                  value={v.stock}
                  onChange={(e) =>
                    updateVariant(i, "stock", Number(e.target.value))
                  }
                  className="caption border-b border-smoke py-1 text-carbon focus:border-carbon transition-colors"
                />
              </label>
              <button
                type="button"
                onClick={() => removeVariant(i)}
                disabled={variants.length === 1}
                className="p-2 text-graphite hover:text-carbon disabled:opacity-30 disabled:cursor-not-allowed"
                title="Eliminar variante"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-smoke">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 bg-carbon px-6 py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 text-[11px]"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Guardando...
            </>
          ) : saved ? (
            <>
              <Check size={14} /> Guardado
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}

/** ISO → "YYYY-MM-DDTHH:mm" (local). Vacío si null/undefined. */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" local → ISO. Devuelve null si input vacío. */
function localInputToIso(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
