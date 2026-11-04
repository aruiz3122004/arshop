import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthMfaService } from "./auth-mfa.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../../common/types/user";

/**
 * MFA está abierto a todos los usuarios autenticados — es un hardening
 * voluntario de la cuenta. Antes estaba restringido a ADMIN, lo cual dejaba
 * las cuentas de clientes sin defensa contra credential stuffing.
 */
@Controller("auth/mfa")
export class AuthMfaController {
  constructor(private readonly mfa: AuthMfaService) {}

  @Post("totp/setup")
  setupTotp(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.setupTotp(user.id);
  }

  @Post("totp/activate")
  @HttpCode(HttpStatus.OK)
  activateTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body("code") code: string,
  ) {
    return this.mfa.activateTotp(user.id, code);
  }

  /**
   * Dispara el email con el código de respaldo durante el flujo de login.
   * Público porque el user todavía NO tiene cookies de sesión: su único
   * "pase" es el sessionId que recibió del endpoint /auth/sign-in cuando
   * respondió `pending_mfa`. El sessionId vive 10 min en Redis.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post("email/send")
  @HttpCode(HttpStatus.OK)
  sendEmailCode(@Body("sessionId") sessionId: string) {
    return this.mfa.sendEmailCodeViaSession(sessionId);
  }

  @Delete("disable")
  @HttpCode(HttpStatus.OK)
  disableTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body("code") code: string,
  ) {
    return this.mfa.disableTotp(user.id, code);
  }

  @Get("factors")
  listFactors(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.listFactors(user.id);
  }

  // ──────────────────── Backup codes ────────────────────

  /**
   * Genera (o regenera) 8 códigos de respaldo single-use.
   * Devuelve los códigos en claro UNA SOLA VEZ — el frontend debe mostrarlos
   * y permitir descargarlos. En DB sólo quedan los hashes.
   */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post("backup-codes/generate")
  generateBackupCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.generateBackupCodes(user.id);
  }

  /** Cuántos backup codes le quedan al usuario (sin exponer los hashes). */
  @Get("backup-codes/count")
  countBackupCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.countBackupCodes(user.id).then((count) => ({ count }));
  }
}
