# Guia de Hospedagem — Sano

O projeto **sobe como um processo Node único**: o Express serve a API e o
frontend buildado na mesma porta. Isso vale para a **Discloud** e também para um
VPS (onde dá para usar Docker + proxy de TLS).

| Caminho | Onde | Arquitetura |
|---|---|---|
| **A** | Discloud, Railway, Render | 1 processo Node |
| **B** | VPS com Docker (Discloud VPS, Hetzner, AWS) | 2 containers + proxy TLS |

**O caminho A é o mais simples** — comece por ele.

---

## Índice

**Comum**
1. [Antes de começar](#1-antes-de-começar)
2. [Publicar no GitHub](#2-publicar-no-github)

**Caminho A — Discloud**
3. [O discloud.config](#3-o-discloudconfig)
4. [Variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Publicar e criar o admin](#5-publicar-e-criar-o-admin)
6. [Problemas do build](#6-problemas-do-build)

**Caminho B — VPS**
7. [Criar o VPS](#7-criar-o-vps)
8. [Preparar o servidor](#8-preparar-o-servidor)
9. [Domínio e HTTPS](#9-domínio-e-https)
10. [Primeiro deploy](#10-primeiro-deploy)
11. [Dia a dia](#11-dia-a-dia)
12. [Checklist de segurança](#12-checklist-de-segurança)
13. [Problemas comuns](#13-problemas-comuns)

---

## 1. Antes de começar

**Banco de dados:** você já tem um PostgreSQL no Supabase — funciona nos dois
caminhos, sem instalar nada.

> ⚠️ No painel do Supabase, use o pooler na porta **5432** (modo *session*). O
> Prisma precisa de prepared statements, que o modo *transaction* (6543) não
> suporta.

**Gerar os segredos:**

```bash
# JWT_SECRET (64 bytes hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 🚨 O `ENCRYPTION_KEY` cifra os segredos de 2FA. Se você já tem usuários
> cadastrados e trocar essa chave, o 2FA de todo mundo para de validar. Guarde
> num gerenciador de senhas.

**Memória:** `RAM=1500` é folgado para o runtime. O pico de memória acontece no
**build**, não na execução.

---

## 2. Publicar no GitHub

### 2.1 Criar o repositório

No GitHub: **New repository** → nome `sano` → **privado** (o código tem lógica
de segurança; não precisa ser público).

### 2.2 Enviar o código

```bash
git init
git add .
git commit -m "Módulo 1: bate-papo criptografado"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sano.git
git push -u origin main
```

Confira antes de enviar com `git status`: `backend/.env` **não** pode aparecer —
o `.gitignore` já o exclui, mas ele contém segredos.

---
# Caminho A — Discloud

## 3. O discloud.config

O arquivo já está na raiz do projeto:

```ini
NAME=Sano
TYPE=site
ID=sano.discloud.app
MAIN=src/index.js
RAM=1500
VERSION=latest
BUILD=npm run build:host
START=npm start
```

> ⚠️ **Sem comentários no arquivo.** O analisador da Discloud (`DISPACK`) falha
> com `Missing or empty start command` quando o arquivo tem linhas `#` ou
> caracteres não-ASCII. A documentação fica aqui, não no config.

> ⚠️ **O `MAIN` precisa existir no repositório.** A hospedagem empacota o
> código em um zip e procura esse caminho **antes** de rodar o `BUILD`. Como
> `dist/` está no `.gitignore`, `backend/dist/server.js` ainda não existe
> nesse momento — o erro seria *"não foi encontrado dentro do zip"*.
> Por isso o `MAIN` aponta para `src/index.js`, que é versionado.

### O que cada chave faz

| Chave | Papel |
|---|---|
| `BUILD` | Compila backend (`tsc`) e frontend (`vite`) |
| `START` | Sobe o servidor via `npm start` |
| `MAIN` | `src/index.js` — arquivo versionado que serve de entrada |

> ⚠️ **O `package.json` da raiz precisa ter a chave `"start"`.** O analisador da
> Discloud procura exatamente esse nome; sem ele, o erro é
> `Missing or empty start command`. Não basta ter `start:host`.

O `npm start` da raiz aponta para o script `start:host` do backend, que faz:

```
npm run migrate:host && node prisma/ensure-admin.js && node dist/server.js
```

Encadear com `&&` direto no `discloud.config` **não funciona** — o analisador
rejeita comando composto. Por isso a cadeia mora no `package.json` e o config
só chama `npm start`.

### Por que o `MAIN` é `backend/dist/server.js`

A Discloud sobe **um processo só**. O projeto é um workspace npm com API
(Express) e site (React), então o próprio Express entrega os dois:

```
┌───────── node backend/dist/server.js ─────────┐
│                                                │
│  Express na porta injetada pela Discloud       │
│    ├── /api/*     → rotas da API               │
│    ├── /assets/*  → JS/CSS com hash (cache 1a) │
│    └── /*         → index.html (rotas React)   │
│                                                │
└────────────────────────────────────────────────┘
```

Não existe nginx na frente, então quem serve o `index.html` é o Express — é o
que `backend/src/static.ts` faz.

Servir os dois na **mesma origem** é essencial: é o que mantém os cookies
`SameSite=strict` funcionando, já que o navegador nunca faz cross-site.

### Por que `BUILD` é `npm run build:host`

Esse script (em `backend/package.json`) compila as duas metades:

```
backend:   prisma generate && tsc   → backend/dist/server.js
frontend:  vite build                → frontend/dist/index.html
```

### Por que o `START` roda migrations

A Discloud não tem hook separado. `prisma migrate deploy` só aplica o que
**ainda não foi aplicado**, então é seguro rodar a cada start — inclusive em
restart automático.

> ⚠️ Se a migration falhar, o `&&` impede o servidor de subir. É o
> comportamento desejado: melhor não servir do que servir com o banco quebrado.

## 4. Variáveis de ambiente

No painel da Discloud, em **Variáveis**:

| Nome | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | a do seu `.env` local |
| `JWT_SECRET` | o gerado na seção 1 |
| `ENCRYPTION_KEY` | o gerado na seção 1 |
| `FRONTEND_URL` | `https://sano.discloud.dev` |
| `FRONTEND_URLS` | opcional, origens extras separadas por vírgula |
| `COOKIE_SAMESITE` | `strict` |
| `APP_NAME` | `Sano` |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | senha forte (ex.: `"Sano#2026Forte!"`) |
| `AI_API_KEY` | opcional (módulo de treino) |

**`PORT` não é necessário** — a Discloud injeta automaticamente.

> ⚠️ `ADMIN_PASSWORD` precisa de **aspas** no valor se tiver `#` ou espaço —
> sem elas o dotenv pode truncar a senha silenciosamente.

> ⚠️ `FRONTEND_URL` precisa ser **exatamente** o host pelo qual você abre o
> site. O middleware `originCheck` compara o header `Origin` com essa variável e
> bloqueia login de outra origem. Erro aqui aparece como **403 "Origem não
> permitida"**. A comparação é normalizada (barra final, maiúsculas e `www.`
> deixam de importar), mas esquema e host precisam bater — em produção use
> `https://`. Se o mesmo deploy atende a mais de um host (ex.: o `ID` do
> `discloud.config` e um domínio próprio), liste os extras em `FRONTEND_URLS`,
> separados por vírgula:
>
> ```
> FRONTEND_URL=https://sano.discloud.dev
> FRONTEND_URLS=https://sano.discloud.app,https://sano.seudominio.com.br
> ```
>
> Para descobrir o valor exato, abra o site e rode no console do navegador:
> `location.origin`.

## 5. Publicar e criar o admin

1. Conecte o repositório no painel da Discloud
2. Escolha a branch `main`
3. A Discloud lê o `discloud.config` e executa `BUILD` → `START`

**O admin é criado sozinho.** O `START` roda `ensure-admin.js`, que cria o
usuário `ADMIN_USERNAME` com a senha `ADMIN_PASSWORD` se ele ainda não existir.
Como a Discloud não dá terminal, não existe passo manual — e o script é
idempotente, então rodar em todo boot não duplica nada.

Depois acesse `https://sano.discloud.app`, faça login e siga o fluxo de primeiro
acesso (trocar senha + ativar 2FA).

> ⚠️ Sem `ADMIN_PASSWORD` o script apenas avisa e segue — um deploy de
> atualização continua funcionando com o admin que já existe.

## 6. Problemas do build

| Erro no log | Causa |
|---|---|
| `No workspaces found: --workspace=backend` | O `BUILD` rodou de dentro de `backend/`. Use `npm run build:host` a partir da raiz. |
| `prisma generate` não acha o schema | Mesma causa: `BUILD` tem que ser na raiz. |
| Out of memory | Aumente a RAM temporariamente no painel. |
| 403 "Origem não permitida" | `FRONTEND_URL` ≠ o domínio do `ID`. |
| Login desloga na hora | `COOKIE_SAMESITE` sem `strict`, ou `NODE_ENV` ≠ `production`. |

---
# Caminho B — VPS com Docker

Use se preferir 2 containers + proxy TLS. Vale para VPS da Discloud, Hetzner,
AWS ou qualquer outro provedor.

## 7. Criar o VPS

1. Em [discloud.com.br](https://discloud.com.br) → **VPS** → **Criar VPS**
2. Configure:

   | Campo | Valor |
   |---|---|
   | Sistema | Ubuntu 22.04 ou 24.04 |
   | Plano | 2 vCPU / 4 GB RAM / 40 GB SSD |

3. Teste o acesso: `ssh root@SEU_IP`

## 8. Preparar o servidor

```bash
apt update && apt upgrade -y

curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable --now docker

adduser sano
usermod -aG docker sano
```

### Opção A: banco gerenciado (recomendado)

Copie a `DATABASE_URL` do seu `.env` local para o `.env` do servidor.

### Opção B: Postgres no próprio VPS

```bash
docker run -d --name sano-db --restart unless-stopped \
  -e POSTGRES_USER=sano \
  -e POSTGRES_PASSWORD='TROQUE_ESTA_SENHA' \
  -e POSTGRES_DB=sano \
  -v sano-db:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

> A porta está presa em `127.0.0.1` de propósito: o banco **não** fica exposto
> na internet. Só a API conversa com ele.

## 9. Domínio e HTTPS

### 9.1 Apontar o domínio

No registrador, crie um registro **A** com o IP do VPS.

### 9.2 Abrir as portas

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 9.3 HTTPS com Caddy

O Caddy emite o certificado **automaticamente** e renova sozinho.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
sano.seudominio.com.br {
    encode gzip
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

systemctl reload caddy
```

```
Internet → Caddy (:443, HTTPS) → nginx (:80) → api:8080
```

## 10. Primeiro deploy

```bash
ssh root@SEU_IP
mkdir -p /opt/sano && cd /opt/sano
git clone https://github.com/SEU_USUARIO/sano.git .
```

Crie o `.env` de produção:

```bash
nano /opt/sano/backend/.env
chmod 600 /opt/sano/backend/.env
```

```ini
NODE_ENV=production
PORT=8080
DATABASE_URL="postgresql://..."
JWT_SECRET=cole-o-seu-valor
ENCRYPTION_KEY=cole-o-seu-valor
FRONTEND_URL=https://sano.seudominio.com.br
COOKIE_SAMESITE=strict
APP_NAME=Sano
ADMIN_USERNAME=admin
ADMIN_PASSWORD="SuaSenhaForte#2026"
```

Suba:

```bash
export REGISTRY=SEU_USUARIO_DOCKERHUB
cd /opt/sano
chmod +x infrastructure/scripts/deploy.sh
./infrastructure/scripts/deploy.sh latest
```

Deploy seguinte:

```bash
cd /opt/sano && git pull
./infrastructure/scripts/deploy.sh latest
```
## 11. Dia a dia

```bash
docker ps                    # containers rodando
docker logs -f sano-api      # logs da API
docker logs -f sano-web      # logs do nginx
docker exec -it sano-api sh  # entrar no container
docker restart sano-api      # reiniciar
```

**Backup:**

```bash
# Supabase: use o dashboard
# Postgres no VPS:
docker exec sano-db pg_dump -U sano sano | gzip > backup-$(date +%F).sql.gz
```

**Sem memória para o build:**

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
```

## 12. Checklist de segurança

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` com 64+ caracteres hex
- [ ] `ENCRYPTION_KEY` com 64 caracteres hex
- [ ] `FRONTEND_URL` é `https://`
- [ ] `COOKIE_SAMESITE=strict`
- [ ] API não exposta na porta 8080
- [ ] Postgres não exposto
- [ ] `chmod 600 backend/.env`
- [ ] `backend/.env` **fora** do Git
- [ ] Senha do admin forte
- [ ] Usuários de teste `alice` e `bob` removidos

```bash
docker exec sano-api node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.deleteMany({ where: { username: { in: ['alice','bob'] } } })
    .then(r => { console.log('removidos:', r.count); return p.\$disconnect(); });
"
```

## 13. Problemas comuns

| Sintoma | Causa |
|---|---|
| Login desloga na hora | `COOKIE_SAMESITE` ou `NODE_ENV` errados |
| 403 "Origem não permitida" | `FRONTEND_URL` ≠ o domínio real |
| Imagem/áudio não envia | `client_max_body_size` (o projeto usa 6 MB) |
| Microfone não funciona | `getUserMedia` só funciona em HTTPS |
| `npm ci` falha com "workspace not found" | Os Dockerfiles criam `services/*` antes do `npm ci` |
| Erro de conexão com o banco | Confira a porta: **5432**, não 6543 |
| Erro `P3009` nas migrations | [Guia do Prisma](https://www.prisma.io/docs/guides/migrate/developing) |

---

## Apêndice: o que roda no VPS

```
┌──────────────────────────────────────────────┐
│  Internet                                     │
└───────────────────┬──────────────────────────┘
                    │ :443
┌───────────────────▼──────────────────────────┐
│  Caddy (host) — TLS automático                │
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
└───────────────────┘
```

## Apêndice: por que o servidor não lê nada

O módulo de mensagens cifra **no navegador** (Web Crypto API) antes de enviar.
A API recebe bytes que não consegue interpretar: só tem as chaves públicas,
que servem para cifrar, nunca para decifrar.

Consequência: nem o dono do servidor consegue ler as mensagens. Perder o acesso
à conta torna o conteúdo irrecuperável por definição — e é essa a ideia.

---

**Documento relacionado:** [`arquitetura.md`](./arquitetura.md)