# syntax=docker/dockerfile:1
# Build context = RAIZ do repositório (é um workspace npm).
#   docker build -f infrastructure/docker/backend.Dockerfile .

# ---- Estágio de build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Manifests primeiro (cache de camadas): só eles mudam raramente.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN mkdir -p services/ai-coach services/media-server services/sandbox \
 && npm ci --workspace backend --include-workspace-root

COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
COPY backend/prisma ./backend/prisma
# `generate` + `tsc` do workspace do backend → backend/dist.
RUN npm run build --workspace backend

# ---- Estágio de runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# argon2 é nativo: precisa de toolchain de build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN mkdir -p services/ai-coach services/media-server services/sandbox \
 && npm ci --omit=dev --workspace backend --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/backend/dist ./dist
# As migrations viajam na imagem: o deploy roda `prisma migrate deploy`
# sem precisar do código-fonte no servidor.
COPY --from=build /app/backend/prisma ./prisma
# O Prisma Client é gerado na RAIZ do workspace (node_modules/.prisma), não em
# backend/node_modules — é preciso trazer o engine para o runtime.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Usuário sem privilégios
RUN useradd --system --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]