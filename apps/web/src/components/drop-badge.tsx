"use client";

import { useEffect, useState } from "react";
import {
  apiNotifyMeBackInStock,
  fetchProductAvailability,
  type ProductAvailability,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Bell, Clock, PackageSearch } from "lucide-react";

interface DropBadgeProps {
  slug: string;
  selectedVariantId: string | null;
  /** Se refresca cada N segundos para que el "quedan N" sea casi real-time. */
  pollSeconds?: number;
}

/**
 * Muestra, cuando aplica, dos piezas de información en la PDP:
 *   - Countdown si el producto tiene drop_ends_at futuro.
 *   - "Quedan N" si available_stock de la variante seleccionada es bajo.
 *
 * Si el producto no está en ventana (drop_starts_at futuro o drop_ends_at
 * pasado), lo deja al botón "Añadir al carrito" rechazar en checkout —
 * aquí solo informamos.
 */
export function DropBadge({ slug, selectedVariantId, pollSeconds = 15 }: DropBadgeProps) {
  const { user } = useAuth();
  const [data, setData] = useState<ProductAvailability | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchProductAvailability(slug);
      if (!cancelled) setData(res);
    };
    void load();
    const id = setInterval(load, pollSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug, pollSeconds]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const endsAt = data.dropEndsAt ? Date.parse(data.dropEndsAt) : null;
  const startsAt = data.dropStartsAt ? Date.parse(data.dropStartsAt) : null;
  const inFutureDrop = startsAt !== null && now < startsAt;
  const activeDrop = endsAt !== null && now < endsAt && !inFutureDrop;

  const variant = selectedVariantId
    ? data.variants.find((v) => v.id === selectedVariantId)
    : null;
  const lowStock =
    variant && variant.available_stock > 0 && variant.available_stock <= 5;
  const soldOut = variant && variant.available_stock <= 0;

  if (!activeDrop && !inFutureDrop && !lowStock && !soldOut) return null;

  return (
    <div className="mt-3 space-y-2">
      {activeDrop && endsAt !== null && (
        <div className="flex items-center gap-2 border border-carbon bg-paper px-3 py-2 caption text-[11px] uppercase tracking-widest text-carbon">
          <Clock size={13} />
          <span>Termina en {formatCountdown(endsAt - now)}</span>
        </div>
      )}
      {inFutureDrop && startsAt !== null && (
        <div className="flex items-center gap-2 border border-smoke bg-stone/40 px-3 py-2 caption text-[11px] uppercase tracking-widest text-graphite">
          <Clock size={13} />
          <span>Inicia en {formatCountdown(startsAt - now)}</span>
        </div>
      )}
      {soldOut && (
        <>
          <div className="flex items-center gap-2 border border-carbon bg-carbon px-3 py-2 caption text-[11px] uppercase tracking-widest text-paper">
            <PackageSearch size={13} />
            <span>Agotado por ahora</span>
          </div>
          {user && selectedVariantId && !subscribed && (
            <button
              type="button"
              onClick={async () => {
                if (!selectedVariantId) return;
                setSubscribing(true);
                try {
                  await apiNotifyMeBackInStock(selectedVariantId);
                  setSubscribed(true);
                } catch {
                  // sin feedback de error aquí; el botón vuelve a estar activo
                } finally {
                  setSubscribing(false);
                }
              }}
              disabled={subscribing}
              className="inline-flex items-center gap-2 border border-smoke bg-paper px-3 py-2 caption text-[11px] uppercase tracking-widest text-carbon hover:border-carbon transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Bell size={13} />
              {subscribing ? "Guardando..." : "Avísame cuando llegue"}
            </button>
          )}
          {subscribed && (
            <div className="flex items-center gap-2 caption text-[11px] uppercase tracking-widest text-graphite">
              <Bell size={13} />
              <span>Te avisaremos por correo</span>
            </div>
          )}
        </>
      )}
      {lowStock && !soldOut && variant && (
        <div className="flex items-center gap-2 border border-carbon/40 bg-stone/60 px-3 py-2 caption text-[11px] uppercase tracking-widest text-carbon">
          <PackageSearch size={13} />
          <span>Quedan {variant.available_stock}</span>
        </div>
      )}
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
