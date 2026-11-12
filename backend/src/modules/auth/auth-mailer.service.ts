import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { authRecoveryHtml } from "../notifications/templates/auth-recovery";
import { authVerifyHtml } from "../notifications/templates/auth-verify";
import { mfaCodeHtml } from "../notifications/templates/mfa-code";

/**
 * Correos de autenticación (recuperación de contraseña) emitidos por nuestra
 * cuenta de Resend en lugar de por el mailer interno de Supabase Auth.
 *
 * Motivo: Supabase enviaba su propio template ("Supabase Auth", en inglés)
 * desde su infraestructura de correo, rompiendo la identidad de marca y
 * arriesgando entregabilidad. Acá generamos el enlace con la Admin API
 * (`generateLink`, que NO envía nada) y despachamos el HTML nosotros mismos
 * desde el dominio verificado `no-reply@arshop.arc03.online`.
 *
 * Estos correos van directo (sin BullMQ) porque son bloqueantes para el
 * usuario: si Redis está caído, igual queremos que el enlace llegue.
 */
@Injectable()
export class AuthMailerService {
  private readonly logger = new Logger(AuthMailerService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly siteUrl: string;
  private readonly sandboxTo: string | undefined;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.getOrThrow<string>("RESEND_API_KEY"));
    this.from = config.getOrThrow<string>("RESEND_FROM");
    this.siteUrl =
      config.get<string>("APP_URL") ?? "https://arshop.co";
    this.sandboxTo = config.get<string>("RESEND_SANDBOX_TO") || undefined;
  }

  private resolveTo(email: string): string {
    return this.sandboxTo ?? email;
  }

  private subjectFor(original: string, real: string): string {
    return this.sandboxTo ? `[Sandbox → ${original}] ${real}` : real;
  }

  /**
   * Envía el enlace de recuperación de contraseña. Devuelve `false` si Resend
   * rechazó el envío para que el caller pueda caer al mailer de Supabase.
   */
  async sendPasswordRecovery(email: string, actionUrl: string): Promise<boolean> {
    return this.send({
      label: "auth-recovery",
      to: email,
      subject: this.subjectFor(email, "Restablece tu contraseña · ARShop"),
      html: authRecoveryHtml({
        actionUrl,
        minutes: 60,
        siteUrl: this.siteUrl,
      }),
    });
  }

  /**
   * Envía el enlace de confirmación de cuenta. Devuelve `false` si Resend
   * rechazó el envío (Supabase NO manda nada: el enlace lo generamos nosotros
   * con `generateLink`).
   */
  async sendEmailVerification(
    email: string,
    actionUrl: string,
    code?: string,
  ): Promise<boolean> {
    return this.send({
      label: "auth-verify",
      to: email,
      subject: this.subjectFor(email, "Confirma tu cuenta · ARShop"),
      html: authVerifyHtml({
        actionUrl,
        code,
        siteUrl: this.siteUrl,
        hours: 24,
      }),
    });
  }

  /**
   * Envía el código 2FA directamente por Resend (sin depender de BullMQ/Redis),
   * porque el usuario está esperando bloqueado en el modal de inicio de sesión.
   */
  async sendMfaCode(
    email: string,
    code: string,
    minutes: number,
  ): Promise<boolean> {
    return this.send({
      label: "auth-mfa-code",
      to: email,
      subject: this.subjectFor(email, `Tu código ARShop: ${code}`),
      html: mfaCodeHtml({ code, minutes }),
    });
  }

  private async send(opts: {
    label: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    const to = this.resolveTo(opts.to);
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: opts.subject,
        html: opts.html,
      });
      if (error) {
        this.logger.warn(
          `${opts.label}: Resend rechazó el envío a ${to}: ${error.message}`,
        );
        return false;
      }
      this.logger.log(
        this.sandboxTo
          ? `${opts.label} redirigido a sandbox ${to} (original: ${opts.to})`
          : `${opts.label} enviado a ${to}`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `${opts.label}: error de red con Resend (${err?.message ?? err})`,
      );
      return false;
    }
  }
}
