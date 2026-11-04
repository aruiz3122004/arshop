"use client";

import { useEffect, useState } from "react";
import { Briefcase, Check, Home, Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import {
  apiCreateAddress,
  apiDeleteAddress,
  apiListAddresses,
  apiSetDefaultAddress,
  apiUpdateAddress,
  type Address,
  type AddressLabel,
  type ShippingAddress,
} from "@/lib/api";

type FormState = Omit<ShippingAddress, "isDefault"> & { isDefault?: boolean };

const EMPTY_FORM: FormState = {
  label: "casa",
  recipientName: "",
  line1: "",
  line2: "",
  neighborhood: "",
  city: "Bogotá",
  department: "Cundinamarca",
  postalCode: "",
  country: "CO",
  phone: "",
  notes: "",
  isDefault: false,
};

const LABEL_META: Record<AddressLabel, { icon: typeof Home; title: string }> = {
  casa: { icon: Home, title: "Casa" },
  oficina: { icon: Briefcase, title: "Oficina" },
  otro: { icon: MapPin, title: "Otro" },
};

interface AddressManagerProps {
  onChange?: (addresses: Address[]) => void;
  defaultPhone?: string;
}

export function AddressManager({ onChange, defaultPhone }: AddressManagerProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await apiListAddresses();
      setAddresses(list);
      onChange?.(list);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las direcciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, phone: defaultPhone || "" });
    setEditingId(null);
    setCreating(false);
    setError(null);
  };

  const startCreate = () => {
    resetForm();
    setForm((f) => ({ ...f, isDefault: addresses.length === 0 }));
    setCreating(true);
  };

  const startEdit = (addr: Address) => {
    setCreating(false);
    setEditingId(addr.id);
    setForm({
      label: addr.label ?? "casa",
      recipientName: addr.recipientName ?? "",
      line1: addr.line1 ?? "",
      line2: addr.line2 ?? "",
      neighborhood: addr.neighborhood ?? "",
      city: addr.city ?? "Bogotá",
      department: addr.department ?? "Cundinamarca",
      postalCode: addr.postalCode ?? "",
      country: addr.country ?? "CO",
      phone: addr.phone ?? "",
      notes: addr.notes ?? "",
      isDefault: addr.isDefault,
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: ShippingAddress = {
        label: form.label,
        recipientName: form.recipientName?.trim() || undefined,
        line1: form.line1.trim(),
        line2: form.line2?.trim() || undefined,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        department: form.department.trim(),
        postalCode: form.postalCode?.trim() || undefined,
        country: form.country?.trim() || "CO",
        phone: form.phone.trim(),
        notes: form.notes?.trim() || undefined,
        isDefault: form.isDefault,
      };
      if (editingId) {
        await apiUpdateAddress(editingId, payload);
      } else {
        await apiCreateAddress(payload);
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la dirección.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await apiDeleteAddress(id);
      setConfirmDelete(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "No se pudo eliminar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await apiSetDefaultAddress(id);
      await load();
    } catch (err: any) {
      setError(err?.message || "No se pudo marcar como predeterminada.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-graphite">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        <p className="caption mt-2">Cargando direcciones...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      {addresses.length === 0 && !creating && (
        <div className="border border-dashed border-smoke p-6 text-center">
          <MapPin className="mx-auto h-5 w-5 text-graphite" />
          <p className="caption text-graphite text-[12px] mt-2">
            Aún no tienes direcciones guardadas.
          </p>
        </div>
      )}

      {addresses.map((addr) => {
        const Icon = LABEL_META[addr.label ?? "casa"].icon;
        const title = LABEL_META[addr.label ?? "casa"].title;
        const isEditing = editingId === addr.id;
        if (isEditing) {
          return (
            <AddressForm
              key={addr.id}
              form={form}
              setForm={setForm}
              onSubmit={handleSubmit}
              onCancel={resetForm}
              saving={saving}
              editing
            />
          );
        }
        return (
          <div
            key={addr.id}
            className={`border p-5 flex flex-col gap-3 transition-colors ${
              addr.isDefault ? "border-carbon bg-stone/10" : "border-smoke"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-carbon" />
                <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
                  {title}
                </span>
                {addr.isDefault && (
                  <span className="inline-flex items-center gap-1 border border-carbon bg-carbon px-2 py-0.5 text-[10px] uppercase tracking-wider text-paper">
                    <Star size={10} /> Predeterminada
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!addr.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(addr.id)}
                    disabled={busyId === addr.id}
                    className="caption text-[10px] uppercase tracking-wider text-carbon border border-smoke bg-paper px-2 py-1 hover:border-carbon transition-colors disabled:opacity-50"
                    title="Marcar como predeterminada"
                  >
                    {busyId === addr.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      "Hacer predeterminada"
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(addr)}
                  className="p-1.5 text-graphite hover:text-carbon transition-colors"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(addr.id)}
                  className="p-1.5 text-graphite hover:text-carbon transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="caption text-[13px] text-carbon leading-relaxed">
              {addr.recipientName && (
                <p className="font-medium">{addr.recipientName}</p>
              )}
              <p>
                {addr.line1}
                {addr.line2 ? ` · ${addr.line2}` : ""}
              </p>
              <p className="text-graphite text-[12px]">
                {addr.neighborhood}, {addr.city} ({addr.department})
              </p>
              <p className="text-graphite text-[12px] mt-0.5">
                Tel: {addr.phone}
              </p>
              {addr.notes && (
                <p className="text-graphite text-[12px] italic mt-0.5">
                  {addr.notes}
                </p>
              )}
            </div>

            {confirmDelete === addr.id && (
              <div className="border border-carbon/40 bg-stone/40 p-3 flex items-center justify-between gap-3">
                <p className="caption text-[12px] text-carbon">
                  ¿Eliminar esta dirección?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="caption text-[11px] uppercase tracking-wider text-graphite px-3 py-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(addr.id)}
                    disabled={busyId === addr.id}
                    className="caption text-[11px] uppercase tracking-wider bg-carbon text-paper px-3 py-1 hover:bg-carbon/85 disabled:opacity-50"
                  >
                    {busyId === addr.id ? (
                      <Loader2 size={10} className="inline animate-spin" />
                    ) : (
                      "Eliminar"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {creating && (
        <AddressForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={resetForm}
          saving={saving}
          editing={false}
        />
      )}

      {!creating && !editingId && (
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center justify-center gap-2 border border-smoke bg-paper py-3 caption uppercase tracking-widest text-carbon hover:border-carbon transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Añadir dirección
        </button>
      )}
    </div>
  );
}

interface AddressFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
}

function AddressForm({ form, setForm, onSubmit, onCancel, saving, editing }: AddressFormProps) {
  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={onSubmit}
      className="border border-carbon p-5 flex flex-col gap-4 bg-paper"
    >
      <div className="flex items-center justify-between border-b border-smoke pb-3">
        <h3 className="caption uppercase tracking-[0.14em] text-carbon text-[11px] font-medium">
          {editing ? "Editar dirección" : "Nueva dirección"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-graphite hover:text-carbon transition-colors"
          title="Cancelar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Etiqueta
          </span>
          <select
            value={form.label || "casa"}
            onChange={(e) => upd("label", e.target.value as AddressLabel)}
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors bg-paper"
          >
            <option value="casa">Casa</option>
            <option value="oficina">Oficina</option>
            <option value="otro">Otro</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Destinatario (opcional)
          </span>
          <input
            type="text"
            value={form.recipientName || ""}
            onChange={(e) => upd("recipientName", e.target.value)}
            placeholder="Quién recibe"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Dirección principal *
          </span>
          <input
            type="text"
            required
            value={form.line1}
            onChange={(e) => upd("line1", e.target.value)}
            placeholder="Ej. Calle 93 # 11-45"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Apto / Torre / Interior (opcional)
          </span>
          <input
            type="text"
            value={form.line2 || ""}
            onChange={(e) => upd("line2", e.target.value)}
            placeholder="Ej. Apto 402, Torre 1"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Barrio / Sector *
          </span>
          <input
            type="text"
            required
            value={form.neighborhood}
            onChange={(e) => upd("neighborhood", e.target.value)}
            placeholder="Ej. El Chicó"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Teléfono *
          </span>
          <input
            type="tel"
            required
            value={form.phone}
            onChange={(e) => upd("phone", e.target.value)}
            placeholder="+57 300 123 4567"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Ciudad *
          </span>
          <input
            type="text"
            required
            value={form.city}
            onChange={(e) => upd("city", e.target.value)}
            placeholder="Ej. Bogotá"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Departamento *
          </span>
          <input
            type="text"
            required
            value={form.department}
            onChange={(e) => upd("department", e.target.value)}
            placeholder="Ej. Cundinamarca"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
            Instrucciones de entrega (opcional)
          </span>
          <input
            type="text"
            value={form.notes || ""}
            onChange={(e) => upd("notes", e.target.value)}
            placeholder="Ej. Dejar en portería"
            className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon transition-colors"
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={!!form.isDefault}
            onChange={(e) => upd("isDefault", e.target.checked)}
            className="h-4 w-4 accent-carbon"
          />
          <span className="caption text-graphite text-[12px]">
            Marcar como dirección predeterminada
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-smoke">
        <button
          type="button"
          onClick={onCancel}
          className="caption uppercase tracking-wider text-[11px] text-graphite px-4 py-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 bg-carbon px-5 py-2.5 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Check size={14} /> {editing ? "Actualizar" : "Guardar"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
