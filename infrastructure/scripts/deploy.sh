#!/usr/bin/env bash
# Deploy do Sano no servidor (uso: ./deploy.sh <tag>)
set -euo pipefail

TAG="${1:-latest}"
APP_DIR="${APP_DIR:-/opt/sano}"
REGISTRY="${REGISTRY:?defina REGISTRY}"

echo "==> Deploy da tag $TAG em $APP_DIR"

cd "$APP_DIR"
mkdir -p infrastructure/nginx

# Copia o nginx versionado no repositório. NÃO reescreva o conteúdo aqui:
# foi assim que o `client_max_body_size 1m` e o `microphone=()` (que quebram
# imagem/áudio do módulo de mensagens) voltaram silenciosamente para produção.
if [ ! -f infrastructure/nginx/default.conf ]; then
  echo "ERRO: infrastructure/nginx/default.conf não encontrado no repositório." >&2
  echo "Rode o deploy a partir de um checkout completo (git clone/pull)." >&2
  exit 1
fi

# Rede dedicada: `api` é o nome que o nginx usa no upstream.
docker network inspect sano-net >/dev/null 2>&1 || docker network create sano-net

echo "==> Baixando imagens"
docker pull "$REGISTRY/sano-api:$TAG"
docker pull "$REGISTRY/sano-web:$TAG"

# Migrations a partir da IMAGEM da API (ela já traz prisma/ e o client gerado),
# sem precisar montar o código-fonte no servidor.
echo "==> Aplicando migrations"
docker run --rm --network sano-net --env-file "$APP_DIR/backend/.env" \
  "$REGISTRY/sano-api:$TAG" \
  npx prisma migrate deploy

echo "==> Subindo containers"
docker rm -f sano-api sano-web >/dev/null 2>&1 || true

docker run -d --name sano-api --restart unless-stopped \
  --env-file "$APP_DIR/backend/.env" \
  --network sano-net \
  -p 127.0.0.1:8080:8080 \
  "$REGISTRY/sano-api:$TAG"

docker run -d --name sano-web --restart unless-stopped \
  --network sano-net \
  -p 80:80 -p 443:443 \
  -v "$APP_DIR/infrastructure/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$REGISTRY/sano-web:$TAG"

echo "==> Deploy concluido. Verifique os logs com: docker logs -f sano-api"