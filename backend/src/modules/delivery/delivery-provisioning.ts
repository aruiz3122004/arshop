import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garantiza que un usuario con rol REPARTIDOR tenga su fila en
 * `public.domiciliarios`.
 *
 * Contexto: el acceso al panel se decide por `profiles.role`, pero todos los
 * endpoints `/delivery/*` exigen la ficha operativa. Cambiar el rol desde SQL
 * (o desde el panel de usuarios) dejaba al usuario con el botón visible y un
 * 404 "No tienes perfil de domiciliario" en cada llamada.
 *
 * La migración `026_delivery_role_sync.sql` hace esto mismo vía trigger; esta
 * función es la red de seguridad por si el entorno aún no la tiene aplicada (o
 * si el insert del trigger falló). Es idempotente.
 *
 * Los valores provisionales dejan al repartidor INACTIVO hasta que complete
 * ciudad/vehículo/placa en `/domiciliario/configuracion`.
 */
export async function ensureDomiciliarioRow(
  admin: SupabaseClient,
  userId: string,
) {
  const { data: existing, error: selectErr } = await admin
    .from("domiciliarios")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectErr) throw selectErr;
  if (existing) return existing;

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const { data: created, error } = await admin
    .from("domiciliarios")
    .insert({
      user_id: userId,
      nombre_completo:
        (profile as any)?.full_name ||
        (profile as any)?.email ||
        "Repartidor",
      departamento: "Sin asignar",
      ciudad: "Sin asignar",
      vehiculo: "Sin asignar",
      placa: "SIN-PLACA",
      ciudad_placa: "Sin asignar",
      disponibilidad: "INACTIVO",
    })
    .select()
    .single();

  if (error) {
    // Carrera con el trigger u otra request: reintentamos la lectura.
    const { data: retry } = await admin
      .from("domiciliarios")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (retry) return retry;
    throw error;
  }

  return created;
}
