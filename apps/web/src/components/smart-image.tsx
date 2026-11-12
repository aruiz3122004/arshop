"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type SyntheticEvent } from "react";
import { Shirt } from "lucide-react";
import clsx from "clsx";

type Status = "loading" | "ready" | "error";

interface SmartImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  /** Icono mostrado durante la carga; por defecto una camisa */
  skeletonIcon?: React.ReactNode;
  /** Retardo del barrido del skeleton, para que la carga se sienta en cascada (ms) */
  skeletonDelayMs?: number;
}

/**
 * Imagen con skeleton estilizado (barrido + icono de camisa), fade-in al
 * cargar y recuperación si falla el fetch: nunca se muestra el icono de
 * "imagen rota". Lazy por defecto (hereda de next/image) salvo `priority`.
 */
export function SmartImage({
  className,
  alt,
  skeletonIcon,
  skeletonDelayMs = 0,
  ...rest
}: SmartImageProps) {
  const [status, setStatus] = useState<Status>("loading");

  const handleLoad = (_: SyntheticEvent<HTMLImageElement>) => {
    setStatus("ready");
  };

  const handleError = () => {
    setStatus("error");
  };

  return (
    <>
      {/* Placeholder: shimmer mientras carga y, si falla, el mismo icono
          estático (sin texto de error — nunca comunicamos "roto" al usuario). */}
      {status !== "ready" && (
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-stone"
          aria-hidden="true"
        >
          {status === "loading" && (
            <div
              className="skeleton-shimmer absolute inset-0"
              style={{ animationDelay: `${skeletonDelayMs}ms` }}
            />
          )}
          <div
            className={clsx(
              "relative text-ash",
              status === "loading" ? "opacity-90" : "opacity-60",
            )}
          >
            {skeletonIcon ?? <Shirt size={38} strokeWidth={1} />}
          </div>
        </div>
      )}

      <Image
        {...rest}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        className={clsx(
          "transition-opacity duration-700 ease-out",
          status === "ready" ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
