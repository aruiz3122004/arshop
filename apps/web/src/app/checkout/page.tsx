"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useLocation } from "@/lib/location";
import { useCurrency } from "@/lib/currency";
import {
  apiCreateOrder,
  apiCreatePaymentIntent,
  apiListAddresses,
  apiValidateCoupon,
  fetchProductBySlug,
  type Address,
  type Order,
  type ValidatedCoupon,
} from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { StripePaymentForm } from "@/components/stripe-payment-form";
import { Elements } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { Check, ChevronRight, Loader2, Lock, ShieldCheck } from "lucide-react";

const STRIPE_APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#111111",
    colorBackground: "#ffffff",
    colorText: "#111111",
    colorDanger: "#df1b41",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0px",
  },
  rules: {
    ".Input": {
      border: "1px solid #e5e5e5",
      borderRadius: "0px",
      boxShadow: "none",
    },
    ".Input:focus": {
      border: "1px solid #111111",
      boxShadow: "none",
    },
    ".Tab": {
      border: "1px solid #e5e5e5",
      borderRadius: "0px",
      boxShadow: "none",
    },
    ".Tab--selected": {
      border: "1px solid #111111",
      backgroundColor: "#f7f7f7",
    },
  },
};

export default function CheckoutPage() {
  const { items, total, clear } = useCart();
  const { user, loading: authLoading, login, register } = useAuth();
  const { location } = useLocation();
  const { currency, fmt } = useCurrency();

  // Estados de autenticación en checkout (si no está logueado)
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");

  // Dirección de envío
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState(location.city || "Bogotá");
  const [department, setDepartment] = useState(location.department || "Cundinamarca");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [habeasData, setHabeasData] = useState(true);

  // Datos fiscales para la factura electrónica (opcionales; por defecto se
  // usan los del perfil).
  const [billingDocType, setBillingDocType] = useState<
    "CC" | "CE" | "PP" | "NIT"
  >("CC");
  const [billingDocNumber, setBillingDocNumber] = useState("");
  const [billingLegalName, setBillingLegalName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  // Pasos de checkout: 1 = Datos & Envío, 2 = Pago con Stripe
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado de orden creada y Stripe PaymentIntent
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerSessionClientSecret, setCustomerSessionClientSecret] = useState<
    string | undefined
  >(undefined);
  const [intentAmount, setIntentAmount] = useState<number | undefined>(undefined);
  const [intentCurrency, setIntentCurrency] = useState<string | undefined>(undefined);

  // Direcciones guardadas y selección
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [shippingSummary, setShippingSummary] = useState<string>("");

  // Cupón promocional (G4)
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<ValidatedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.full_name) {
        setAuthFullName(user.full_name);
        setBillingLegalName((cur) => cur || user.full_name || "");
      }
      if (user.phone) setPhone(user.phone);
      if (user.email) setBillingEmail((cur) => cur || user.email);
      if (user.document_type) setBillingDocType(user.document_type);
      if (user.document_number) {
        setBillingDocNumber((cur) => cur || user.document_number || "");
      }

      apiListAddresses()
        .then((list) => {
          setSavedAddresses(list);
          if (list.length > 0) {
            const def = list.find((a) => a.isDefault) ?? list[0];
            setSelectedAddressId(def.id);
            setUseNewAddress(false);
          } else {
            setUseNewAddress(true);
          }
        })
        .catch((err) => {
          console.warn("No se pudieron cargar direcciones:", err);
          setUseNewAddress(true);
        });
    } else {
      setUseNewAddress(true);
    }
  }, [user]);

  const selectedAddress = selectedAddressId
    ? savedAddresses.find((a) => a.id === selectedAddressId) ?? null
    : null;

  if (authLoading) {
    return (
      <div className="mx-auto max-w-[560px] px-4 md:px-6 pt-16 pb-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-graphite" />
        <p className="caption mt-3 uppercase tracking-widest text-graphite">
          Cargando checkout...
        </p>
      </div>
    );
  }

  if (items.length === 0 && !createdOrder) {
    return (
      <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-12 pb-24 text-center">
        <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Checkout" }]} />
        <SectionTitle>Tu carrito está vacío</SectionTitle>
        <p className="caption text-graphite mt-4">
          Añade artículos al carrito antes de proceder al pago.
        </p>
        <Link
          href="/hombre"
          className="mt-8 inline-block border border-carbon bg-carbon px-8 py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors"
        >
          Explorar catálogo
        </Link>
      </div>
    );
  }

  const handleQuickLogin = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setErrorMsg("Ingresa tu correo y contraseña para iniciar sesión.");
      return;
    }
    setErrorMsg(null);
    setLoggingIn(true);
    try {
      await login(authEmail.trim(), authPassword);
      // useEffect de arriba se encargará de cargar savedAddresses cuando user cambie
    } catch (err: any) {
      setErrorMsg(err?.message || "Credenciales inválidas. Revisa tu correo o contraseña.");
    } finally {
      setLoggingIn(false);
    }
  };

  /**
   * Resuelve autenticación, dirección de entrega y genera orden + intento de pago.
   */
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      // 1. Si no hay sesión, registrar o iniciar sesión PRIMERO
      if (!user) {
        if (!authEmail.trim() || !authPassword.trim()) {
          setErrorMsg("Por favor ingresa tu correo y contraseña para continuar.");
          setSubmitting(false);
          return;
        }

        if (authMode === "register") {
          try {
            const created = await register(
              authEmail.trim(),
              authPassword,
              authFullName.trim(),
            );
            if (created.requiresEmailVerification) {
              throw new Error(
                created.emailSent === false
                  ? "Cuenta creada, pero no pudimos enviar el correo de confirmación. Pide uno nuevo en /verificar/reenviar."
                  : "Cuenta creada. Revisa tu correo (botón o código) para confirmarla y luego vuelve a finalizar la compra.",
              );
            }
          } catch (regErr: any) {
            const msg = String(regErr?.message || "").toLowerCase();
            if (msg.includes("already registered") || msg.includes("already in use") || msg.includes("user already")) {
              throw new Error("Este correo ya está registrado en ARShop. Por favor selecciona 'Ya tengo cuenta' e inicia sesión.");
            }
            throw regErr;
          }
        } else {
          await login(authEmail.trim(), authPassword);
        }
      }

      // 2. Resolver dirección de entrega: la seleccionada o la nueva del form
      let resolvedLine1: string;
      let resolvedLine2: string | undefined;
      let resolvedNeighborhood: string;
      let resolvedCity: string;
      let resolvedDepartment: string;
      let resolvedPhone: string;
      let resolvedNotes: string | undefined;

      if (!useNewAddress && selectedAddress) {
        resolvedLine1 = selectedAddress.line1;
        resolvedLine2 = selectedAddress.line2 || undefined;
        resolvedNeighborhood = selectedAddress.neighborhood;
        resolvedCity = selectedAddress.city;
        resolvedDepartment = selectedAddress.department;
        resolvedPhone = selectedAddress.phone;
        resolvedNotes = selectedAddress.notes || undefined;
      } else {
        resolvedLine1 = line1.trim();
        resolvedLine2 = line2.trim() || undefined;
        resolvedNeighborhood = neighborhood.trim();
        resolvedCity = city.trim();
        resolvedDepartment = department.trim();
        resolvedPhone = phone.trim();
        resolvedNotes = notes.trim() || undefined;
      }

      if (!resolvedLine1 || !resolvedNeighborhood || !resolvedCity || !resolvedDepartment || !resolvedPhone) {
        setErrorMsg("Por favor completa todos los campos obligatorios de envío.");
        setSubmitting(false);
        return;
      }

      const wantsBilling = Boolean(billingDocNumber.trim());
      if (wantsBilling && !billingLegalName.trim()) {
        setErrorMsg(
          "Para la factura electrónica completa la razón social junto al número de documento.",
        );
        setSubmitting(false);
        return;
      }

      if (!habeasData) {
        setErrorMsg("Debes aceptar la Política de Tratamiento de Datos Personales.");
        setSubmitting(false);
        return;
      }

      // 3. Resolver variantId para cada item si no estuviera presente
      const orderItems: { variantId: string; quantity: number }[] = [];
      for (const it of items) {
        let vId = it.variantId;
        if (!vId) {
          const fullProduct = await fetchProductBySlug(it.slug);
          const matched =
            fullProduct?.variants?.find(
              (v) =>
                v.size.toLowerCase() === it.size.toLowerCase() &&
                (!it.color || v.color_name.toLowerCase() === it.color.toLowerCase()),
            ) ||
            fullProduct?.variants?.find((v) => v.size.toLowerCase() === it.size.toLowerCase()) ||
            fullProduct?.variants?.[0];
          vId = matched?.id;
        }

        if (!vId) {
          throw new Error(`No se pudo identificar la variante para ${it.name} (${it.size})`);
        }

        orderItems.push({
          variantId: vId,
          quantity: it.quantity,
        });
      }

      // 4. Crear orden en NestJS API
      const order = await apiCreateOrder({
        items: orderItems,
        shippingAddress: {
          line1: resolvedLine1,
          line2: resolvedLine2,
          neighborhood: resolvedNeighborhood,
          city: resolvedCity,
          department: resolvedDepartment,
          phone: resolvedPhone,
          notes: resolvedNotes,
        },
        billing: wantsBilling
          ? {
              documentType: billingDocType,
              documentNumber: billingDocNumber.trim(),
              legalName: billingLegalName.trim(),
              email: billingEmail.trim() || undefined,
            }
          : undefined,
        habeasDataAccepted: true,
        couponCode: appliedCoupon?.code,
      });

      setCreatedOrder(order);
      setShippingSummary(
        `${resolvedLine1}, ${resolvedCity} (${resolvedDepartment})`,
      );

      // 5. Crear Stripe PaymentIntent con soporte de tarjetas guardadas en Stripe
      const intent = await apiCreatePaymentIntent(order.id, currency);
      setClientSecret(intent.clientSecret);
      setCustomerSessionClientSecret(intent.customerSessionClientSecret);
      setIntentAmount(intent.amount);
      setIntentCurrency(intent.currency);

      // 6. Avanzar al paso de pago con Stripe Elements
      setStep(2);
    } catch (err: any) {
      console.error("[Checkout] Error creando orden:", err);
      setErrorMsg(err?.message || "No se pudo iniciar el proceso de pago.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = (paymentIntentId: string) => {
    clear();
    // Stripe.js monta overlays a nivel de documento (position: fixed) que no se
    // desmontan al navegar en cliente. Con router.push, el badge "stripe ›"
    // seguía flotando sobre la página de éxito y tapaba "Seguir comprando".
    // Una navegación completa descarta el documento y, con él, esos overlays.
    window.location.assign(
      `/checkout/success?orderId=${createdOrder?.id}&pi=${paymentIntentId}`,
    );
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    setValidatingCoupon(true);
    try {
      const res = await apiValidateCoupon(code, total);
      setAppliedCoupon(res);
      setCouponInput(res.code);
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponError(err?.message || "Cupón no válido");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const discountCop = appliedCoupon ? appliedCoupon.discountCop : 0;
  const netItemsCop = Math.max(0, total - discountCop);
  const estimatedTaxCop = netItemsCop - Math.round(netItemsCop / 1.19);
  const estimatedBaseCop = netItemsCop - estimatedTaxCop;

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 pb-24">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Carrito", href: "/cart" },
          { label: "Checkout" },
        ]}
      />

      <div className="mt-4 flex items-center justify-between border-b border-smoke pb-4">
        <SectionTitle>Finalizar compra</SectionTitle>
        <div className="flex items-center gap-2 caption uppercase tracking-widest text-[11px] text-graphite">
          <span className={step === 1 ? "text-carbon font-semibold" : "text-graphite"}>
            1. Envío
          </span>
          <ChevronRight size={12} />
          <span className={step === 2 ? "text-carbon font-semibold" : "text-graphite"}>
            2. Pago
          </span>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-12">
        {/* ───────── COLUMNA IZQUIERDA: FORMULARIO ───────── */}
        <div className="lg:col-span-7">
          {errorMsg && (
            <div className="mb-6 border border-carbon/20 bg-stone/40 p-3.5 text-center text-[13px] text-carbon">
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleProceedToPayment} className="flex flex-col gap-10">
              {/* Sección 1: Cuenta / Contacto */}
              <section className="flex flex-col gap-4">
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-2">
                  1. Datos del comprador
                </h2>

                {user ? (
                  <div className="border border-smoke p-4 flex items-center justify-between gap-3 bg-stone/20">
                    <div className="min-w-0">
                      <p className="caption text-carbon font-medium break-words">
                        {user.full_name || "Cliente ARShop"}
                      </p>
                      <p className="caption text-graphite text-[12px] break-all">
                        {user.email}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 caption text-[11px] text-carbon font-mono whitespace-nowrap">
                      <Check size={14} /> Conectado
                    </span>
                  </div>
                ) : (
                  <div className="border border-smoke p-5 flex flex-col gap-4">
                    <div className="flex border-b border-smoke">
                      <button
                        type="button"
                        onClick={() => setAuthMode("register")}
                        className={`flex-1 pb-2 caption uppercase tracking-wider text-[11px] transition-colors ${
                          authMode === "register"
                            ? "border-b-2 border-carbon text-carbon font-medium"
                            : "text-graphite"
                        }`}
                      >
                        Nuevo cliente
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode("login")}
                        className={`flex-1 pb-2 caption uppercase tracking-wider text-[11px] transition-colors ${
                          authMode === "login"
                            ? "border-b-2 border-carbon text-carbon font-medium"
                            : "text-graphite"
                        }`}
                      >
                        Ya tengo cuenta
                      </button>
                    </div>

                    {authMode === "register" && (
                      <label className="flex flex-col gap-1">
                        <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                          Nombre completo
                        </span>
                        <input
                          type="text"
                          required
                          value={authFullName}
                          onChange={(e) => setAuthFullName(e.target.value)}
                          placeholder="Tu nombre y apellido"
                          className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                        />
                      </label>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                        Correo electrónico
                      </span>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="nombre@dominio.com"
                        className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                        Contraseña {authMode === "register" && "(mínimo 8 caracteres)"}
                      </span>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                      />
                    </label>

                    {authMode === "login" && (
                      <button
                        type="button"
                        onClick={handleQuickLogin}
                        disabled={loggingIn}
                        className="mt-2 flex w-full items-center justify-center gap-2 border border-carbon bg-carbon py-3 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {loggingIn ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Iniciando sesión...</span>
                          </>
                        ) : (
                          <span>Iniciar sesión y cargar mis datos</span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Sección 2: Dirección de entrega */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-carbon pb-2">
                  <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                    2. Dirección de entrega en Colombia
                  </h2>
                  {savedAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUseNewAddress((v) => !v)}
                      className="caption uppercase tracking-wider text-[11px] text-carbon underline underline-offset-4 cursor-pointer"
                    >
                      {useNewAddress ? "Usar guardada" : "Usar nueva"}
                    </button>
                  )}
                </div>

                {savedAddresses.length > 0 && !useNewAddress ? (
                  <div className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                        Elige una dirección guardada
                      </span>
                      <select
                        value={selectedAddressId ?? ""}
                        onChange={(e) => setSelectedAddressId(e.target.value || null)}
                        className="caption border border-smoke p-2.5 text-carbon focus:border-carbon transition-colors bg-paper cursor-pointer"
                      >
                        {savedAddresses.map((a) => {
                          const labelTitle =
                            a.label === "oficina" ? "Oficina" : a.label === "otro" ? "Otro" : "Casa";
                          return (
                            <option key={a.id} value={a.id}>
                              {labelTitle}
                              {a.isDefault ? " · Predeterminada" : ""} —{" "}
                              {a.line1}
                              {a.line2 ? `, ${a.line2}` : ""} ({a.city})
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    {selectedAddress && (
                      <div className="border border-smoke p-5 bg-stone/20">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="caption uppercase tracking-wider text-graphite text-[11px] font-medium flex items-center gap-1.5">
                              <Check size={14} className="text-carbon" /> Envío a esta dirección
                            </span>
                            <p className="caption text-carbon text-[14px] font-medium mt-1">
                              {selectedAddress.line1}
                              {selectedAddress.line2 ? ` · ${selectedAddress.line2}` : ""}
                            </p>
                            <p className="caption text-graphite text-[13px]">
                              {selectedAddress.neighborhood}, {selectedAddress.city} (
                              {selectedAddress.department})
                            </p>
                            <p className="caption text-graphite text-[12px] mt-0.5">
                              Teléfono: {selectedAddress.phone}
                            </p>
                            {selectedAddress.notes && (
                              <p className="caption text-graphite text-[12px] italic">
                                Instrucciones: {selectedAddress.notes}
                              </p>
                            )}
                          </div>
                          <span className="border border-smoke bg-paper px-2.5 py-1 text-[10px] caption uppercase tracking-widest text-carbon shrink-0">
                            Confirmada
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="caption text-graphite text-[11px]">
                      ¿Quieres enviar a una dirección distinta?{" "}
                      <button
                        type="button"
                        onClick={() => setUseNewAddress(true)}
                        className="text-carbon underline underline-offset-2"
                      >
                        Usar nueva dirección
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Dirección principal *
                    </span>
                    <input
                      type="text"
                      required
                      value={line1}
                      onChange={(e) => setLine1(e.target.value)}
                      placeholder="Ej. Calle 93 # 11-45"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Apto / Interior / Edificio (opcional)
                    </span>
                    <input
                      type="text"
                      value={line2}
                      onChange={(e) => setLine2(e.target.value)}
                      placeholder="Ej. Apto 402, Torre 1"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Barrio / Sector *
                    </span>
                    <input
                      type="text"
                      required
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Ej. El Chicó"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Teléfono de contacto *
                    </span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+57 300 123 4567"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Ciudad *
                    </span>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej. Bogotá"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Departamento *
                    </span>
                    <input
                      type="text"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Ej. Cundinamarca"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Instrucciones de entrega (opcional)
                    </span>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Dejar en portería"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>
                </div>
                )}
              </section>

              {/* Sección 3: Datos fiscales para factura electrónica */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-carbon pb-2">
                  <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium">
                    3. Datos de facturación electrónica
                  </h2>
                  <span className="caption text-[10px] uppercase tracking-wider text-graphite">
                    Opcional
                  </span>
                </div>
                <p className="caption text-[11px] leading-relaxed text-graphite">
                  Si no los indicas, la factura se emite como consumidor final.
                  Estos datos quedan fijos en la factura y no cambian si luego
                  actualizas tu perfil.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Tipo de documento
                    </span>
                    <select
                      value={billingDocType}
                      onChange={(e) =>
                        setBillingDocType(
                          e.target.value as "CC" | "CE" | "PP" | "NIT",
                        )
                      }
                      className="caption border-b border-smoke bg-transparent py-1.5 text-carbon focus:border-carbon"
                    >
                      <option value="CC">Cédula de ciudadanía</option>
                      <option value="CE">Cédula de extranjería</option>
                      <option value="PP">Pasaporte</option>
                      <option value="NIT">NIT</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Número de documento
                    </span>
                    <input
                      type="text"
                      value={billingDocNumber}
                      onChange={(e) => setBillingDocNumber(e.target.value)}
                      placeholder="Ej. 1020304050"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Razón social / nombre
                    </span>
                    <input
                      type="text"
                      value={billingLegalName}
                      onChange={(e) => setBillingLegalName(e.target.value)}
                      placeholder="Ej. Ana María Gómez"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="caption uppercase tracking-[0.12em] text-graphite text-[11px]">
                      Correo para la factura
                    </span>
                    <input
                      type="email"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      placeholder="factura@correo.com"
                      className="caption border-b border-smoke py-1.5 text-carbon focus:border-carbon"
                    />
                  </label>
                </div>
              </section>

              {/* Sección 4: Cupón promocional (antes del botón de pago) */}
              <section className="flex flex-col gap-3">
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-2">
                  Código promocional
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Ej: BIENVENIDO10"
                    disabled={Boolean(appliedCoupon)}
                    className="min-w-0 flex-1 border border-smoke bg-paper px-3 py-2 caption text-[12px] font-mono uppercase text-carbon focus:border-carbon disabled:bg-stone/40"
                  />
                  {appliedCoupon ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponInput("");
                        setCouponError(null);
                      }}
                      className="shrink-0 whitespace-nowrap border border-smoke px-3 py-2 caption text-[11px] uppercase tracking-wider text-graphite hover:border-carbon hover:text-carbon"
                    >
                      Quitar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponInput.trim()}
                      className="shrink-0 whitespace-nowrap border border-carbon bg-carbon px-4 py-2 caption text-[11px] uppercase tracking-wider text-paper hover:bg-carbon/85 disabled:opacity-50"
                    >
                      {validatingCoupon ? "..." : "Aplicar"}
                    </button>
                  )}
                </div>
                {couponError && (
                  <p className="caption text-[11px] text-red-700">{couponError}</p>
                )}
                {appliedCoupon && (
                  <p className="caption text-[11px] text-emerald-800">
                    Cupón <strong>{appliedCoupon.code}</strong> aplicado (-
                    {fmt(appliedCoupon.discountCop)})
                  </p>
                )}
              </section>

              {/* Sección 4: Habeas Data */}
              <label className="flex items-start gap-3 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  required
                  checked={habeasData}
                  onChange={(e) => setHabeasData(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-carbon"
                />
                <span className="caption text-graphite text-[12px] leading-relaxed">
                  Autorizo el tratamiento de mis datos personales para la entrega y facturación conforme a la{" "}
                  <Link
                    href="/privacidad"
                    target="_blank"
                    className="text-carbon underline underline-offset-2"
                  >
                    Política de Tratamiento de Datos (Ley 1581 / Habeas Data)
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-4 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Preparando pago seguro...</span>
                  </>
                ) : (
                  <span>Continuar al pago</span>
                )}
              </button>
            </form>
          )}

          {step === 2 && clientSecret && createdOrder && (
            <div className="flex flex-col gap-8">
              <div className="border border-smoke p-4 bg-stone/20">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="caption text-carbon text-[11px] uppercase tracking-wider font-medium">
                      Pedido #{createdOrder.id.slice(0, 8)}
                    </p>
                    <p className="caption text-graphite text-[12px]">
                      Envío a: {shippingSummary}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="caption text-[11px] uppercase tracking-wider text-carbon underline"
                  >
                    Editar
                  </button>
                </div>
              </div>

              <div className="border-t border-carbon pt-6">
                <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium mb-4">
                  Pago seguro con tarjeta mediante Stripe
                </h2>

                <div className="mb-6 border border-smoke bg-stone/30 p-3.5 caption text-[12px] text-graphite">
                  <span className="uppercase tracking-wider text-[10px] font-semibold text-carbon block mb-1">
                    Modo Prueba (Stripe Sandbox)
                  </span>
                  Usa la tarjeta de prueba{" "}
                  <code className="bg-paper border border-smoke px-1.5 py-0.5 font-mono text-carbon">
                    4242 4242 4242 4242
                  </code>{" "}
                  con cualquier fecha futura (ej. <code className="font-mono text-carbon">12/29</code>) y cualquier CVC (<code className="font-mono text-carbon">123</code>).
                </div>

                <Elements
                  stripe={getStripe()}
                  options={{
                    clientSecret,
                    customerSessionClientSecret,
                    appearance: STRIPE_APPEARANCE,
                  }}
                >
                  <StripePaymentForm
                    orderId={createdOrder.id}
                    totalCop={createdOrder.total_cop}
                    intentAmount={intentAmount}
                    intentCurrency={intentCurrency}
                    onSuccess={handlePaymentSuccess}
                    onError={(err) => setErrorMsg(err)}
                  />
                </Elements>
              </div>
            </div>
          )}
        </div>

        {/* ───────── COLUMNA DERECHA: RESUMEN DE COMPRA ───────── */}
        <aside className="lg:col-span-5">
          <div className="border border-smoke p-6 bg-paper">
            <h2 className="caption uppercase tracking-[0.16em] text-carbon font-medium border-b border-carbon pb-3 mb-6">
              Resumen del pedido ({items.length} {items.length === 1 ? "artículo" : "artículos"})
            </h2>

            <div className="flex flex-col gap-4">
              {items.map((it) => (
                <div key={`${it.productId}-${it.size}-${it.color}`} className="flex gap-4">
                  <div className="relative h-20 w-16 shrink-0 bg-stone overflow-hidden">
                    <Image
                      src={it.image}
                      alt={it.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                      <p className="caption uppercase text-[10px] tracking-wider text-graphite truncate">
                        {it.brand}
                      </p>
                      <p className="caption text-carbon text-[13px] leading-tight line-clamp-1">
                        {it.name}
                      </p>
                      <p className="caption text-graphite text-[11px] mt-0.5">
                        Talla: {it.size} · Color: {it.color} · Cant: {it.quantity}
                      </p>
                    </div>
                    <p className="caption text-carbon font-mono text-[13px]">
                      {fmt(it.price * it.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* El cupón vive en el formulario (paso 1), justo antes del botón de
                pago, para que en móvil se vea antes de "Continuar al pago". */}

            <div className="mt-6 border-t border-smoke pt-4 flex flex-col gap-2.5">
              <div className="flex justify-between caption text-graphite text-[13px]">
                <span>Subtotal prendas</span>
                <span className="text-carbon font-mono">
                  {fmt(total)}
                </span>
              </div>
              {discountCop > 0 && (
                <div className="flex justify-between caption text-emerald-800 text-[13px]">
                  <span>Descuento ({appliedCoupon?.code})</span>
                  <span className="font-mono">-{fmt(discountCop)}</span>
                </div>
              )}
              <div className="flex justify-between caption text-graphite text-[12px]">
                <span>Base gravable (sin IVA)</span>
                <span className="font-mono">{fmt(estimatedBaseCop)}</span>
              </div>
              <div className="flex justify-between caption text-graphite text-[12px]">
                <span>IVA (19% incluido)</span>
                <span className="font-mono">{fmt(estimatedTaxCop)}</span>
              </div>
              <div className="flex justify-between caption text-graphite text-[13px]">
                <span>Envío</span>
                <span className="text-carbon">
                  {createdOrder
                    ? (createdOrder.shipping_cost_cop ?? 0) === 0
                      ? "Gratis"
                      : fmt(createdOrder.shipping_cost_cop)
                    : "Calculado al confirmar"}
                </span>
              </div>
              <div className="flex justify-between border-t border-carbon pt-3 mt-1">
                <span className="text-[15px] text-carbon font-medium">Total</span>
                <span className="text-[16px] text-carbon font-serif">
                  {fmt(createdOrder ? createdOrder.total_cop : netItemsCop)}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-smoke/60 flex items-center gap-2 caption text-graphite text-[11px]">
              <ShieldCheck size={16} className="text-carbon shrink-0" />
              <span>Garantía de cambio de 30 días sin coste en toda Colombia.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
