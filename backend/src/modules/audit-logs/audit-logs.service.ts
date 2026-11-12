import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Registra una acción sensible. Insert best-effort: errores de audit no
   * deben hacer fallar la operación principal — se loguean y siguen.
   */
  async record(
    actorId: string | null,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ) {
    const { error } = await this.supabase.admin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target,
      metadata,
    });
    if (error) {
      this.logger.warn(`Failed to record audit log (${action}): ${error.message}`);
    }
  }

  async list(limit = 100, cursor?: string, action?: string) {
    let q = this.supabase.admin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (action) {
      q = q.eq("action", action);
    }

    q = q.limit(limit + 1); // +1 para detectar si hay más
    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (error) throw error;

    const hasMore = data && data.length > limit;
    const rows = hasMore ? data!.slice(0, -1) : data || [];
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return { rows, nextCursor, hasMore };
  }
}
