# ═════════════════════════════════════════════════════════════════════════
# ARShop API — Dockerfile
#
# ⚠️  CONTEXTO DE BUILD: construir desde la **raíz del monorepo**:
#
#       docker build -f backend/Dockerfile -t arshop-api .
#
#     En Render:
#       - Root directory: /
#       - Dockerfile path: backend/Dockerfile
# ═════════════════════════════════════════════════════════════════════════

# ─── Build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

# Manifiestos del workspace (mejor caching de capas)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY apps/web/package.json ./apps/web/

# Instalar deps solo del subproyecto backend
RUN pnpm install --filter @arshop/api... --frozen-lockfile

# Copiar código y compilar
COPY backend ./backend
RUN pnpm --filter @arshop/api build

# ─── Runtime (producción) ─────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copia el workspace completo (ya resuelto con symlinks pnpm) y entra al backend.
# Más predecible que `pnpm deploy` y mantiene los symlinks de pnpm intactos.
COPY --from=build --chown=nestjs:nodejs /repo /app

WORKDIR /app/backend
USER nestjs
EXPOSE 4000
CMD ["node", "dist/main.js"]
