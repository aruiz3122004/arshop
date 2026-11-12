"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { API_BASE_URL } from "./api";

export type SupportedCurrency = "COP" | "USD" | "EUR";

interface Rates {
  USD: number;
  EUR: number;
}

// Tasas de respaldo por si Frankfurter no responde antes del primer render
const FALLBACK_RATES: Rates = { USD: 0.00025, EUR: 0.00023 };

const LOCALES: Record<SupportedCurrency, string> = {
  COP: "es-CO",
  USD: "en-US",
  EUR: "es-ES",
};

const DECIMALS: Record<SupportedCurrency, number> = {
  COP: 0,
  USD: 2,
  EUR: 2,
};

interface CurrencyContextValue {
  currency: SupportedCurrency;
  setCurrency: (c: SupportedCurrency) => void;
  rates: Rates;
  /** Formatea un importe en COP a la moneda activa del usuario */
  fmt: (copAmount: number) => string;
  /** Convierte COP al importe numérico en la moneda activa */
  convert: (copAmount: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "COP",
  setCurrency: () => undefined,
  rates: FALLBACK_RATES,
  fmt: (v) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(v),
  convert: (v) => v,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(() => {
    if (typeof window === "undefined") return "COP";
    const stored = localStorage.getItem("arshop:currency");
    return (stored as SupportedCurrency) || "COP";
  });

  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);

  useEffect(() => {
    fetch(`${API_BASE_URL}/exchange-rates`)
      .then((r) => r.json())
      .then((data: Rates) => {
        if (typeof data.USD === "number" && typeof data.EUR === "number") {
          setRates(data);
        }
      })
      .catch(() => {}); // fallback silencioso
  }, []);

  const setCurrency = useCallback((c: SupportedCurrency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem("arshop:currency", c);
    } catch {}
  }, []);

  const convert = useCallback(
    (copAmount: number): number => {
      if (currency === "COP") return copAmount;
      return copAmount * rates[currency];
    },
    [currency, rates],
  );

  const fmt = useCallback(
    (copAmount: number): string => {
      const value = convert(copAmount);
      return new Intl.NumberFormat(LOCALES[currency], {
        style: "currency",
        currency,
        minimumFractionDigits: DECIMALS[currency],
        maximumFractionDigits: DECIMALS[currency],
      }).format(value);
    },
    [currency, convert],
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, fmt, convert }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
