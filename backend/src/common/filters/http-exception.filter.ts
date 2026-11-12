import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

interface ErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === "production";

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let error = "InternalServerError";

    if (exception instanceof HttpException) {
      // HttpException son errores controlados (BadRequest, NotFound, etc.):
      // su mensaje está pensado para el cliente y se expone tal cual.
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === "string") {
        message = resp;
        error = exception.name;
      } else if (typeof resp === "object" && resp !== null) {
        const r = resp as { message?: string | string[]; error?: string };
        message = r.message ?? message;
        error = r.error ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Error no envuelto: puede traer detalle interno (stack frames, nombres
      // de columnas, paths de archivos). En prod se oculta al cliente y
      // se loguea completo para debug server-side.
      this.logger.error(exception.message, exception.stack);
      message = this.isProd ? "Internal server error" : exception.message;
    } else if (
      typeof exception === "object" &&
      exception !== null &&
      "message" in exception &&
      typeof (exception as { message: unknown }).message === "string"
    ) {
      // Errores de Supabase / PostgREST son objetos planos
      // { message, code, hint, details }. Fuga potencial: `details` suele
      // traer el nombre de la constraint violada o la fila problemática.
      const err = exception as {
        message: string;
        code?: string;
        hint?: string;
        details?: string;
      };
      this.logger.error(
        `${err.code ? `[${err.code}] ` : ""}${err.message}${err.details ? ` — ${err.details}` : ""}${err.hint ? ` (hint: ${err.hint})` : ""}`,
      );
      message = this.isProd ? "Internal server error" : err.message;
    } else {
      this.logger.error("Unknown exception", JSON.stringify(exception));
    }

    const payload: ErrorPayload = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(payload);
  }
}
