/**
 * Resuelve `promise` o lanza un error si tarda más de `ms`.
 *
 * Se usa para las llamadas a BullMQ: con la cola offline activa (necesaria
 * para que ioredis no reviente cuando Redis aún no está listo) esas promesas
 * pueden quedar pendientes indefinidamente si el servicio de Redis no está
 * disponible, bloqueando el arranque de la API o un request.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timeout tras ${ms}ms en ${label}`)),
          ms,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
