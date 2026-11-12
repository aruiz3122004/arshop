import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { tap } from "rxjs/operators";

/**
 * Parámetros de query cuyo VALOR nunca debe aparecer en logs. La clave sí
 * se conserva ("search=***") para que las métricas por endpoint sigan
 * siendo útiles.
 */
const SENSITIVE_PARAMS = new Set([
  "search",
  "email",
  "q",
  "token",
  "code",
  "password",
  "pin",
]);

export function scrubUrl(url: string): string {
  const idx = url.indexOf("?");
  if (idx === -1) return url;
  const path = url.slice(0, idx);
  const params = new URLSearchParams(url.slice(idx + 1));
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
      params.set(key, "***");
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const http = ctx.switchToHttp();
    const req = http.getRequest<{
      method: string;
      url: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: { id?: string; role?: string };
    }>();
    const res = http.getResponse<{
      statusCode?: number;
      setHeader?: (name: string, value: string) => void;
    }>();

    const headerReqId = req.headers?.["x-request-id"];
    const reqId =
      typeof headerReqId === "string" && headerReqId.trim()
        ? headerReqId.trim()
        : randomUUID();

    if (typeof res?.setHeader === "function") {
      res.setHeader("x-request-id", reqId);
    }

    const started = Date.now();
    const safeUrl = scrubUrl(req.url);

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - started;
          const statusCode = res?.statusCode ?? 200;
          this.logger.log({
            reqId,
            method: req.method,
            url: safeUrl,
            statusCode,
            durationMs,
            userId: req.user?.id ?? null,
            msg: `${req.method} ${safeUrl} ${statusCode} ${durationMs}ms`,
          });
        },
        error: (err: { status?: number; message?: string }) => {
          const durationMs = Date.now() - started;
          const statusCode = err?.status ?? res?.statusCode ?? 500;
          this.logger.warn({
            reqId,
            method: req.method,
            url: safeUrl,
            statusCode,
            durationMs,
            userId: req.user?.id ?? null,
            error: err?.message ?? "Request failed",
            msg: `${req.method} ${safeUrl} ${statusCode} ${durationMs}ms`,
          });
        },
      }),
    );
  }
}
