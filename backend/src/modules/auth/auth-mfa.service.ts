import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { RedisService } from "../../redis/redis.service";
import { AuthMailerService } from "./auth-mailer.service";
import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";
import * as crypto from "crypto";
import { promisify } from "util";
import { scrypt as _scrypt } from "crypto";

const scryptAsync = promisify(_scrypt);
const EMAIL_CODE_TTL_MINUTES = 15;
const PENDING_MFA_TTL_SECONDS = 15 * 60; // 15 min (alineado con EMAIL_CODE_TTL_MINUTES)
const BACKUP_CODES_COUNT = 8;
// Alfabeto Crockford base32 — sin 0/O/1/I/L para que el usuario los copie bien.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface PendingMfaSession {
  jti?: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

@Injectable()
export class AuthMfaService {
  private readonly logger = new Logger(AuthMfaService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLogsService,
    private readonly redis: RedisService,
    private readonly mailer: AuthMailerService,
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>("SUPABASE_JWT_SECRET");
    this.encryptionKey = crypto.createHash("sha256").update(`arshop:mfa-session:${secret}`).digest();
  }

  /**
   * Crea una sesión MFA pendiente válida por 15 minutos.
   * Guarda en Redis/memoria Y además cifra el payload en el propio `sessionId`
   * (AES-256-GCM) para que un reinicio de proceso (Render cold start o
   * `nest start --watch`) sin Redis activo NO invalide el login en curso.
   */
  async createPendingSession(session: PendingMfaSession): Promise<string> {
    const jti = crypto.randomUUID();
    const payload = {
      ...session,
      jti,
      exp: Date.now() + PENDING_MFA_TTL_SECONDS * 1000,
    };

    await this.redis.setJson(
      `auth:pending_mfa:${jti}`,
      payload,
      PENDING_MFA_TTL_SECONDS,
    );

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  async resolvePendingSession(sessionId: string): Promise<PendingMfaSession | null> {
    if (!sessionId || typeof sessionId !== "string") return null;

    // 1) Formato cifrado autocontenido (iv.tag.ciphertext)
    const parts = sessionId.split(".");
    if (parts.length === 3) {
      try {
        const iv = Buffer.from(parts[0], "base64url");
        const tag = Buffer.from(parts[1], "base64url");
        const encrypted = Buffer.from(parts[2], "base64url");
        const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
        decipher.setAuthTag(tag);
        const json = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString("utf8");
        const parsed = JSON.parse(json) as PendingMfaSession & { exp?: number };
        if (parsed.exp && parsed.exp <= Date.now()) {
          return null;
        }
        if (parsed.jti) {
          const consumed = await this.redis.get(`auth:mfa_consumed:${parsed.jti}`);
          if (consumed) return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }

    // 2) Compatibilidad con UUID directo en Redis/memoria
    return this.redis.getJson<PendingMfaSession>(`auth:pending_mfa:${sessionId}`);
  }

  async consumePendingSession(sessionId: string, session?: PendingMfaSession): Promise<void> {
    const jti = session?.jti || sessionId;
    await this.redis.del(`auth:pending_mfa:${jti}`);
    if (session?.jti) {
      await this.redis.set(
        `auth:mfa_consumed:${session.jti}`,
        "1",
        PENDING_MFA_TTL_SECONDS,
      );
    }
  }

  async setupTotp(userId: string) {
    // Defensa: si el user ya tiene MFA activo, NO regenerar el secret.
    // Regenerar invalida la entrada que ya tiene el user en su Authenticator
    // (Google / Microsoft / etc.) y es la causa de que "a cada rato haya que
    // repetir el proceso". Para rotar el secret, el usuario debe primero
    // desactivar MFA explícitamente.
    const { data: existing } = await this.supabase.admin
      .from("user_mfa")
      .select("mfa_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.mfa_enabled) {
      throw new BadRequestException(
        "MFA ya está activo. Desactívalo primero si quieres reconfigurarlo.",
      );
    }

    const secret = speakeasy.generateSecret({
      name: `ARShop (${userId.slice(0, 8)})`,
      issuer: "ARShop",
      length: 32,
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

    // Guardar temporalmente en user_mfa (sin activar aún).
    // onConflict=user_id porque la PK es `id` autogenerado y el conflicto
    // real es sobre la unique de user_id. Sin esto, un segundo setup del
    // mismo usuario violaría la unique y el upsert fallaría.
    const { error } = await this.supabase.admin
      .from("user_mfa")
      .upsert(
        {
          user_id: userId,
          totp_secret: secret.base32,
          mfa_enabled: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      this.logger.error(`setupTotp upsert error: ${error.message}`);
      throw new BadRequestException(`No se pudo guardar el secret MFA: ${error.message}`);
    }

    return {
      id: userId,
      secret: secret.base32,
      qrCode,
    };
  }

  async activateTotp(userId: string, code: string) {
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new BadRequestException("Código debe ser 6 dígitos");
    }

    // Obtener el secret actual
    const { data: mfaRecord, error: fetchErr } = await this.supabase.admin
      .from("user_mfa")
      .select("totp_secret")
      .eq("user_id", userId)
      .single();

    if (fetchErr || !mfaRecord?.totp_secret) {
      throw new BadRequestException("No hay MFA configurada aún");
    }

    // Validar el código TOTP
    const isValid = speakeasy.totp.verify({
      secret: mfaRecord.totp_secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException("Código TOTP inválido");
    }

    // Activar MFA
    const { error: updateErr } = await this.supabase.admin
      .from("user_mfa")
      .update({ mfa_enabled: true })
      .eq("user_id", userId);

    if (updateErr) {
      throw new BadRequestException("Error activando MFA");
    }

    await this.audit.record(userId, "MFA_ENABLED", userId, {});

    return { ok: true };
  }

  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const { data: mfaRecord, error } = await this.supabase.admin
      .from("user_mfa")
      .select("totp_secret, mfa_enabled")
      .eq("user_id", userId)
      .single();

    if (error || !mfaRecord || !mfaRecord.mfa_enabled) {
      return false; // MFA no está habilitado
    }

    const isValid = speakeasy.totp.verify({
      secret: mfaRecord.totp_secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    return isValid;
  }

  async sendEmailCode(userId: string, email: string) {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000);

    // Upsert para cubrir el caso en que el user no tenga fila aún (puede
    // pasar si pidió email code sin haber hecho setup TOTP primero).
    const { error } = await this.supabase.admin
      .from("user_mfa")
      .upsert(
        {
          user_id: userId,
          email_code: code,
          email_code_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      this.logger.error(`Error saving email code for ${userId}: ${error.message}`);
      throw new BadRequestException("Error enviando código");
    }

    // Envío directo con Resend (sin depender de BullMQ/Redis), porque el
    // usuario está esperando bloqueado en el modal de inicio de sesión.
    const sent = await this.mailer.sendMfaCode(
      email,
      code,
      EMAIL_CODE_TTL_MINUTES,
    );
    if (!sent) {
      this.logger.warn(`MFA email code failed to send via Resend for ${email}`);
      throw new BadRequestException(
        "No pudimos enviar el código por correo en este momento. Intenta de nuevo.",
      );
    }
    this.logger.log(`MFA email code sent to ${email}`);

    return { ok: true };
  }

  async sendEmailCodeViaSession(sessionId: string) {
    const session = await this.resolvePendingSession(sessionId);

    if (!session) {
      throw new BadRequestException("Sesión expirada. Cierra esta ventana e inicia sesión nuevamente.");
    }

    return this.sendEmailCode(session.userId, session.email);
  }

  async verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const { data: mfaRecord, error } = await this.supabase.admin
      .from("user_mfa")
      .select("email_code, email_code_expires_at, mfa_enabled")
      .eq("user_id", userId)
      .single();

    if (error || !mfaRecord) {
      return false;
    }

    if (!mfaRecord.email_code || !mfaRecord.email_code_expires_at) {
      return false;
    }

    // Verificar expiración
    if (new Date(mfaRecord.email_code_expires_at) < new Date()) {
      return false;
    }

    // Verificar código
    if (mfaRecord.email_code !== code) {
      return false;
    }

    // Limpiar código usado
    await this.supabase.admin
      .from("user_mfa")
      .update({ email_code: null, email_code_expires_at: null })
      .eq("user_id", userId);

    return true;
  }

  async disableTotp(userId: string, code?: string) {
    // Requerir código TOTP válido para desactivar (defensa en profundidad:
    // si una sesión queda comprometida, no debería alcanzar para apagar MFA).
    const { data: mfaRecord } = await this.supabase.admin
      .from("user_mfa")
      .select("totp_secret, mfa_enabled")
      .eq("user_id", userId)
      .single();

    if (!mfaRecord?.mfa_enabled || !mfaRecord.totp_secret) {
      throw new BadRequestException("MFA no está activo");
    }

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new BadRequestException("Código debe ser 6 dígitos");
    }

    const isValid = speakeasy.totp.verify({
      secret: mfaRecord.totp_secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException("Código TOTP inválido");
    }

    const { error } = await this.supabase.admin
      .from("user_mfa")
      .update({
        mfa_enabled: false,
        totp_secret: null,
        email_code: null,
        email_code_expires_at: null,
      })
      .eq("user_id", userId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.audit.record(userId, "MFA_DISABLED", userId, {});

    return { ok: true };
  }

  // ────────────────────── Backup codes ──────────────────────

  /**
   * Genera 8 códigos de respaldo single-use. Devuelve los códigos en claro
   * UNA SOLA VEZ (para que el user los descargue/guarde). En DB sólo se
   * guardan los hashes scrypt. Invalida cualquier tanda previa.
   *
   * Formato visible: `XXXX-XXXX` (8 chars sin ambigüedad O/0, I/1).
   */
  async generateBackupCodes(userId: string): Promise<{ codes: string[] }> {
    // Requerir que MFA esté activo primero — los backup codes son un
    // segundo factor del segundo factor, no un sustituto del password.
    const enabled = await this.isMfaEnabled(userId);
    if (!enabled) {
      throw new BadRequestException(
        "Activa primero la autenticación con app antes de generar códigos de respaldo.",
      );
    }

    const codes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      const code = this.randomBackupCode();
      codes.push(code);
      hashes.push(await this.hashBackupCode(userId, code));
    }

    const { error } = await this.supabase.admin
      .from("user_mfa")
      .update({
        backup_codes: hashes,
        backup_codes_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(userId, "MFA_BACKUP_CODES_GENERATED", userId, {
      count: BACKUP_CODES_COUNT,
    });

    return { codes };
  }

  /** Cuántos backup codes le quedan al usuario. */
  async countBackupCodes(userId: string): Promise<number> {
    const { data } = await this.supabase.admin
      .from("user_mfa")
      .select("backup_codes")
      .eq("user_id", userId)
      .maybeSingle();
    const codes = (data?.backup_codes ?? []) as string[];
    return codes.length;
  }

  /**
   * Verifica un backup code durante el login. Si matchea, el RPC lo elimina
   * del array en una sola transacción con FOR UPDATE — dos requests
   * simultáneos con el mismo código no pueden consumirlo dos veces.
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const normalized = (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 8) return false;

    const hash = await this.hashBackupCode(userId, normalized);
    const { data, error } = await this.supabase.admin.rpc(
      "consume_mfa_backup_code",
      { p_user_id: userId, p_hash: hash },
    );
    if (error) {
      this.logger.warn(`consume_mfa_backup_code: ${error.message}`);
      return false;
    }

    if (data === true) {
      await this.audit.record(userId, "MFA_BACKUP_CODE_CONSUMED", userId, {});
    }
    return Boolean(data);
  }

  /** Genera un código XXXX-XXXX de 8 chars sin ambigüedad O/0, I/1. */
  private randomBackupCode(): string {
    const buf = crypto.randomBytes(8);
    const chars = Array.from(buf, (b) => BACKUP_CODE_ALPHABET[b % BACKUP_CODE_ALPHABET.length]);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
  }

  /**
   * Hash determinista del code, bindeado al userId para que una fuga de la
   * tabla no permita rainbow attacks cross-usuario. Usamos scrypt porque es
   * caro: aunque un atacante tenga los 8 hashes, forzar las 30^8 combinaciones
   * del alfabeto es inviable sin ASICs.
   */
  private async hashBackupCode(userId: string, code: string): Promise<string> {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const salt = Buffer.from(`arshop:mfa:${userId}`);
    const derived = (await scryptAsync(normalized, salt, 32)) as Buffer;
    return derived.toString("hex");
  }

  async isMfaEnabled(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from("user_mfa")
      .select("mfa_enabled")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.mfa_enabled || false;
  }

  async listFactors(userId: string) {
    const { data, error } = await this.supabase.admin
      .from("user_mfa")
      .select("mfa_enabled, totp_secret")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return {
        factors: [],
        totp: null,
      };
    }

    const factors = [];
    if (data.mfa_enabled && data.totp_secret) {
      factors.push({
        id: userId,
        factor_type: "totp",
        status: "verified",
      });
    }

    return {
      factors,
      totp: data.mfa_enabled
        ? { id: userId, factor_type: "totp" }
        : null,
    };
  }
}
