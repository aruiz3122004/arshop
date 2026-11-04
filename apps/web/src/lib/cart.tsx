"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Product } from "./catalog";

export interface CartItem {
  productId: string;
  variantId?: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
}

/**
 * Match preciso de un item del carrito. Si tenemos `variantId` lo usamos
 * (es único por tienda); si no, caemos a la terna (productId, size, color)
 * para carritos antiguos persistidos sin variantId.
 */
function sameLine(a: CartItem, b: Pick<CartItem, "productId" | "variantId" | "size" | "color">): boolean {
  if (a.variantId && b.variantId) return a.variantId === b.variantId;
  return (
    a.productId === b.productId && a.size === b.size && a.color === b.color
  );
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  remove: (productId: string, size: string, color: string, variantId?: string) => void;
  updateQty: (
    productId: string,
    size: string,
    color: string,
    quantity: number,
    variantId?: string,
  ) => void;
  clear: () => void;
  count: number;
  total: number;
}

const CartContext = createContext<CartState | null>(null);

const STORAGE_KEY = "arshop:cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const add = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => sameLine(i, item));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const remove = useCallback(
    (productId: string, size: string, color: string, variantId?: string) => {
      setItems((prev) =>
        prev.filter((i) => !sameLine(i, { productId, size, color, variantId })),
      );
    },
    [],
  );

  const updateQty = useCallback(
    (
      productId: string,
      size: string,
      color: string,
      quantity: number,
      variantId?: string,
    ) => {
      setItems((prev) =>
        prev
          .map((i) =>
            sameLine(i, { productId, size, color, variantId })
              ? { ...i, quantity: Math.max(1, quantity) }
              : i,
          )
          .filter((i) => i.quantity > 0),
      );
    },
    [],
  );

  const clear = useCallback(() => {
    setItems([]);
    // Persistimos el vaciado de inmediato: si el documento se recarga justo
    // después (navegación completa tras pagar), el efecto de hidratación
    // volvería a leer el carrito anterior de localStorage.
    try {
      localStorage.setItem(STORAGE_KEY, "[]");
    } catch {}
  }, []);

  const count = useMemo(() => items.reduce((n, i) => n + i.quantity, 0), [items]);
  const total = useMemo(
    () => items.reduce((n, i) => n + i.quantity * i.price, 0),
    [items],
  );

  const value = useMemo<CartState>(
    () => ({
      items,
      add,
      remove,
      updateQty,
      clear,
      count,
      total,
    }),
    [items, add, remove, updateQty, clear, count, total],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function toCartItem(
  product: Product,
  options: { size: string; color: string },
): Omit<CartItem, "quantity"> {
  const matchedVariant =
    product.variants?.find(
      (v) =>
        v.size.toLowerCase() === options.size.toLowerCase() &&
        (!options.color ||
          v.color_name.toLowerCase() === options.color.toLowerCase()),
    ) ||
    product.variants?.find(
      (v) => v.size.toLowerCase() === options.size.toLowerCase(),
    ) ||
    product.variants?.[0];

  return {
    productId: product.id,
    variantId: matchedVariant?.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    price: product.price,
    image: product.images[0],
    size: options.size,
    color: options.color,
  };
}
