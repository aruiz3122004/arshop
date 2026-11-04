"use client";

import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { CurrencyProvider } from "@/lib/currency";
import { GenderProvider } from "@/lib/gender";
import { LocationProvider } from "@/lib/location";
import { DemoBanner } from "@/components/demo-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <LocationProvider>
          <GenderProvider>
            <CartProvider>
              {children}
              <DemoBanner />
            </CartProvider>
          </GenderProvider>
        </LocationProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}

