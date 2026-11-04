"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/section-title";
import { useCart } from "@/lib/cart";
import { Check, Package, ArrowRight } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<SuccessFallback />}>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessFallback() {
  return (
    <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-12 pb-24 text-center">
      <SectionTitle>Pago completado con éxito</SectionTitle>
    </div>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const paymentIntentId = searchParams.get("pi");
  const { clear } = useCart();
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      clear();
    }
  }, [clear]);

  return (
    <div className="mx-auto max-w-[640px] px-4 md:px-6 pt-12 pb-24 text-center">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Checkout", href: "/checkout" },
          { label: "Confirmación" },
        ]}
      />

      <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center border border-carbon bg-carbon text-paper">
        <Check size={28} strokeWidth={2} />
      </div>

      <SectionTitle>Pago completado con éxito</SectionTitle>

      <p className="caption text-graphite text-[15px] mt-4 leading-relaxed max-w-[480px] mx-auto">
        Hemos recibido tu pago y estamos preparando tus prendas para despacho prioritario.
      </p>

      {orderId && (
        <div className="mt-8 border border-smoke p-6 text-left bg-stone/20">
          <div className="flex items-center gap-2 border-b border-smoke pb-3 mb-4">
            <Package size={16} className="text-carbon" />
            <span className="caption uppercase tracking-wider text-carbon font-medium text-[11px]">
              Detalles de la transacción
            </span>
          </div>

          <div className="flex flex-col gap-2 caption text-[13px]">
            <div className="flex justify-between">
              <span className="text-graphite">Código de pedido:</span>
              <span className="text-carbon font-mono select-all font-medium">
                {orderId}
              </span>
            </div>

            {paymentIntentId && (
              <div className="flex justify-between">
                <span className="text-graphite">Referencia Stripe:</span>
                <span className="text-graphite font-mono text-[11px] select-all">
                  {paymentIntentId.slice(0, 16)}...
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-graphite">Estado:</span>
              <span className="text-carbon font-medium uppercase tracking-wider text-[11px]">
                Pago Aprobado
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          href="/cuenta"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-carbon bg-carbon px-8 py-3.5 caption uppercase tracking-widest text-paper hover:bg-carbon/85 transition-colors"
        >
          <span>Ver en mis pedidos</span>
          <ArrowRight size={14} />
        </Link>

        <Link
          href="/hombre"
          className="w-full sm:w-auto inline-flex items-center justify-center border border-smoke bg-paper px-8 py-3.5 caption uppercase tracking-widest text-carbon hover:border-carbon transition-colors"
        >
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
