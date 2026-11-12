/**
 * Escapa caracteres HTML en texto que proviene de datos de usuario para
 * evitar inyección de markup/JS en los correos. Uso: `${esc(opts.reason)}`.
 */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
