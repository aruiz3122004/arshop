"use client";

import { useRef, useState, useEffect } from "react";
import { useCurrency, type SupportedCurrency } from "@/lib/currency";
import { ChevronDown, Check } from "lucide-react";

const CURRENCIES: SupportedCurrency[] = ["COP", "USD", "EUR"];

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: PointerEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (c: SupportedCurrency) => {
    setCurrency(c);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 caption text-[10px] tracking-[0.1em] px-1.5 py-1 text-carbon hover:text-carbon/70 transition-colors md:gap-1.5 md:px-2"
      >
        {currency}
        <ChevronDown size={12} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          className="absolute right-0 mt-1 border border-smoke bg-paper shadow-sm z-50"
        >
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={currency === c}
              onClick={() => handleSelect(c)}
              className="w-full px-3 py-2 text-left caption text-[11px] tracking-[0.1em] text-carbon hover:bg-stone/20 transition-colors flex items-center justify-between"
            >
              <span>{c}</span>
              {currency === c && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
