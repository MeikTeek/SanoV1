# syntax=docker/dockerfile:1
# Build context = RAIZ do repositório (é um workspace npm).
#   docker build -f infrastructure/docker/frontend.Dockerfile .

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Manifests primeiro: aproveita o cache enquanto o código muda.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Os workspaces referenciados precisam existir para o npm ci resolver.
RUN mkdir -p services/ai-coach services/media-server services/sandbox \
 && npm ci --workspace frontend --include-workspace-root

COPY frontend ./frontend
# `npm run build` no workspace do frontend: gera dist/.
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/frontend/dist /usr/share/nginx/html
# O conf mora em infrastructure/nginx/ — o caminho precisa bater com o contexto.
COPY infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]