import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";

interface GuestTokenPayload {
  /** order id */
  o: string;
  /** epoch seconds */
  exp: number;
}

/**
 * Token de acceso a un pedido de invitado.
 *
 * Formato: base64url(JSON).hmac-sha256 — mismo JWT-lite que el QR de entrega,
 * pero con namespace y secreto propios. No se persiste: el token se puede
 * verificar sin tocar la DB y se invalida solo al expirar (30 días por
 * defecto). Si `GUEST_ORDER_SECRET` no está definido se usa `QR_HMAC_SECRET`.
 */
@Injectable()
export class GuestTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.secret =
      config.get<string>("GUEST_ORDER_SECRET") ||
      config.getOrThrow<string>("QR_HMAC_SECRET");
    this.ttlSeconds =
      config.get<number>("GUEST_ORDER_TTL_SECONDS") ?? 60 * 60 * 24 * 30;
  }

  issue(orderId: string): string {
    const payload: GuestTokenPayload = {
      o: orderId,
      exp: Math.floor(Date.now() / 1000) + this.ttlSeconds,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }

  verify(token: string): { orderId: string; exp: number } {
    const parts = (token ?? "").split(".");
    if (parts.length !== 2) {
      throw new UnauthorizedException("Enlace de pedido inválido");
    }
    const [encoded, signature] = parts;
    if (!timingSafeEqual(this.sign(encoded), signature)) {
      throw new UnauthorizedException("Enlace de pedido inválido");
    }

    let payload: GuestTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as GuestTokenPayload;
    } catch {
      throw new UnauthorizedException("Enlace de pedido corrupto");
    }

    if (!payload?.o || !payload?.exp) {
      throw new UnauthorizedException("Enlace de pedido incompleto");
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException(
        "Este enlace expiró. Pide uno nuevo a soporte.",
      );
    }
    return { orderId: payload.o, exp: payload.exp };
  }

  /** Verifica que el token corresponda exactamente a esta orden. */
  verifyForOrder(token: string, orderId: string): void {
    const payload = this.verify(token);
    if (payload.orderId !== orderId) {
      throw new UnauthorizedException("El enlace no corresponde a este pedido");
    }
  }

  private sign(encoded: string): string {
    return createHmac("sha256", this.secret).update(encoded).digest("base64url");
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
