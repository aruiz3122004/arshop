import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "../../supabase/supabase.service";

// web-push se carga dinámicamente para que el backend arranque aunque la
// dependencia no esté instalada todavía o VAPID no esté configurado.
type WebPush = typeof import("web-push");

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private webpush: WebPush | null = null;
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    const pub = this.config.get<string>("VAPID_PUBLIC_KEY");
    const priv = this.config.get<string>("VAPID_PRIVATE_KEY");
    const subject = this.config.get<string>("VAPID_SUBJECT");

    if (!pub || !priv || !subject) {
      this.logger.warn("Web Push deshabilitado: faltan claves VAPID.");
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.webpush = require("web-push") as WebPush;
      this.webpush.setVapidDetails(subject, pub, priv);
      this.enabled = true;
      this.logger.log("Web Push habilitado.");
    } catch (e) {
      this.logger.warn(
        `Dependencia 'web-push' no instalada; push deshabilitado (${(e as Error).message}).`,
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    const { error } = await this.supabase.admin.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    const { error } = await this.supabase.admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
    return { ok: true };
  }

  /** Envía una notificación a todos los endpoints de un usuario. */
  async sendToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      url?: string;
      /** Mantiene la notificación visible hasta que el usuario la atienda. */
      requireInteraction?: boolean;
      /** Agrupa/reemplaza notificaciones del mismo asunto. */
      tag?: string;
    },
  ) {
    if (!this.enabled || !this.webpush) return { sent: 0 };

    const { data: subs } = await this.supabase.admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs?.length) return { sent: 0 };

    const encoded = JSON.stringify(payload);
    let sent = 0;
    for (const s of subs) {
      try {
        await this.webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          encoded,
        );
        sent++;
      } catch (e: any) {
        this.logger.warn(`push a ${s.endpoint.slice(0, 48)}… falló: ${e?.message}`);
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          // Suscripción muerta → borrar
          await this.supabase.admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        }
      }
    }
    return { sent };
  }
}
