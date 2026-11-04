import { execSync } from "node:child_process";

try {
  // Verificar si el demonio de Docker está activo
  execSync("docker info", { stdio: "ignore", timeout: 4000 });
  console.log("🐳 Docker detectado: levantando contenedor Redis (arshop-redis)...");
  execSync("docker compose -f backend/docker-compose.yml up -d redis", { stdio: "inherit" });
  console.log("✅ Redis local en Docker listo en localhost:6379\n");
} catch {
  console.log("ℹ️  Docker Desktop no está en ejecución. El backend continuará usando la memoria local (fallback).\n");
}
