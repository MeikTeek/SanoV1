# Guia de Hospedagem — Discloud

Como colocar o Sano no ar num VPS da Discloud.

O guia assume **Ubuntu 22.04 ou 24.04** com Docker — é a imagem que a Discloud
entrega por padrão. Se o seu painel vier com outra distro, os passos de Docker
continuam válidos; só o `apt` muda.

---

## Índice

1. [Antes de começar](#1-o-que-é-preciso-antes-de-começar)
2. [Criando o VPS](#2-criando-o-vps-na-discloud)
3. [Preparando o servidor](#3-preparando-o-servidor)
4. [Domínio e HTTPS](#4-configurando-o-domínio-e-o-https)
5. [Publicando no GitHub](#5-publicando-no-github)
6. [Primeiro deploy](#6-fazendo-o-primeiro-deploy)
7. [Deploys seguintes](#7-deploys-seguintes)
8. [Dia a dia](#8-administrando-no-dia-a-dia)
9. [Checklist de segurança](#9-checklist-de-segurança)
10. [Problemas comuns](#10-problemas-comuns)

---

## 1. O que é preciso antes de começar

| Item | Para quê |
|---|---|
| VPS Discloud (mín. 2 vCPU / 4 GB RAM) | Rodar a API e o site |
| Domínio próprio | HTTPS e acesso estável |
| Conta no GitHub | Guardar o código e disparar o deploy |
| Conta no Docker Hub | Guardar as imagens das aplicações |
| Banco PostgreSQL | Os dados |

**Por que 4 GB de RAM?** A build do frontend (Vite) é pesada. Abaixo disso o
deploy pode ser interrompido por falta de memória.

### Sobre o banco de dados

Você já tem um PostgreSQL no Supabase. Duas opções:

- **Opção A — manter o Supabase** (mais simples, nada para instalar)
- **Opção B — Postgres no próprio VPS** (tudo junto, mais controle)

O guia usa a **Opção A** por padrão porque dispensa gerenciar backup. Para a
Opção B, veja a [seção 3.5](#35-opção-b-postgres-no-próprio-vps).

---

## 2. Criando o VPS na Discloud

1. Entre em [discloud.com.br](https://discloud.com.br) e faça login
2. Vá em **VPS** → **Criar VPS**
3. Configure:

   | Campo | Valor |
   |---|---|
   | Nome | `sano` |
   | Região | São Paulo (ou a mais próxima) |
   | Sistema | Ubuntu 22.04 ou 24.04 |
   | Plano | 2 vCPU / 4 GB RAM / 40 GB SSD |
   | Quantidade | 1 |


NAME=Sano
TYPE=site
ID=sano.discloud.app
MAIN=src/index.js
RAM=1500
VERSION=latest

Se a sua aplicação exigir uma etapa de build (como React, Next.js ou TypeScript), você tem duas opções:


Discloud Build (Recomendado)

Build Local
Deixe a Discloud lidar com o processo de build durante a implantação. Adicione o comando BUILD ao seu discloud.config.


Copiar
BUILD=npm run build
START=npm run start


4. Após a criação você recebe **IP, usuário e senha** (ou chave SSH)

> **Guarde a senha root.** É ela que dá acesso ao servidor.

Teste antes de continuar:

```bash
ssh root@SEU_IP
```

Se entrar direto, está funcionando.

---

## 3. Preparando o servidor

### 3.1 Atualizar o sistema

```bash
apt update && apt upgrade -y
```

### 3.2 Instalar Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable --now docker
```

Confirme:

```bash
docker --version
docker compose version
```

### 3.3 Criar usuário de aplicação

Rodar como root não é ideal:

```bash
adduser sano
usermod -aG docker sano
```

### 3.4 Opção A: banco gerenciado (recomendado)

Copie a `DATABASE_URL` do seu `.env` local:

```bash
grep DATABASE_URL backend/.env
```

Esse valor vai para o `.env` do servidor. Nada precisa ser instalado.

> ⚠️ No painel do Supabase, confirme que o pooler está na porta **5432** (modo
> *session*), não 6543 (*transaction*). O Prisma precisa de prepared statements,
> que o modo transaction não suporta.

### 3.5 Opção B: Postgres no próprio VPS

```bash
docker run -d --name sano-db --restart unless-stopped \
  -e POSTGRES_USER=sano \
  -e POSTGRES_PASSWORD='TROQUE_ESTA_SENHA' \
  -e POSTGRES_DB=sano \
  -v sano-db:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

A `DATABASE_URL` fica:

```
DATABASE_URL="postgresql://sano:TROQUE_ESTA_SENHA@127.0.0.1:5432/sano?schema=public"
```

> A porta está presa em `127.0.0.1` de propósito: o banco **não** fica exposto
> na internet. Só a API conversa com ele.
>
> ⚠️ Com a Opção B o banco some se o VPS for recriado. Backup:
> `docker exec sano-db pg_dump -U sano sano > backup.sql`
---

## 4. Configurando o domínio e o HTTPS

### 4.1 Apontar o domínio

No painel do registrador, crie um registro **A**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `sano` (ou `@` no domínio raiz) | IP do seu VPS |

Confirme a propagação:

```bash
ping sano.seudominio.com.br
```

O IP retornado precisa ser o do VPS.

### 4.2 Abrir as portas

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

> Se o painel da Discloud tiver **firewall próprio**, libere 22, 80 e 443 lá
> também — o `ufw` pode não bastar.

### 4.3 HTTPS com Caddy

O Caddy emite o certificado **automaticamente** e renova sozinho. Mais simples
que Let's Encrypt manual.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Configuração:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
sano.seudominio.com.br {
    encode gzip

    # O nginx (container sano-web) escuta a porta 80 DENTRO da rede Docker.
    # O Caddy publica 80/443 e repassa para ele.
    reverse_proxy 127.0.0.1:80

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        -Server
    }
}
EOF
```

```bash
systemctl reload caddy
```

Acesse `https://sano.seudominio.com.br`. O certificado é emitido no primeiro
acesso (uns 30 segundos).

### Por que Caddy **antes** do nginx?

O container `sano-web` traz um nginx que serve o site e faz proxy de `/api` para
o container da API. O Caddy entra **na frente** só para terminar o TLS:

```
Internet → Caddy (:443, HTTPS) → nginx (:80) → api:8080
```

Dá para usar só nginx com `certbot`, mas a renovação do certificado vira tarefa
manual — e esquecer isso é um erro clássico que derruba o site.

---

## 5. Publicando no GitHub

### 5.1 Criar o repositório

No GitHub: **New repository** → nome `sano` → **privado** (o código tem lógica
de segurança; não precisa ser público).

### 5.2 Enviar o código

```bash
cd caminho/para/SanoProject
git init
git add .
git commit -m "Módulo 1: bate-papo criptografado"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sano.git
git push -u origin main
```

**Confira antes do push:**

```bash
git status
```

Confirme que `backend/.env` **não** aparece — o `.gitignore` já o exclui, mas ele
contém segredos.

### 5.3 Gerar os segredos

Rode na sua máquina:

```bash
# JWT_SECRET (64 bytes hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 🚨 O `ENCRYPTION_KEY` cifra os segredos de 2FA. Se você já tem usuários
> cadastrados e trocar essa chave, o 2FA de todo mundo para de validar. Guarde
> num gerenciador de senhas.

### 5.4 Segredos no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | do seu `.env` local |
| `JWT_SECRET` | gerado acima |
| `ENCRYPTION_KEY` | gerado acima |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | senha forte do primeiro admin |
| `REGISTRY` | seu usuário do Docker Hub |
| `REGISTRY_USER` | seu usuário do Docker Hub |
| `REGISTRY_TOKEN` | token do Docker Hub |
| `SSH_HOST` | IP do VPS |
| `SSH_KEY` | chave privada SSH |

E em **Settings → Variables**:

| Nome | Valor |
|---|---|
| `FRONTEND_URL` | `https://sano.seudominio.com.br` |

### 5.5 Chave SSH

```bash
ssh-keygen -t ed25519 -C "sano-deploy" -f ~/.ssh/sano_deploy
```

O conteúdo de `~/.ssh/sano_deploy` (a **privada**, sem `.pub`) vai no segredo
`SSH_KEY`.

No VPS, autorize a pública:

```bash
cat ~/.ssh/sano_deploy.pub
ssh-copy-id -i ~/.ssh/sano_deploy.pub root@SEU_IP
ssh -i ~/.ssh/sano_deploy root@SEU_IP "echo ok"
```
---

## 6. Fazendo o primeiro deploy

### 6.1 Clonar no servidor

```bash
ssh root@SEU_IP
mkdir -p /opt/sano
cd /opt/sano
git clone https://github.com/SEU_USUARIO/sano.git .
```

### 6.2 Criar o `.env` de produção

**Este é o passo que mais causa dor de cabeça.**

```bash
nano /opt/sano/backend/.env
```

Conteúdo:

```ini
NODE_ENV=production
PORT=8080

# Opção A (Supabase) ou Opção B (Postgres no VPS)
DATABASE_URL="postgresql://..."

JWT_SECRET=cole-o-seu-valor-aqui
ENCRYPTION_KEY=cole-o-seu-valor-aqui

FRONTEND_URL=https://sano.seudominio.com.br

# strict = front e API na MESMA origem, atrás do Caddy+nginx
COOKIE_SAMESITE=strict
APP_NAME=Sano

# Só usados no primeiro seed
ADMIN_USERNAME=admin
ADMIN_PASSWORD="SuaSenhaForte#2026"

# IA do módulo de treino (opcional — sem a chave, roda só com o motor local)
AI_API_KEY=
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

Proteja o arquivo:

```bash
chmod 600 /opt/sano/backend/.env
```

### 6.3 Build e subir

```bash
export REGISTRY=SEU_USUARIO_DOCKERHUB
cd /opt/sano
chmod +x infrastructure/scripts/deploy.sh
./infrastructure/scripts/deploy.sh latest
```

O script:

1. Baixa as imagens `sano-api` e `sano-web`
2. Roda as migrations (`prisma migrate deploy`)
3. Sobe os containers `sano-api` e `sano-web`

### 6.4 Criar o primeiro admin

```bash
cd /opt/sano
docker run --rm --network sano-net --env-file backend/.env \
  "$REGISTRY/sano-api:latest" \
  npx tsx prisma/seed.ts
```

### 6.5 Verificar

```bash
docker ps                                    # containers Up?
curl http://127.0.0.1:8080/api/health        # API responde?
docker logs -f sano-api                      # logs em tempo real
```

Abra `https://sano.seudominio.com.br` e faça login com o admin criado.

### 6.6 Alternativa: pelo GitHub Actions

Depois de configurado o servidor, dá para disparar pelo GitHub:

1. **Settings → Environments** → crie `production`
2. Copie os segredos e variáveis para lá também
3. Pronto: `git push` dispara o deploy sozinho

```bash
git add . && git commit -m "ajuste" && git push
```

> ⚠️ O workflow faz `ssh root@$SSH_HOST`. Se seu VPS não permite root, ajuste o
> usuário no `.github/workflows/deploy.yml`.

---

## 7. Deploys seguintes

Logando no servidor:

```bash
ssh root@SEU_IP
cd /opt/sano
git pull
export REGISTRY=SEU_USUARIO_DOCKERHUB
./infrastructure/scripts/deploy.sh latest
```

Ou, pelo GitHub: `git push` na `main`.

### Sobre as migrations

`prisma migrate deploy` roda a cada deploy e aplica **só o que falta**.

> ⚠️ **Migrations nunca são revertidas automaticamente.** Se uma falhar no meio, o
> banco fica inconsistente. Teste sempre numa cópia antes de mexer em produção.

---

## 8. Administrando no dia a dia

```bash
docker ps                    # containers rodando
docker logs -f sano-api      # logs da API
docker logs -f sano-web      # logs do nginx
docker exec -it sano-api sh  # entrar no container
docker restart sano-api      # reiniciar
docker stop sano-api sano-web
```

### Backup do banco

```bash
# Supabase: use o dashboard (Downloads → Backup)
# Postgres no VPS:
docker exec sano-db pg_dump -U sano sano | gzip > backup-$(date +%F).sql.gz
```

Automatizar com cron:

```bash
crontab -e
```

```cron
0 3 * * * docker exec sano-db pg_dump -U sano sano | gzip > /root/backups/sano-$(date +\%F).sql.gz
```

### Se a build morrer por falta de memória

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
```

### Atualizar o Caddy

```bash
apt update && apt upgrade -y caddy
```
---

## 9. Checklist de segurança

Antes de chamar o site de "no ar", confirme:

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` com 64+ caracteres hex (gerado, não digitado)
- [ ] `ENCRYPTION_KEY` com 64 caracteres hex
- [ ] `FRONTEND_URL` é `https://` (não `http://`)
- [ ] `COOKIE_SAMESITE=strict`
- [ ] Porta 8080 **não** exposta na internet (`-p 127.0.0.1:8080:8080`)
- [ ] Postgres **não** exposto (porta presa em `127.0.0.1`)
- [ ] HTTPS funcionando (cadeado no navegador)
- [ ] `chmod 600 backend/.env`
- [ ] `backend/.env` **fora** do Git
- [ ] Senha do admin forte e **não** a de exemplo
- [ ] Usuários de teste `alice` e `bob` removidos

Sobre o último item — eles foram criados para os testes do módulo de mensagens.
**Remova antes de usar de verdade:**

```bash
docker exec sano-api node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.deleteMany({ where: { username: { in: ['alice','bob'] } } })
    .then(r => { console.log('removidos:', r.count); return p.\$disconnect(); });
"
```

---

## 10. Problemas comuns

### O site não abre

```bash
docker ps                    # containers estão Up?
docker logs sano-web         # erro no nginx?
docker logs sano-api         # erro na API?
curl http://127.0.0.1:8080/api/health
```

### Login funciona e desloga na hora

Cookie inseguro. No `.env`:

```ini
NODE_ENV=production
FRONTEND_URL=https://sano.seudominio.com.br
COOKIE_SAMESITE=strict
```

Reinicie a API depois de mudar.

### Erro 403 "Origem não permitida"

O middleware `originCheck` compara o header `Origin` com `FRONTEND_URL`. Se
mudar o domínio, atualize a variável.

### Imagem ou áudio não envia

Duas causas:

1. **`client_max_body_size` no nginx** — o padrão é 1 MB. Este projeto usa 6 MB,
   necessário porque a mídia cifrada vira base64 (cresce ~33%)
2. **Limite da aplicação** — 4 MB em `/api/chat/conversations`

### Microfone não funciona

`getUserMedia` (usado no gravador de áudio) **só funciona em HTTPS** ou
`localhost`. Em `http://` o navegador nega a permissão.

### Build do frontend morre por memória

```bash
free -h
```

Se estiver apertado, adicione swap (seção 8).

### `npm ci` falha com "workspace not found"

Os `Dockerfile` criam as pastas `services/*` antes do `npm ci`, porque os
workspaces declarados no `package.json` da raiz precisam existir para o
instalador resolver.

### Erro de conexão com o banco

```bash
docker logs sano-api | grep -i database
```

Confirme a `DATABASE_URL`. Com Supabase, a porta tem que ser **5432**.

### Erro `P3009` nas migrations

Alguma migration anterior está marcada como aplicada sem ter rodado. Veja o
[guia do Prisma](https://www.prisma.io/docs/guides/migrate/developing).

---

## Apêndice: o que roda no VPS

```
┌──────────────────────────────────────────────┐
│  Internet                                     │
└───────────────────┬──────────────────────────┘
                    │ :443
┌───────────────────▼──────────────────────────┐
│  Caddy (host)                                 │
│  TLS automático · renova sozinho             │
└───────────────────┬──────────────────────────┘
                    │ :80
┌───────────────────▼──────────────────────────┐
│  sano-web (container · nginx)                 │
│  serve o site · faz proxy de /api             │
└─────────┬───────────────────┬─────────────────┘
          │ /api              │ HTML/CSS/JS
┌─────────▼─────────┐   ┌─────▼─────────────────┐
│  sano-api          │   │  navegador           │
│  (container · node)│   │  (a criptografia      │
│  :8080 (interna)   │   │   acontece AQUI)     │
└─────────┬─────────┘   └───────────────────────┘
          │
┌─────────▼─────────┐
│  PostgreSQL       │
│  (Supabase ou VPS)│
└───────────────────┘
```

A API escuta só em `127.0.0.1` — não é alcançável da internet. O único caminho
até ela é o nginx, e o nginx só repassa `/api`.

## Apêndice: por que o servidor não lê nada

O módulo de mensagens cifra **no navegador** (Web Crypto API) antes de enviar.
A API recebe bytes que não consegue interpretar: só tem as chaves públicas,
que servem para cifrar, nunca para decifrar.

Consequência prática: nem o dono do servidor consegue ler as mensagens. Perder o
acesso à conta torna o conteúdo irrecuperável por definição — e é essa a ideia.

---

**Documento relacionado:** [`arquitetura.md`](./arquitetura.md)