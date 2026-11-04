"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import {
  apiAdminListAuditLogs,
  type AuditLogEntry,
} from "@/lib/api";

const ACTIONS = [
  "AUTH_LOGIN",
  "AUTH_LOGIN_FAIL",
  "AUTH_LOGOUT",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DELETE",
  "USER_BLOCK",
  "USER_UNBLOCK",
  "BULK_USER_IMPORT",
  "MFA_ENABLED",
  "MFA_DISABLED",
];

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async (newCursor?: string | null) => {
    try {
      setError(null);
      const result = await apiAdminListAuditLogs(newCursor || undefined, action || undefined);
      if (newCursor) {
        setLogs((prev) => [...prev, ...result.rows]);
      } else {
        setLogs(result.rows);
      }
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || "Error cargando logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setCursor(null);
    load(null);
  }, [action]);

  if (loading && logs.length === 0) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-carbon">Logs de acceso</h2>
      </div>

      {error && (
        <div className="border border-carbon/20 bg-stone/40 p-3 caption text-[12px] text-carbon">
          {error}
        </div>
      )}

      <select
        value={action}
        onChange={(e) => setAction(e.target.value)}
        className="border-b border-smoke px-0 py-2 caption text-[13px] text-carbon outline-none bg-transparent"
      >
        <option value="">Todas las acciones</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <div className="space-y-2 border border-smoke divide-y">
        {logs.map((log) => (
          <div key={log.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="caption text-[12px] font-mono text-graphite">
                  {new Date(log.created_at).toLocaleString("es-CO")}
                </div>
                <div className="caption text-[13px] text-carbon mt-1">
                  <span className="font-medium">{log.action}</span>
                  {log.target && <span className="text-graphite"> → {log.target.slice(0, 20)}</span>}
                </div>
              </div>
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="ml-4 p-1 text-graphite hover:text-carbon transition-colors"
              >
                <ChevronDown
                  size={16}
                  className={`transition-transform ${expandedId === log.id ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {expandedId === log.id && (
              <div className="mt-3 pt-3 border-t border-smoke/50 space-y-2">
                <div className="caption text-[11px] text-graphite">
                  <div><strong>Actor:</strong> {log.actor_id ? log.actor_id.slice(0, 8) : "SYSTEM"}</div>
                  <div><strong>Target:</strong> {log.target}</div>
                </div>
                {Object.keys(log.metadata).length > 0 && (
                  <div className="bg-stone/20 p-2 rounded caption text-[11px] text-carbon font-mono overflow-auto max-h-48">
                    <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {logs.length === 0 && (
          <div className="p-8 text-center caption text-graphite">No hay logs.</div>
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="w-full py-2 caption text-[12px] uppercase tracking-wider border border-smoke text-carbon hover:border-carbon transition-colors disabled:opacity-50"
        >
          {loading ? "Cargando..." : "Cargar más"}
        </button>
      )}
    </div>
  );
}
