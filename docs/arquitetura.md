# Arquitetura — Fase 1

## Visão geral

O Sano é um sistema **fechado**: não existe cadastro público. Um administrador cria as credenciais, e cada usuário precisa trocar a senha e ativar o 2FA antes de acessar qualquer ferramenta.

```
Navegador (React/Vite)
   │  fetch('/api/...', credentials: 'include')   ← mesma origem
   ▼
Nginx ── /api/* ──► API Express (:8080) ──► PostgreSQL
   └── /*  ────────► SPA estática
```

Front e API na **mesma origem** é um requisito de segurança do projeto: permite cookies `HttpOnly` + `SameSite=strict`, que o JavaScript da página nunca consegue ler.

## Fluxo de autenticação

O login tem duas etapas e usa **dois cookies diferentes** com propósitos distintos, para que a sessão completa nunca exista antes da validação do segundo fator.

```
POST /auth/login          senha correta
   └─► cookie `pre_auth`  (JWT, 10 min, propósito "pre_auth")

POST /auth/change-password   troca obrigatória (mustChangePassword)
POST /auth/2fa/setup         devolve segredo TOTP + QR Code
POST /auth/2fa/confirm       confirma o código e ativa o 2FA
POST /auth/2fa/verify        código válido
   └─► cookie `session` (JWT, 8 h, propósito "session")
```

Os middlewares `requirePreAuth` e `requireAuth` validam o propósito do token, então um `pre_auth` nunca é aceito como se fosse sessão.

### Revogação de sessões

O campo `tokenVersion` é embutido em todo token. Ao incrementá-lo (troca de senha, bloqueio pelo admin, desativação do 2FA), **todas** as sessões existentes daquele usuário deixam de validar na requisição seguinte — sem precisar de lista de revogação.

## Modelo de dados

| Modelo | Papel |
| ------ | ----- |
| `User` | credenciais, papel, estado do 2FA, `tokenVersion`, contadores de bloqueio |
| `AuditLog` | trilha de ações críticas com IP, user-agent e metadados |
| `ToolData` | espaço genérico de persistência por ferramenta (`userId`, `tool`, `key`, `data` JSONB) |

`ToolData` é genérico de propósito: cada módulo das fases seguintes grava seus dados ali sem exigir nova migration, isolando por `(userId, tool, key)`.

## Defesas ativas

| Ameaça | Defesa |
| ------ | ------ |
| Roubo de senha (brute force) | Argon2id + rate limit dedicado nas rotas de autenticação + bloqueio por `failedAttempts`/`lockedUntil` |
| XSS | Token em cookie `HttpOnly` (inacessível ao JS) + Helmet + React sem `dangerouslySetInnerHTML` |
| CSRF | Checagem de `Origin` em todo método de escrita + `SameSite=strict` |
| Reuso de sessão após bloqueio | `tokenVersion` invalida os tokens |
| Vazamento de segredo TOTP | Segredo cifrado em repouso com AES-256-GCM |
|_enumeração de usuários_ | Resposta de login genérica + auditoria do tentativa |
| Exfiltração de IP | `trust proxy` configurado para respeitar o proxy da hospedagem |

## Decisões e limitações conhecidas

- **`tool` no `ToolData` é texto livre**, não enum. Ganho: módulos novos entram sem migration. Custo: nada impede entradas `tool` duplicadas. Migração para enum quando os módulos da Fase 3 estabilizarem.
- **Rate limiting em memória**. Com `express-rate-limit` em processo único, reiniciar a API zera os contadores. Em deploy horizontal, trocar por Redis.
- **A API confia em `X-Forwarded-For`** (`trust proxy: 1`). Em produção é obrigatório que só o proxy reverso esteja exposto — a porta da API deve ficar em `127.0.0.1`.
- **Sem refresh token**. A sessão expira em 8 h e exige login completo (senha + 2FA) novamente. É o comportamento desejado num sistema fechado, mas vale confirmar a experiência desejada.