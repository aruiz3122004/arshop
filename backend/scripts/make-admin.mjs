// Script one-shot: promueve a ADMIN el usuario con el email indicado.
// Uso:  node --env-file=.env scripts/make-admin.mjs <email>
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserByEmail(target) {
  // listUsers no filtra por email; paginamos hasta encontrarlo.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

const authUser = await findAuthUserByEmail(email);
if (!authUser) {
  console.error(
    `No existe usuario con email "${email}" en auth.users. Debe registrarse primero (POST /auth/sign-up o desde el frontend).`,
  );
  process.exit(2);
}

const { data: upserted, error: upErr } = await supabase
  .from("profiles")
  .upsert(
    {
      id: authUser.id,
      email: authUser.email,
      role: "ADMIN",
      blocked: false,
    },
    { onConflict: "id" },
  )
  .select("id, email, role, blocked")
  .single();

if (upErr) {
  console.error("Error actualizando profiles:", upErr.message);
  process.exit(3);
}

console.log("OK — Usuario promovido a ADMIN:");
console.log(JSON.stringify(upserted, null, 2));
