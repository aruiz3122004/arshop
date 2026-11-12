import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "../../supabase/supabase.service";
import { RedisService } from "../../redis/redis.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthMfaService } from "./auth-mfa.service";
import { AuthMailerService } from "./auth-mailer.service";
import type { SignUpDto } from "./dto/sign-up.dto";
import type { SignInDto } from "./dto/sign-in.dto";

// Lockout por email ante intentos fallidos (defensa en profundidad sobre el
// throttle por IP del @nestjs/throttler, que ya aplica 5 req/min a /auth/*)
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 min

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshInFlight = new Map<
    string,
    Promise<{ accessToken: string; refreshToken: string; expiresAt?: number }>
  >();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogsService,
    private readonly mfa: AuthMfaService,
    private readonly mailer: AuthMailerService,
  ) {}

  private failKey(email: string) {
    return `auth:fail:${email.toLowerCase().trim()}`;
  }

  private async getFailCount(email: string): Promise<number> {
    const v = await this.redis.get(this.failKey(email));
    return v ? Number(v) : 0;
  }

  private async recordFailure(email: string): Promise<number> {
    const key = this.failKey(email);
    const current = await this.getFailCount(email);
    const next = current + 1;
    await this.redis.set(key, String(next), LOCKOUT_WINDOW_SECONDS);
    return next;
  }

  private async clearFailures(email: string) {
    await this.redis.del(this.failKey(email));
  }

  private get requireEmailVerify(): boolean {
    return this.config.get<string>("REQUIRE_EMAIL_VERIFY") === "true";
  }

  async signUp(dto: SignUpDto) {
    const requireVerify = this.requireEmailVerify;

    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      // Si la verificación está activa el usuario queda pendiente: NO se puede
      // iniciar sesión hasta confirmar el correo.
      email_confirm: !requireVerify,
      user_metadata: { full_name: dto.fullName ?? null },
    });
    if (error) throw new BadRequestException(error.message);

    // Si el schema público tiene un trigger que inserta en profiles al crear
    // el usuario, no hace falta tocar nada más. Si no, lo insertamos aquí.
    if (data.user) {
      await this.supabase.admin.from("profiles").upsert({
        id: data.user.id,
        email: data.user.email,
        full_name: dto.fullName ?? null,
        role: "CUSTOMER",
        blocked: false,
      });
    }

    // Igual que en recuperación: Supabase sólo genera el token, el correo lo
    // manda Resend desde el dominio propio (`admin.createUser` no envía nada).
    let emailSent = false;
    if (requireVerify) {
      emailSent = await this.sendVerificationLink(dto.email, dto.password);
    }

    return {
      id: data.user?.id,
      email: data.user?.email,
      requiresEmailVerification: requireVerify,
      emailSent: requireVerify ? emailSent : undefined,
    };
  }

  /** Genera el enlace de confirmación y lo despacha por Resend. */
  private async sendVerificationLink(
    email: string,
    password: string,
  ): Promise<boolean> {
    const appUrl =
      this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const redirectTo = `${appUrl.replace(/\/$/, "")}/verificar`;

    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo },
    });

    const actionUrl = data?.properties?.action_link;
    if (error || !actionUrl) {
      this.logger.warn(
        `generateLink(signup) falló para ${await this.anonEmail(email)}: ${error?.message ?? "sin action_link"}`,
      );
      return false;
    }

    return this.mailer.sendEmailVerification(
      email,
      actionUrl,
      data?.properties?.email_otp,
    );
  }

  async signIn(dto: SignInDto, ip?: string, userAgent?: string) {
    // Logs: email anonimizado (prefijo + hash corto) para no filtrar PII a
    // los sumideros de logs. El email crudo se guarda en audit_logs sólo
    // porque la tabla ya está protegida por RLS admin-only.
    const emailTag = await this.anonEmail(dto.email);

    // 1) Si el email está bloqueado por fallos previos, no toquemos Supabase.
    const prior = await this.getFailCount(dto.email);
    if (prior >= MAX_FAILED_ATTEMPTS) {
      this.logger.warn(`signIn bloqueado por lockout para ${emailTag}`);
      await this.audit.record("system", "AUTH_LOGIN_FAIL", dto.email, {
        reason: "lockout",
        ip,
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos o recupera tu contraseña.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Usamos authClient() (efímero) en lugar de `admin` para que el JWT del
    // user autenticado NO contamine la sesión global del cliente admin.
    // Si usáramos admin, los queries subsiguientes dejarían de bypassar RLS.
    const { data, error } = await this.supabase.authClient().auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (error || !data.session) {
      // "Email not confirmed" NO es una credencial inválida: la cuenta existe y
      // la contraseña puede ser correcta. Sin este caso, el usuario veía
      // "Credenciales inválidas" y quedaba atrapado sin poder entrar ni saber
      // por qué (bug reportado al registrarse).
      if (/email not confirmed|not confirmed/i.test(error?.message ?? "")) {
        this.logger.warn(`signIn bloqueado: email sin confirmar ${emailTag}`);
        throw new BadRequestException(
          "Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada (y spam) o solicita un nuevo enlace en /verificar/reenviar.",
        );
      }
      const total = await this.recordFailure(dto.email);
      this.logger.warn(
        `signIn falló para ${emailTag} (intento ${total}/${MAX_FAILED_ATTEMPTS}): ${error?.message}`,
      );
      await this.audit.record("system", "AUTH_LOGIN_FAIL", dto.email, {
        attempt: total,
        ip,
      });
      throw new UnauthorizedException("Credenciales inválidas");
    }

    // 2) Login exitoso → limpiar contador y verificar MFA
    await this.clearFailures(dto.email);

    const hasMfa = await this.mfa.isMfaEnabled(data.user?.id ?? "");

    if (hasMfa) {
      // Guardar sesión temporal (15 minutos, autocontenida + Redis/memoria)
      const sessionId = await this.mfa.createPendingSession({
        userId: data.user?.id ?? "",
        email: data.user?.email ?? "",
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      });

      return {
        status: "pending_mfa",
        sessionId,
        requiresMfa: true,
      } as any;
    }

    // Sin MFA: retornar token
    await this.audit.record(data.user?.id ?? null, "AUTH_LOGIN", data.user?.id ?? null, {
      email: data.user?.email,
      ip,
      userAgent,
    });

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: { id: data.user?.id, email: data.user?.email },
    };
  }

  async refresh(refreshToken: string) {
    const clean = (refreshToken ?? "").trim();
    if (!clean || clean === "undefined" || clean === "null") {
      throw new UnauthorizedException("Sesión expirada");
    }

    const tokenHash = await this.sha256(clean);
    const graceKey = `auth:refresh_grace:${tokenHash}`;

    // 1) Si otro request acaba de rotar este mismo refresh_token en los últimos
    //    60s (concurrencia entre componentes o pestañas), devolvemos la nueva
    //    pareja cacheada sin golpear a Supabase (evita Refresh Token Reuse Revocation).
    const cached = await this.redis.getJson<{
      accessToken: string;
      refreshToken: string;
      expiresAt?: number;
    }>(graceKey);
    if (cached?.accessToken && cached?.refreshToken) {
      return cached;
    }

    // 2) Deduplicar requests simultáneos en vuelo para el mismo refresh_token.
    const existing = this.refreshInFlight.get(tokenHash);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const { data, error } = await this.supabase.authClient().auth.refreshSession({
          refresh_token: clean,
        });
        if (error || !data.session) {
          throw new UnauthorizedException("Sesión expirada");
        }
        const result = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        };
        await this.redis.setJson(graceKey, result, 60);
        return result;
      } finally {
        this.refreshInFlight.delete(tokenHash);
      }
    })();

    this.refreshInFlight.set(tokenHash, promise);
    return promise;
  }

  async signOut(accessToken: string, userId?: string) {
    const { error } = await this.supabase.forUser(accessToken).auth.signOut();
    if (error) this.logger.warn(`signOut: ${error.message}`);
    if (userId) {
      await this.audit.record(userId, "AUTH_LOGOUT", userId, {});
    }
    return { ok: true };
  }

  /**
   * Dispara el correo de recuperación de contraseña (idempotente).
   * Deduplicación: idempotencia en Redis con TTL 60s. Dos requests al mismo email
   * en 60s resulta en un solo correo enviado.
   *
   * El correo lo emite Resend desde el dominio propio (`RESEND_FROM`), no el
   * mailer de Supabase Auth: mismo remitente verificado, mismo branding y
   * textos en español que el resto de la comunicación transaccional.
   *
   * Siempre devuelve ok:true para no filtrar qué emails están registrados.
   */
  async requestPasswordReset(email: string) {
    const normalized = email.toLowerCase().trim();
    const hash = await this.sha256(normalized);
    const dedupeKey = `auth:reset:${hash}`;

    // Intentar setear la clave. Si ya existe, no enviar correo (idempotente).
    const wasSet = await this.redis.setNx(dedupeKey, "1", 60);
    if (!wasSet) {
      // Ya se envió un correo hace poco para este email
      this.logger.debug(`requestPasswordReset deduplicado para ${normalized}`);
      return { ok: true };
    }

    const appUrl =
      this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const redirectTo = `${appUrl.replace(/\/$/, "")}/recuperar`;

    const sentByResend = await this.sendRecoveryLink(normalized, redirectTo);
    if (!sentByResend) {
      // Fallback: si no pudimos generar/enviar el enlace con Resend, dejamos
      // que Supabase mande su propio correo (su SMTP debe apuntar a Resend).
      const { error } =
        await this.supabase.admin.auth.resetPasswordForEmail(normalized, {
          redirectTo,
        });
      if (error) {
        // No lanzamos: para evitar enumeración de emails, respondemos ok.
        this.logger.warn(
          `requestPasswordReset(${await this.anonEmail(normalized)}): ${error.message}`,
        );
      }
    }
    return { ok: true };
  }

  /**
   * Genera el enlace de recovery con la Admin API (`generateLink` no envía
   * correo por sí sola) y lo despacha por Resend. Devuelve `false` si no se
   * pudo construir el enlace o si Resend falló.
   */
  private async sendRecoveryLink(
    email: string,
    redirectTo: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    const actionUrl = data?.properties?.action_link;
    if (error || !actionUrl) {
      this.logger.warn(
        `generateLink(recovery) falló para ${await this.anonEmail(email)}: ${error?.message ?? "sin action_link"}`,
      );
      return false;
    }

    return this.mailer.sendPasswordRecovery(email, actionUrl);
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    const array = Array.from(new Uint8Array(digest));
    return array.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Tag para logs: devuelve `a****b@d.co#1a2b3c4d`. Útil para correlacionar
   * eventos de un mismo usuario sin dejar emails crudos en la sinca de logs.
   */
  private async anonEmail(email: string): Promise<string> {
    const normalized = (email ?? "").toLowerCase().trim();
    if (!normalized) return "<empty>";
    const [local, domain] = normalized.split("@");
    const masked =
      local.length <= 2
        ? `${local[0] ?? ""}*`
        : `${local[0]}${"*".repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}`;
    const hash = (await this.sha256(normalized)).slice(0, 8);
    return `${masked}@${domain ?? ""}#${hash}`;
  }

  /**
   * Toma el access_token que llegó en el hash del enlace de recovery,
   * verifica que corresponda a un usuario válido y actualiza su contraseña
   * usando el admin API (así no dependemos de la sesión del cliente).
   */
  /**
   * Reenvía el correo de confirmación con el mismo mecanismo que el registro:
   * `generateLink` (Supabase) + Resend (transporte). Nunca responde si el email
   * existe: exige que las credenciales correspondan a una cuenta pendiente.
   */
  async resendVerification(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException("Email y contraseña son requeridos.");
    }

    const { error } = await this.supabase.authClient().auth.signInWithPassword({
      email,
      password,
    });

    // Credenciales correctas ⇒ la cuenta ya está confirmada.
    if (!error) {
      return { ok: true, alreadyConfirmed: true };
    }

    if (!/not confirmed/i.test(error.message ?? "")) {
      throw new UnauthorizedException(
        "Esos datos no corresponden a una cuenta pendiente de verificar.",
      );
    }

    const sent = await this.sendVerificationLink(email, password);
    if (!sent) {
      throw new BadRequestException(
        "No pudimos enviar el correo de verificación. Intenta de nuevo en unos minutos.",
      );
    }
    return { ok: true, alreadyConfirmed: false };
  }

  /**
   * Valida el código OTP que viaja en el correo de confirmación (útil si el
   * enlace se abrió en otro dispositivo) y deja la sesión iniciada.
   */
  async verifyEmail(email: string, token: string) {
    if (!email || !token) {
      throw new BadRequestException("Faltan el correo y el código.");
    }

    const { data, error } = await this.supabase
      .authClient()
      .auth.verifyOtp({ email, token: token.trim(), type: "signup" });

    if (error || !data.session) {
      throw new BadRequestException(
        "El código es inválido o expiró. Solicita un correo nuevo.",
      );
    }

    await this.clearFailures(email);
    const verifiedId = data.user?.id ?? null;
    await this.audit.record(
      verifiedId,
      "AUTH_EMAIL_VERIFIED",
      verifiedId ?? "verify-email",
      { email: data.user?.email },
    );

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: { id: data.user?.id, email: data.user?.email },
    };
  }

  async updatePassword(accessToken: string, newPassword: string) {
    if (!accessToken || !newPassword) {
      throw new BadRequestException("Faltan datos para actualizar contraseña.");
    }
    if (newPassword.length < 8) {
      throw new BadRequestException(
        "La contraseña debe tener al menos 8 caracteres.",
      );
    }

    const { data, error } = await this.supabase.admin.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new UnauthorizedException(
        "Enlace de recuperación inválido o expirado.",
      );
    }

    const { error: updErr } =
      await this.supabase.admin.auth.admin.updateUserById(data.user.id, {
        password: newPassword,
      });
    if (updErr) throw new BadRequestException(updErr.message);

    return { ok: true, email: data.user.email };
  }

  async completeMfa(
    sessionId: string,
    code: string,
    method: "totp" | "email" | "backup",
  ) {
    // Recuperar sesión temporal
    const session = await this.mfa.resolvePendingSession(sessionId);

    if (!session) {
      throw new UnauthorizedException(
        "Sesión MFA expirada. Cierra esta ventana e inicia sesión nuevamente.",
      );
    }

    // Verificar el código según el método
    let isValid = false;
    if (method === "totp") {
      isValid = await this.mfa.verifyTotp(session.userId, code);
    } else if (method === "email") {
      isValid = await this.mfa.verifyEmailCode(session.userId, code);
    } else if (method === "backup") {
      // Backup code: single-use. verifyBackupCode ya lo elimina del array
      // atómicamente si matchea.
      isValid = await this.mfa.verifyBackupCode(session.userId, code);
    }

    if (!isValid) {
      throw new UnauthorizedException("Código MFA inválido");
    }

    // Limpiar sesión temporal
    await this.mfa.consumePendingSession(sessionId, session);

    // Registrar login exitoso
    await this.audit.record(session.userId, "AUTH_LOGIN", session.userId, {
      email: session.email,
      mfaMethod: method,
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: { id: session.userId, email: session.email },
    };
  }

  /**
   * Bootstrap one-shot: promueve un email a ADMIN usando ADMIN_SETUP_TOKEN.
   *
   * Hardening: el token es **single-use**. Al consumirse se marca en Redis
   * (clave `auth:admin_setup:consumed:<sha256(token)>`) con TTL 1 año. Un
   * token filtrado deja de servir después del primer uso exitoso aunque
   * siga en el env del backend. Para rotar: cambiar ADMIN_SETUP_TOKEN en
   * el env, lo cual invalida la marca anterior automáticamente.
   *
   * Comparación en tiempo constante para no filtrar prefijos del token
   * por side-channel.
   */
  async promoteAdmin(
    token: string,
    email: string,
    password: string,
  ): Promise<{ ok: boolean; user: { id: string; email: string } }> {
    const setupToken = this.config.get<string>("ADMIN_SETUP_TOKEN");
    if (!setupToken || !token || !this.constantTimeEqual(token, setupToken)) {
      throw new UnauthorizedException("Token inválido o expirado.");
    }

    const tokenHash = await this.sha256(token);
    const consumedKey = `auth:admin_setup:consumed:${tokenHash}`;
    const alreadyUsed = await this.redis.get(consumedKey);
    if (alreadyUsed) {
      await this.audit.record(
        null,
        "ADMIN_SETUP_TOKEN_REUSE_ATTEMPT",
        "promote-admin",
        { email: email?.toLowerCase().trim() ?? null },
      );
      throw new UnauthorizedException(
        "Token ya utilizado. Rota ADMIN_SETUP_TOKEN para emitir uno nuevo.",
      );
    }

    if (!email || !password) {
      throw new BadRequestException("Email y contraseña son requeridos.");
    }

    if (password.length < 8) {
      throw new BadRequestException(
        "La contraseña debe tener al menos 8 caracteres.",
      );
    }

    const normalized = email.toLowerCase().trim();

    // Reservar el token ANTES de crear el usuario para cerrar la ventana
    // de carrera (dos requests simultáneos con el mismo token). SETNX con
    // marcador temporal; si cualquier paso falla, lo liberamos.
    const reserved = await this.redis.setNx(
      consumedKey,
      "pending",
      60 * 60 * 24 * 365, // 1 año
    );
    if (!reserved) {
      throw new UnauthorizedException("Token ya utilizado.");
    }

    try {
      const { data, error } = await this.supabase.admin.auth.admin.createUser({
        email: normalized,
        password,
        email_confirm: true,
      });

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (!data.user) {
        throw new BadRequestException("No se pudo crear el usuario.");
      }

      // Esperar a que el trigger cree el profile, luego actualizar el rol
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { error: updateErr } = await this.supabase.admin
        .from("profiles")
        .update({ role: "ADMIN" })
        .eq("id", data.user.id);

      if (updateErr) {
        this.logger.warn(`promoteAdmin: error actualizando role: ${updateErr.message}`);
      }

      // Confirmar consumo del token (marcador final).
      await this.redis.set(
        consumedKey,
        JSON.stringify({ userId: data.user.id, at: new Date().toISOString() }),
        60 * 60 * 24 * 365,
      );

      await this.audit.record(data.user.id, "ADMIN_PROMOTED_VIA_SETUP_TOKEN", data.user.id, {});

      return {
        ok: true,
        user: { id: data.user.id, email: data.user.email ?? "" },
      };
    } catch (err) {
      // Liberar la reserva si la creación falló (el admin puede reintentar
      // tras corregir el email/password).
      await this.redis.del(consumedKey).catch(() => {});
      throw err;
    }
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
  }

  /**
   * Acceso rápido de demostración (Modo Portafolio) para evaluar los 3 roles
   * (CUSTOMER, ADMIN, REPARTIDOR) con 1 clic. Si la cuenta demo no existe aún
   * en Supabase Auth, la aprovisiona automáticamente junto con su perfil.
   */
  async demoSignIn(
    role: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
    ip?: string,
    userAgent?: string,
  ) {
    if (this.config.get<string>("DEMO_MODE_DISABLED") === "true") {
      throw new UnauthorizedException("El modo demo está deshabilitado.");
    }

    const demoAccounts: Record<
      "CUSTOMER" | "ADMIN" | "REPARTIDOR",
      { email: string; password: string; fullName: string }
    > = {
      CUSTOMER: {
        email: "demo.cliente@arshop.co",
        password: "DemoArshop2026!",
        fullName: "Valentina Restrepo (Cliente Demo)",
      },
      ADMIN: {
        email: "demo.admin@arshop.co",
        password: "DemoArshop2026!",
        fullName: "Andrés Mendoza (Admin Demo)",
      },
      REPARTIDOR: {
        email: "demo.repartidor@arshop.co",
        password: "DemoArshop2026!",
        fullName: "Carlos Ramírez (Domiciliario Demo)",
      },
    };

    const account = demoAccounts[role];
    if (!account) {
      throw new BadRequestException("Rol de demostración inválido.");
    }

    await this.clearFailures(account.email);

    let signInRes = await this.supabase
      .authClient()
      .auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });

    if (signInRes.error || !signInRes.data.session) {
      // Crear o actualizar usuario demo con service_role
      const { data: created, error: createErr } =
        await this.supabase.admin.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { full_name: account.fullName },
        });

      if (createErr && !/already|exists/i.test(createErr.message)) {
        throw new BadRequestException(createErr.message);
      }

      if (!created?.user) {
        // Si ya existía con otra contraseña o sin confirmar, lo normalizamos
        const { data: usersList } =
          await this.supabase.admin.auth.admin.listUsers({ perPage: 200 });
        const existingUser = usersList?.users?.find(
          (u) => u.email?.toLowerCase() === account.email.toLowerCase(),
        );
        if (existingUser) {
          await this.supabase.admin.auth.admin.updateUserById(existingUser.id, {
            password: account.password,
            email_confirm: true,
          });
        }
      }

      signInRes = await this.supabase.authClient().auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
    }

    if (signInRes.error || !signInRes.data.session || !signInRes.data.user) {
      throw new UnauthorizedException(
        "No se pudo iniciar la sesión de demostración.",
      );
    }

    const userId = signInRes.data.user.id;

    // Garantizar el rol exacto en public.profiles y desactivar MFA en la cuenta demo
    const { error: profileErr } = await this.supabase.admin.from("profiles").upsert({
      id: userId,
      email: account.email,
      full_name: account.fullName,
      role,
      blocked: false,
    });
    if (profileErr) {
      this.logger.warn(`demoSignIn: error upsert perfil: ${profileErr.message}`);
    }

    await this.supabase.admin.from("user_mfa").upsert({
      user_id: userId,
      mfa_enabled: false,
    });

    // Si es REPARTIDOR, asegurar registro en public.domiciliarios
    if (role === "REPARTIDOR") {
      const { data: existingDom } = await this.supabase.admin
        .from("domiciliarios")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingDom) {
        await this.supabase.admin.from("domiciliarios").insert({
          user_id: userId,
          nombre_completo: account.fullName,
          departamento: "Cundinamarca",
          ciudad: "Bogotá",
          vehiculo: "Moto Yamaha FZ 2.0",
          placa: "DEM99G",
          ciudad_placa: "Bogotá",
          disponibilidad: "DISPONIBLE",
        });
      }
    }

    await this.audit.record(userId, "AUTH_DEMO_LOGIN", userId, {
      role,
      email: account.email,
      ip,
      userAgent,
    });

    return {
      accessToken: signInRes.data.session.access_token,
      refreshToken: signInRes.data.session.refresh_token,
      expiresAt: signInRes.data.session.expires_at,
      user: { id: userId, email: account.email },
      role,
    };
  }

  private _unusedSentinel(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
  }
}
