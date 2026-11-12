"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Unlock, Edit2, Trash2, Plus, Upload } from "lucide-react";
import {
  apiAdminListUsers,
  apiAdminCreateUser,
  apiAdminUpdateUser,
  apiAdminDeleteUser,
  apiAdminBlockUser,
  apiAdminUnblockUser,
  apiAdminBulkImportUsers,
  type AdminUserRow,
} from "@/lib/api";

type ModalType = "create" | "edit" | "delete" | "import" | null;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "CUSTOMER" | "ADMIN" | "REPARTIDOR">("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [modal, setModal] = useState<ModalType>(null);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [importData, setImportData] = useState<string>("");

  const load = async (newCursor?: string | null) => {
    try {
      setError(null);
      const result = await apiAdminListUsers(50, newCursor || undefined, {
        search: search || undefined,
        role: role || undefined,
      });
      if (newCursor) {
        setUsers((prev) => [...prev, ...result.rows]);
      } else {
        setUsers(result.rows);
      }
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setCursor(null);
    load(null);
  }, [search, role]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId("creating");
    setError(null);
    try {
      const newUser = await apiAdminCreateUser(
        formData.email,
        formData.fullName,
        formData.role || "CUSTOMER",
        formData.password,
      );
      setUsers((prev) => [{ ...newUser, blocked: false } as any, ...prev]);
      setModal(null);
      setFormData({});
    } catch (err: any) {
      setError(err?.message || "Error creando usuario.");
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setBusyId(editingUser.id);
    setError(null);
    try {
      const updated = await apiAdminUpdateUser(editingUser.id, formData);
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? updated : u)));
      setModal(null);
      setEditingUser(null);
      setFormData({});
    } catch (err: any) {
      setError(err?.message || "Error actualizando usuario.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!editingUser) return;
    setBusyId(editingUser.id);
    setError(null);
    try {
      await apiAdminDeleteUser(editingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== editingUser.id));
      setModal(null);
      setEditingUser(null);
    } catch (err: any) {
      setError(err?.message || "Error eliminando usuario.");
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId("importing");
    setError(null);
    try {
      const lines = importData.trim().split("\n").filter((l) => l.trim());
      const importUsers = lines.map((line) => {
        const [email, fullName, roleStr] = line.split(",").map((s) => s.trim());
        const normalized = (roleStr || "").toUpperCase();
        const role =
          normalized === "ADMIN"
            ? "ADMIN"
            : normalized === "REPARTIDOR" || normalized === "DOMICILIARIO"
              ? "REPARTIDOR"
              : "CUSTOMER";
        return {
          email,
          fullName: fullName || undefined,
          role,
        };
      });

      const result = await apiAdminBulkImportUsers(importUsers);
      load(null);
      setModal(null);
      setImportData("");
      alert(
        `Importación completada: ${result.summary.successful} exitosos, ${result.summary.failed} fallidos`,
      );
    } catch (err: any) {
      setError(err?.message || "Error importando usuarios.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleBlock = async (u: AdminUserRow) => {
    setBusyId(u.id);
    setError(null);
    try {
      const updated = u.blocked
        ? await apiAdminUnblockUser(u.id)
        : await apiAdminBlockUser(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
    } catch (err: any) {
      setError(err?.message || "Error actualizando usuario.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-xl text-carbon">Usuarios ({users.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setModal("create");
              setFormData({});
              setEditingUser(null);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors"
          >
            <Plus size={12} /> Crear usuario
          </button>
          <button
            onClick={() => {
              setModal("import");
              setImportData("");
            }}
            className="inline-flex items-center gap-2 px-3 py-2 caption text-[11px] uppercase tracking-wider border border-carbon text-carbon hover:bg-stone/10 transition-colors"
          >
            <Upload size={12} /> Importar CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Buscar por email o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border-b border-smoke px-0 py-2 caption text-[13px] text-carbon placeholder:text-graphite focus:border-carbon transition-colors outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="border-b border-smoke px-0 py-2 caption text-[13px] text-carbon focus:border-carbon transition-colors outline-none bg-transparent"
        >
          <option value="">Todos</option>
          <option value="CUSTOMER">Cliente</option>
          <option value="ADMIN">Admin</option>
          <option value="REPARTIDOR">Domiciliario</option>
        </select>
      </div>

      <div className="overflow-x-auto border border-smoke">
        <table className="min-w-full text-left">
          <thead className="bg-stone/30 border-b border-smoke">
            <tr className="caption uppercase tracking-wider text-[10px] text-graphite">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-smoke/60 caption text-[13px] text-carbon hover:bg-stone/10"
              >
                <td className="px-4 py-3 font-mono text-[12px]">{u.email}</td>
                <td className="px-4 py-3">{u.full_name || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                      u.role === "ADMIN"
                        ? "border-carbon bg-carbon text-paper"
                        : u.role === "REPARTIDOR"
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-smoke text-graphite"
                    }`}
                  >
                    {u.role === "REPARTIDOR" ? "DOMICILIARIO" : u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.blocked ? (
                    <span className="text-[11px] uppercase tracking-wider text-carbon">
                      Bloqueado
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-wider text-graphite">
                      Activo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[12px] text-graphite">
                  {new Date(u.created_at).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-3 text-right flex justify-end gap-1">
                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setFormData({ fullName: u.full_name, role: u.role, blocked: u.blocked });
                      setModal("edit");
                    }}
                    disabled={busyId === u.id}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-smoke text-[11px] text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                  >
                    <Edit2 size={10} />
                  </button>
                  <button
                    onClick={() => toggleBlock(u)}
                    disabled={busyId === u.id || u.role === "ADMIN"}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-smoke text-[11px] text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                    title={u.blocked ? "Desbloquear usuario (podrá usar la cuenta)" : "Bloquear usuario (no podrá iniciar sesión, pero los datos persisten)"}
                  >
                    {busyId === u.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : u.blocked ? (
                      <Unlock size={10} />
                    ) : (
                      <Lock size={10} />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setModal("delete");
                    }}
                    disabled={busyId === u.id}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-smoke text-[11px] text-carbon hover:border-carbon transition-colors disabled:opacity-40"
                    title="Eliminar usuario permanentemente de la base de datos"
                  >
                    <Trash2 size={10} />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center caption text-graphite">
                  No hay usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="w-full py-2 caption text-[12px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
        >
          {loading ? "Cargando..." : "Cargar más"}
        </button>
      )}

      {/* Modal: Crear usuario */}
      {modal === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-smoke bg-paper p-6">
            <h3 className="font-serif text-lg text-carbon mb-4">Crear usuario</h3>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon placeholder:text-graphite outline-none"
              />
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={formData.fullName || ""}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon placeholder:text-graphite outline-none"
              />
              <select
                value={formData.role || "CUSTOMER"}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon outline-none bg-transparent"
              >
                <option value="CUSTOMER">Cliente</option>
                <option value="ADMIN">Admin</option>
                <option value="REPARTIDOR">Domiciliario</option>
              </select>
              {formData.role === "REPARTIDOR" && (
                <p className="caption text-[11px] text-amber-700 bg-amber-50 border border-amber-300 px-2 py-2">
                  Esto crea la cuenta con rol REPARTIDOR. Para que pueda operar debes añadirle su perfil geográfico (ciudad, vehículo, placa) desde{" "}
                  <a href="/admin/domiciliarios" className="underline font-medium">
                    /admin/domiciliarios
                  </a>
                  .
                </p>
              )}
              <input
                type="password"
                placeholder="Contraseña (dejar vacío para auto-generar)"
                value={formData.password || ""}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon placeholder:text-graphite outline-none"
              />
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setFormData({});
                  }}
                  className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!formData.email}
                  className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar usuario */}
      {modal === "edit" && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-smoke bg-paper p-6">
            <h3 className="font-serif text-lg text-carbon mb-4">Editar usuario</h3>
            <form onSubmit={handleEdit} className="flex flex-col gap-4">
              <div className="text-[12px] text-graphite">{editingUser.email}</div>
              <input
                type="text"
                placeholder="Nombre"
                value={formData.fullName || ""}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon outline-none"
              />
              <select
                value={formData.role || "CUSTOMER"}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="border-b border-smoke px-0 py-2 caption text-[12px] text-carbon outline-none bg-transparent"
              >
                <option value="CUSTOMER">Cliente</option>
                <option value="ADMIN">Admin</option>
                <option value="REPARTIDOR">Domiciliario</option>
              </select>
              {formData.role === "REPARTIDOR" && editingUser?.role !== "REPARTIDOR" && (
                <p className="caption text-[11px] text-amber-700 bg-amber-50 border border-amber-300 px-2 py-2">
                  Al cambiar a REPARTIDOR debes crear su perfil geográfico en{" "}
                  <a href="/admin/domiciliarios" className="underline font-medium">
                    /admin/domiciliarios
                  </a>
                  .
                </p>
              )}
              <label className="flex items-center gap-2 caption text-[12px]">
                <input
                  type="checkbox"
                  checked={formData.blocked || false}
                  onChange={(e) => setFormData({ ...formData, blocked: e.target.checked })}
                  className="w-4 h-4"
                />
                Bloqueado
              </label>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setEditingUser(null);
                    setFormData({});
                  }}
                  className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingUser.id}
                  className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Eliminar usuario */}
      {modal === "delete" && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-carbon bg-paper p-6">
            <h3 className="font-serif text-lg text-carbon mb-4">Eliminar usuario</h3>
            <p className="caption text-[12px] text-graphite mb-4">
              Esta acción es irreversible. Tipea el email del usuario para confirmar:
            </p>
            <input
              type="text"
              placeholder={editingUser.email}
              value={formData.confirmEmail || ""}
              onChange={(e) => setFormData({ ...formData, confirmEmail: e.target.value })}
              className="w-full border-b border-smoke px-0 py-2 caption text-[12px] text-carbon outline-none mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setEditingUser(null);
                  setFormData({});
                }}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={formData.confirmEmail !== editingUser.email || busyId === editingUser.id}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar CSV */}
      {modal === "import" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-smoke bg-paper p-6">
            <h3 className="font-serif text-lg text-carbon mb-4">Importar usuarios</h3>
            <p className="caption text-[12px] text-graphite mb-4">
              Formato: email,nombre,rol (uno por línea, rol opcional). Roles válidos: CUSTOMER, ADMIN, REPARTIDOR.
            </p>
            <textarea
              placeholder="user@example.com,Nombre,CUSTOMER"
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              className="w-full h-32 border border-smoke p-2 caption text-[12px] text-carbon outline-none resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setImportData("");
                }}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!importData.trim() || busyId === "importing"}
                className="flex-1 py-2 caption text-[11px] uppercase tracking-wider bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
              >
                Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
