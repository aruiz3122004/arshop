"use client";

import { useState } from "react";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Loader2, Lock } from "lucide-react";
import { useCurrency } from "@/lib/currency";

interface StripePaymentFormProps {
  orderId: string;
  totalCop: number;
  /** Importe real del PaymentIntent en minor units (cents para USD/EUR, unidades para COP) */
  intentAmount?: number;
  /** Moneda del PaymentIntent en minúsculas ("usd", "eur", "cop") */
  intentCurrency?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (errorMessage: string) => void;
}

function formatIntentAmount(amount: number, currency: string): string {
  const cur = currency.toUpperCase();
  const zeroDecimal = ["COP", "KRW", "JPY", "VND"].includes(cur);
  const value = zeroDecimal ? amount : amount / 100;
  const locale = cur === "COP" ? "es-CO" : cur === "EUR" ? "es-ES" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: zeroDecimal ? 0 : 2,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(value);
}

export function StripePaymentForm({
  orderId,
  totalCop,
  intentAmount,
  intentCurrency,
  onSuccess,
  onError,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const { fmt } = useCurrency();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMessage(null);

    try {
      const returnUrl = `${window.location.origin}/checkout/success?orderId=${orderId}`;
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });

      if (error) {
        const msg = error.message || "Error al procesar el pago";
        setErrorMessage(msg);
        onError(msg);
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        // Redirigido si se requería autenticación 3DS adicional
      }
    } catch (err: any) {
      const msg = err?.message || "Ocurrió un error inesperado";
      setErrorMessage(msg);
      onError(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <PaymentElement />

      {errorMessage && (
        <div className="border border-carbon/20 bg-stone/40 p-3.5 text-center text-[13px] text-carbon">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || processing}
        className="mt-2 flex w-full items-center justify-center gap-2 py-4 caption uppercase tracking-[0.18em] bg-carbon text-paper hover:bg-carbon/85 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {processing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Procesando pago...</span>
          </>
        ) : (
          <>
            <Lock size={15} />
            <span>
              Pagar{" "}
              {intentAmount && intentCurrency
                ? formatIntentAmount(intentAmount, intentCurrency)
                : fmt(totalCop)}
            </span>
          </>
        )}
      </button>

      <p className="caption text-center text-graphite text-[11px] flex items-center justify-center gap-1.5">
        <Lock size={12} />
        Transacción cifrada y protegida por Stripe (PCI-DSS nivel 1).
      </p>
    </form>
  );
}
