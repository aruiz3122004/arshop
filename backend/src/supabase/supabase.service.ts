import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _admin!: SupabaseClient;
  private _url!: string;
  private _anonKey!: string;
  private _serviceKey!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this._url = this.config.getOrThrow<string>("SUPABASE_URL");
    this._anonKey = this.config.getOrThrow<string>("SUPABASE_ANON_KEY");
    this._serviceKey = this.config.getOrThrow<string>("SUPABASE_SERVICE_ROLE_KEY");

    this._admin = createClient(this._url, this._serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "arshop-api" } },
    });

    this.logger.log(`Supabase client ready: ${this._url}`);
  }

  /** Cliente con service_role — bypassa RLS. Uso exclusivo del backend. */
  get admin(): SupabaseClient {
    return this._admin;
  }

  /**
   * Cliente efímero para operaciones de GoTrue que mutan sesión
   * (`signInWithPassword`, `refreshSession`, etc). No usar el `admin`
   * compartido para esto: `supabase-js` guarda la sesión del último auth
   * en memoria del cliente, y los siguientes queries con ese mismo
   * instance van a parar al JWT del user, perdiendo el bypass de RLS del
   * service_role. Un cliente nuevo por request evita esa contaminación.
   *
   * Usa `anon` key (no `service_role`): el login/refresh de GoTrue sólo
   * necesita permisos públicos. Dar service_role a un path que recibe
   * password del cliente aumenta la superficie si algún día se loguea el
   * header o se filtra en telemetría.
   */
  authClient(): SupabaseClient {
    return createClient(this._url, this._anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Cliente scoped a un usuario (respeta RLS). Útil cuando quieres que
   * las queries hereden los permisos del request.
   */
  forUser(accessToken: string): SupabaseClient {
    return createClient(this._url, this._anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
