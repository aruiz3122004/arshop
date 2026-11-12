import { Injectable, type LoggerService } from "@nestjs/common";
import pino, { type Logger as PinoInstance } from "pino";

/**
 * Logger estructurado en formato JSON (NDJSON) basado en Pino.
 * Compatible con NestJS LoggerService (`app.useLogger(new PinoJsonLogger())`),
 * Datadog, CloudWatch, Render Logs y Loki.
 *
 * Redacta automáticamente claves sensibles si se pasan objetos estructurados.
 */
@Injectable()
export class PinoJsonLogger implements LoggerService {
  private readonly pino: PinoInstance;

  constructor() {
    this.pino = pino({
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
      base: {
        service: "arshop-api",
        env: process.env.NODE_ENV ?? "development",
      },
      redact: {
        paths: [
          "password",
          "*.password",
          "token",
          "*.token",
          "accessToken",
          "refreshToken",
          "authorization",
          "headers.authorization",
          "headers.cookie",
          "pin",
          "*.pin",
        ],
        censor: "[REDACTED]",
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    });
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    this.write("info", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write("trace", message, optionalParams);
  }

  private write(
    level: "info" | "error" | "warn" | "debug" | "trace",
    message: unknown,
    optionalParams: unknown[],
  ) {
    const context =
      optionalParams.length > 0 && typeof optionalParams[optionalParams.length - 1] === "string"
        ? (optionalParams[optionalParams.length - 1] as string)
        : undefined;

    const trace =
      level === "error" && optionalParams.length > 1 && typeof optionalParams[0] === "string"
        ? (optionalParams[0] as string)
        : undefined;

    if (typeof message === "object" && message !== null) {
      const payload = message as Record<string, unknown>;
      const msgText =
        typeof payload.msg === "string"
          ? payload.msg
          : typeof payload.message === "string"
            ? payload.message
            : "structured_event";
      this.pino[level](
        {
          ...(context ? { context } : {}),
          ...(trace ? { stack: trace } : {}),
          ...payload,
        },
        msgText,
      );
      return;
    }

    this.pino[level](
      {
        ...(context ? { context } : {}),
        ...(trace ? { stack: trace } : {}),
      },
      String(message),
    );
  }
}
