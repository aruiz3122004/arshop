/**
 * DEPRECATED: Este script sembraba la DB a partir del catálogo mock del frontend
 * (apps/web/src/lib/catalog.ts). Ese catálogo fue eliminado en favor del CRUD real.
 *
 * Para sembrar la base de datos usa el archivo canónico:
 *   db/seed.sql          — 5 productos de prueba con imágenes de Unsplash
 *   db/migrations/       — migraciones acumulativas
 *
 * Para poblar el catálogo real, usa el panel admin en /admin/productos.
 */

console.error(
  "Este script está obsoleto. Usa db/seed.sql en el SQL Editor de Supabase.",
);
process.exit(1);
