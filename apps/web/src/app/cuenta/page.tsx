"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { useAuth } from "@/lib/auth";
import {
  apiDemoSignIn,
  apiGetOrdersMine,
  apiUpdateMe,
  type DocumentType,
  type Order,
} from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import {
  Bell,
  Bike,
  Check,
  Loader2,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { AddressManager } from "@/components/address-manager";
import { MfaVerificationModal } from "@/components/mfa-verification-modal";
import { MfaSettings } from "@/components/mfa-settings";
import { PushOptIn } from "@/components/push-opt-in";

export default function AccountPage() {
  const { user, loading: authLoading, login, register, logout, refreshUser } =
    useAuth();
  const router = useRouter();
  const { fmt } = useCurrency();

  // Si el usuario llegó con ?next=... (por un guard de carrito o checkout),
  // al autenticarse redirigimos ahí automáticamente.
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/")) {
      router.replace(next);
    }
  }, [user, router]);

  // Estado de formularios
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  // Si el backend está despertando (Render free), explicamos la espera en vez
  // de dejar un spinner mudo que parece un cuelgue.
  const [slowServer, setSlowServer] = useState(false);
  const [demoBusy, setDemoBusy] = useState<
    "CUSTOMER" | "ADMIN" | "REPARTIDOR" | null
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estado vista autenticada
  const ORDERS_PER_PAGE = 10;
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [phone, setPhone] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Estado MFA
  const [pendingMfaSessionId, setPendingMfaSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhone(user.phone || "");
      setDocumentType(user.document_type || "");
      setDocumentNumber(user.document_number || "");
      setOrdersPage(1);

      setLoadingOrders(true);
      apiGetOrdersMine()
        .then((res) => setOrders(res))
        .catch((err) => console.warn("Error cargando pedidos:", err))
        .finally(() => setLoadingOrders(false));
    }
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    setSlowServer(false);
    const slowTimer = window.setTimeout(() => setSlowServer(true), 3_000);
    try {
      const result = await login(email, password);
      if (result.status === "pending_mfa") {
        setPendingMfaSessionId(result.sessionId);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "No se pudo iniciar sesión");
    } finally {
      window.clearTimeout(slowTimer);
      setSlowServer(false);
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (
    role: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
  ) => {
    setErrorMsg(null);
    setDemoBusy(role);
    try {
      await apiDemoSignIn(role);
      await refreshUser();
      if (role === "ADMIN") {
        router.push("/admin");
      } else if (role === "REPARTIDOR") {
        router.push("/domiciliario");
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || "No se pudo iniciar la sesión de demostración.",
      );
    } finally {
      setDemoBusy(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await register(email, password, fullName);
      if (result.requiresEmailVerification) {
        if (result.emailSent) {
          setSuccessMsg(
            "Cuenta creada. Te enviamos un correo de confirmación: ábrelo o usa el código y luego inicia sesión.",
          );
        } else {
          setErrorMsg(
            "Cuenta creada, pero no pudimos enviar el correo de confirmación. Pide uno nuevo en /verificar/reenviar.",
          );
        }
        setPassword("");
        setConfirmPassword("");
        setTab("login");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setErrorMsg(null);
    try {
      await apiUpdateMe({
        fullName,
        phone,
        documentType: documentType || undefined,
        documentNumber: documentNumber || undefined,
      });
      await refreshUser();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al actualizar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16 pb-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
        <p className="caption mt-3 uppercase tracking-widest text-graphite">
          Cargando cuenta...
        </p>
      </div>
    );
  }

  /* ───────────────────────── VISTA AUTENTICADO ───────────────────────── */
  if (user) {
    return (
      <div className="mx-auto max-w-[960px] px-4 md:px-6 pt-8 pb-24">
        <Breadcrumbs
          items={[{ label: "Inicio", href: "/" }, { label: "Mi Cuenta" }]}
        />

        {/* Encabezado del perfil */}
        <div className="mt-4 flex flex-col justify-between gap-4 border-b border-smoke pb-6 sm:flex-row sm:items-end">
          <div>
            <span className="caption uppercase tracking-[0.2em] text-graphite">
              Sesión iniciada
            </span>
            <h1 className="font-serif text-3xl font-light text-carbon sm:text-4xl mt-1">
              {user.full_name || user.email.split("@")[0]}
            </h1>
            <p className="caption text-graphite mt-1">{user.email}</p>
          </div>

          <div className="flex items-center gap-3">
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="border border-carbon bg-carbon px-2.5 py-1 text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 transition-colors"
              >
                Admin
              </Link>
            )}
            {user.role === "REPARTIDOR" && (
              <Link
                href="/domiciliario"
                className="inline-flex items-center gap-1.5 border border-carbon bg-carbon px-2.5 py-1 text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 transition-colors"
              >
                <Bike size={12} />
                Domiciliario
              </Link>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-2 border border-smoke bg-paper px-4 py-2 caption uppercase tracking-wider text-carbon hover:border-carbon transition-colors"
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Columna izquierda: Mis Pedidos */}
          <section id="historial-pedidos" className="lg:col-span-7">
            <div className="flex items-center justify-between gap-2 border-b border-carbon pb-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-carbon" />
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                  Historial de pedidos ({orders.length})
                </h2>
              </div>
              {orders.length > ORDERS_PER_PAGE && (
                <span className="caption text-[11px] font-mono text-graphite">
                  Página {ordersPage} de {Math.ceil(orders.length / ORDERS_PER_PAGE)}
                </span>
              )}
            </div>

            {loadingOrders ? (
              <div className="py-12 text-center text-graphite">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                <p className="caption mt-2">Consultando pedidos...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="border border-smoke p-8 text-center mt-6">
                <p className="caption text-graphite">
                  Aún no tienes pedidos registrados.
                </p>
                <Link
                  href="/hombre"
                  className="mt-4 inline-block border border-carbon bg-carbon px-6 py-2.5 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors"
                >
                  Explorar catálogo
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-col gap-4">
                  {orders
                    .slice(
                      (ordersPage - 1) * ORDERS_PER_PAGE,
                      ordersPage * ORDERS_PER_PAGE,
                    )
                    .map((o) => (
                      <Link
                        key={o.id}
                        href={`/cuenta/pedidos/${o.id}`}
                        className="block border border-smoke p-5 transition-colors hover:border-carbon cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="caption text-[11px] text-graphite">
                              ID: {o.id.slice(0, 8)}...
                            </p>
                            <p className="caption text-graphite">
                              {new Date(o.created_at).toLocaleDateString("es-CO", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                          <span className="border border-carbon px-2 py-0.5 text-[10px] uppercase tracking-wider text-carbon">
                            {o.status === "PAID"
                              ? "Pagado"
                              : o.status === "SHIPPED"
                                ? "Enviado"
                                : o.status === "DELIVERED"
                                  ? "Entregado"
                                  : o.status === "CANCELLED"
                                    ? "Cancelado"
                                    : "Pendiente"}
                          </span>
                        </div>

                        <div className="mt-4 border-t border-smoke/60 pt-3">
                          <div className="flex justify-between items-baseline">
                            <span className="caption uppercase tracking-wider text-graphite text-[11px]">
                              Total
                            </span>
                            <span className="font-serif text-lg text-carbon">
                              {fmt(o.total_cop)}
                            </span>
                          </div>
                          <p className="caption text-[11px] text-carbon mt-2 underline underline-offset-2">
                            Ver detalle →
                          </p>
                        </div>
                      </Link>
                    ))}
                </div>

                {orders.length > ORDERS_PER_PAGE && (() => {
                  const totalPages = Math.ceil(orders.length / ORDERS_PER_PAGE);
                  const startIdx = (ordersPage - 1) * ORDERS_PER_PAGE + 1;
                  const endIdx = Math.min(ordersPage * ORDERS_PER_PAGE, orders.length);

                  const goToPage = (p: number) => {
                    const clamped = Math.max(1, Math.min(totalPages, p));
                    setOrdersPage(clamped);
                    document
                      .getElementById("historial-pedidos")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  };

                  return (
                    <nav
                      aria-label="Paginación de historial de pedidos"
                      className="mt-8 flex flex-col gap-3 border-t border-smoke pt-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="caption text-[11px] text-graphite">
                        Mostrando <span className="font-mono text-carbon">{startIdx}–{endIdx}</span> de{" "}
                        <span className="font-mono text-carbon">{orders.length}</span> pedidos
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => goToPage(ordersPage - 1)}
                          disabled={ordersPage <= 1}
                          className="border border-smoke px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          ← Anterior
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                          (pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => goToPage(pageNum)}
                              aria-current={ordersPage === pageNum ? "page" : undefined}
                              className={`min-w-[32px] border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                                ordersPage === pageNum
                                  ? "border-carbon bg-carbon text-paper font-medium"
                                  : "border-smoke bg-paper text-carbon hover:border-carbon"
                              }`}
                            >
                              {pageNum}
                            </button>
                          ),
                        )}

                        <button
                          type="button"
                          onClick={() => goToPage(ordersPage + 1)}
                          disabled={ordersPage >= totalPages}
                          className="border border-smoke px-3 py-1.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Siguiente →
                        </button>
                      </div>
                    </nav>
                  );
                })()}
              </>
            )}
          </section>

          {/* Columna derecha: Datos personales */}
          <section className="lg:col-span-5">
            <div className="flex items-center gap-2 border-b border-carbon pb-3">
              <UserIcon size={16} className="text-carbon" />
              <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                Datos de cuenta
              </h2>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-6 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                  Nombre completo
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                  Correo electrónico
                </span>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="caption border-b border-smoke/40 py-2 text-graphite cursor-not-allowed"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                  Teléfono de contacto
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
                />
              </label>

              <div className="grid grid-cols-[auto_1fr] gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                    Documento
                  </span>
                  <select
                    value={documentType}
                    onChange={(e) =>
                      setDocumentType(e.target.value as DocumentType | "")
                    }
                    className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors bg-paper"
                  >
                    <option value="">Tipo</option>
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                    <option value="PP">Pasaporte</option>
                    <option value="NIT">NIT</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="caption uppercase tracking-[0.14em] text-graphite text-[11px]">
                    Número de documento
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="1020304050"
                    className="caption border-b border-smoke py-2 text-carbon focus:border-carbon transition-colors"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="mt-2 inline-flex items-center justify-center gap-2 border border-carbon bg-carbon py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
              >
                {savingProfile ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : profileSaved ? (
                  <>
                    <Check size={14} /> Actualizado
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </button>
            </form>

            {/* Direcciones de entrega — multi */}
            <div className="mt-12 flex items-center gap-2 border-b border-carbon pb-3">
              <MapPin size={16} className="text-carbon" />
              <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                Mis direcciones
              </h2>
            </div>
            <p className="caption text-graphite text-[11px] mt-2 mb-5">
              Guarda varias direcciones y elige una por defecto para agilizar tus compras.
            </p>

            <AddressManager
              defaultPhone={phone}
              onChange={() => {
                refreshUser();
              }}
            />

            {/* Notificaciones */}
            <div className="mt-12 border-t border-smoke/70 pt-8">
              <div className="flex items-center gap-2 border-b border-carbon pb-3">
                <Bell size={16} className="text-carbon" />
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                  Notificaciones
                </h2>
              </div>
              <p className="caption text-graphite text-[11px] mt-2 mb-3">
                Avísame cuando mi pedido llegue hoy, para tener a mano el QR.
              </p>
              <PushOptIn description="Recibe alertas cuando tu pedido cambie de estado o esté listo para entrega." />
            </div>

            {/* Seguridad — verificación en dos pasos */}
            <div className="mt-12 border-t border-smoke/70 pt-8">
              <div className="flex items-center gap-2 border-b border-carbon pb-3">
                <ShieldCheck size={16} className="text-carbon" />
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                  Seguridad
                </h2>
              </div>
              <p className="caption text-graphite text-[11px] mt-2 mb-5">
                Activa la verificación en dos pasos y genera códigos de respaldo single-use
                para proteger tu cuenta.
              </p>
              <MfaSettings />
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ───────────────────────── VISTA LOGIN / REGISTRO ───────────────────────── */
  return (
    <div className="mx-auto max-w-[480px] px-4 md:px-6 pt-8 pb-24">
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/" }, { label: "Cuenta" }]}
      />

      <SectionTitle>
        {tab === "login" ? "Accede a tu cuenta" : "Crea tu cuenta"}
      </SectionTitle>

      {/* Modo Demo Portafolio — Acceso 1-Clic para reclutadores / evaluadores */}
      <div className="mb-8 border border-carbon bg-stone/35 p-5 text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <span className="caption uppercase tracking-[0.16em] text-[10.5px] font-semibold text-carbon">
            Modo Demo Portafolio · Acceso 1-Clic
          </span>
          <span className="border border-smoke bg-paper px-2 py-0.5 font-mono text-[10px] text-graphite uppercase">
            No configurado
          </span>
        </div>
        <p className="caption text-[12px] text-graphite mt-2 leading-relaxed max-w-lg mx-auto text-center">
          Explora instantáneamente los 3 paneles del ecosistema ARShop con cuentas preconfiguradas.
          Entorno simulado en navegador: no guarda datos reales ni toca la base de datos.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={demoBusy !== null}
            onClick={() => handleDemoLogin("CUSTOMER")}
            className="flex items-center justify-center text-center border border-smoke bg-paper px-2 py-2.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-50"
          >
            {demoBusy === "CUSTOMER" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Cliente"
            )}
          </button>
          <button
            type="button"
            disabled={demoBusy !== null}
            onClick={() => handleDemoLogin("ADMIN")}
            className="flex items-center justify-center text-center border border-carbon bg-carbon px-2 py-2.5 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {demoBusy === "ADMIN" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Admin"
            )}
          </button>
          <button
            type="button"
            disabled={demoBusy !== null}
            onClick={() => handleDemoLogin("REPARTIDOR")}
            className="flex items-center justify-center text-center border border-smoke bg-paper px-2 py-2.5 caption text-[11px] uppercase tracking-wider text-carbon hover:border-carbon transition-colors disabled:opacity-50"
          >
            {demoBusy === "REPARTIDOR" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Repartidor"
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-smoke mb-8">
        <button
          type="button"
          onClick={() => {
            setTab("login");
            setErrorMsg(null);
          }}
          className={`flex-1 pb-3 caption uppercase tracking-[0.16em] transition-colors ${tab === "login"
              ? "border-b-2 border-carbon text-carbon font-medium"
              : "text-graphite hover:text-carbon"
            }`}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("register");
            setErrorMsg(null);
          }}
          className={`flex-1 pb-3 caption uppercase tracking-[0.16em] transition-colors ${tab === "register"
              ? "border-b-2 border-carbon text-carbon font-medium"
              : "text-graphite hover:text-carbon"
            }`}
        >
          Registrarse
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 border border-carbon/20 bg-stone/40 p-3.5 text-center text-[13px] text-carbon">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-6 border border-carbon bg-carbon/5 p-3.5 text-center text-[13px] text-carbon">
          {successMsg}
        </div>
      )}

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@dominio.com"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Contraseña
            </span>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
            <label className="inline-flex items-center gap-2 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-3.5 w-3.5 accent-carbon cursor-pointer"
              />
              <span className="caption text-[12px] text-graphite">
                Mostrar contraseña
              </span>
            </label>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Entrar"
            )}
          </button>

          {submitting && slowServer && (
            <p className="caption -mt-2 text-center text-[11px] text-graphite">
              Despertando el servidor… la primera carga del día puede tardar
              unos segundos.
            </p>
          )}

          <div className="flex flex-col items-center gap-2 mt-2">
            <Link
              href="/recuperar"
              className="caption text-graphite text-[12px] underline underline-offset-4 hover:text-carbon transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
            <p className="caption text-graphite">
              ¿Aún no tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => setTab("register")}
                className="text-carbon underline underline-offset-4 font-medium"
              >
                Regístrate
              </button>
            </p>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Nombre completo
            </span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@dominio.com"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Contraseña (mínimo 8 caracteres)
            </span>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="caption uppercase tracking-[0.14em] text-carbon text-[11px]">
              Confirmar contraseña
            </span>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="caption border-b border-smoke py-2 text-carbon placeholder:text-smoke focus:border-carbon transition-colors"
            />
            <label className="inline-flex items-center gap-2 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-3.5 w-3.5 accent-carbon cursor-pointer"
              />
              <span className="caption text-[12px] text-graphite">
                Mostrar contraseñas
              </span>
            </label>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Crear cuenta"
            )}
          </button>

          <p className="caption text-center text-graphite mt-2">
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => setTab("login")}
              className="text-carbon underline underline-offset-4 font-medium"
            >
              Inicia sesión
            </button>
          </p>
        </form>
      )}

      {pendingMfaSessionId && (
        <MfaVerificationModal
          sessionId={pendingMfaSessionId}
          onSuccess={async () => {
            // El backend ya seteó las cookies httpOnly en /auth/complete-mfa.
            // Solo nos queda refrescar el perfil para que el UI vea la sesión.
            try {
              await refreshUser();
              setPendingMfaSessionId(null);
            } catch (err) {
              setErrorMsg("Error al cargar sesión");
            }
          }}
          onError={(error) => {
            setErrorMsg(error);
          }}
        />
      )}
    </div>
  );
}
