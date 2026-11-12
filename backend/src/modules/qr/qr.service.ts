import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomBytes, randomInt } from "crypto";
import QRCode from "qrcode";
import { RedisService } from "../../redis/redis.service";

export interface QrPayload {
  orderId: string;
  jti: string;
  exp: number; // epoch seconds
}

/**
 * Formato del QR: base64url(JSON(payload)).hmac-sha256(payload, secret) → tres
 * partes separadas por punto. Es un JWT-lite deliberadamente simple para
 * poder decodificar en el scanner sin dependencias externas.
 *
 * Un solo uso real: el `jti` se guarda en Redis con TTL igual al exp. El
 * primer scan válido consume la clave; scans posteriores con el mismo jti
 * son rechazados aunque la firma siga siendo válida.
 */
@Injectable()
export class QrService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly clientCodeTtlSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.secret = this.config.getOrThrow<string>("QR_HMAC_SECRET");
    this.ttlSeconds = this.config.getOrThrow<number>("QR_TTL_SECONDS");
    this.clientCodeTtlSeconds = this.config.getOrThrow<number>(
      "CLIENT_CODE_TTL_SECONDS",
    );
  }

  /**
   * Genera un código numérico de 4 dígitos para la orden. Útil cuando el
   * cliente no puede mostrar el QR pero sí dictar el código al repartidor.
   * El código en claro se devuelve una sola vez para que lo pinte el
   * cliente; en DB sólo se guarda el hash (ver OrdersService.issueQr).
   */
  issueClientCode(orderId: string): { code: string; hash: string; exp: number } {
    const code = String(randomInt(0, 10_000)).padStart(4, "0");
    const hash = this.hashClientCode(orderId, code);
    const exp = Math.floor(Date.now() / 1000) + this.clientCodeTtlSeconds;
    return { code, hash, exp };
  }

  /** Hash determinista del código para comparar en DB. */
  hashClientCode(orderId: string, code: string): string {
    return createHash("sha256")
      .update(`${orderId}.${code}.${this.secret}`)
      .digest("hex");
  }

  get clientCodeTtl(): number {
    return this.clientCodeTtlSeconds;
  }

  /** Firma un nuevo token para una orden. Devuelve payload + token. */
  issue(orderId: string): { token: string; jti: string; exp: number } {
    const jti = randomBytes(12).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const payload: QrPayload = { orderId, jti, exp };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", this.secret).update(encoded).digest("base64url");
    return { token: `${encoded}.${sig}`, jti, exp };
  }

  /** Verifica firma y expiración. No consume el jti todavía. */
  verify(token: string): QrPayload {
    const parts = token.split(".");
    if (parts.length !== 2) throw new UnauthorizedException("QR malformado");
    const [encoded, sig] = parts;
    const expected = createHmac("sha256", this.secret).update(encoded).digest("base64url");
    if (!timingSafeEqual(expected, sig)) {
      throw new UnauthorizedException("Firma QR inválida");
    }
    let payload: QrPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new UnauthorizedException("QR corrupto");
    }
    if (!payload.orderId || !payload.jti || !payload.exp) {
      throw new UnauthorizedException("QR incompleto");
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("QR expirado");
    }
    return payload;
  }

  /**
   * Marca el jti como usado. Devuelve true si fue el primer consumo (dentro
   * de la ventana TTL). Lanza si el jti ya se había consumido.
   */
  async consumeJti(jti: string): Promise<boolean> {
    const key = `qr:jti:${jti}`;
    const ok = await this.redis.setNx(key, "1", this.ttlSeconds);
    if (!ok) {
      throw new UnauthorizedException("Este QR ya fue utilizado");
    }
    return true;
  }

  /** Devuelve el QR como data URL PNG para pintar en <img src=...>. */
  async toDataUrl(token: string): Promise<string> {
    return QRCode.toDataURL(token, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
