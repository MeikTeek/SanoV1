# Sano

Ecossistema web privado e centralizado — um "assistente pessoal" fechado, com autenticação rígida, 2FA obrigatório, auditoria de segurança e uma suíte de ferramentas integradas (chat E2EE, agenda, jogos cognitivos, utilitários de arquivos, trainer físico gamificado, streaming de mídia e terminal OSINT isolado). O assistente central se chama **Sano** e é acessado pelo terminal de comandos do dashboard.

## Stack

| Camada      | Tecnologia |
| ----------- | ---------- |
| Frontend    | React 18 + TypeScript + Vite + React Router |
| Backend     | Node.js 20 + Express 5 + TypeScript |
| Banco       | PostgreSQL 16 + Prisma ORM |
| Segurança   | Argon2id, JWT HS256 em cookie HTTP-only, TOTP (otplib), Helmet, rate limiting, checagem de Origin (anti-CSRF) |
| Infra       | Docker + Nginx (mesma origem front/API) |

## Estrutura

```
.
├── backend/            API Express + Prisma (Fases 1–2)
│   ├── prisma/         schema, migrations e seed
│   └── src/            config, controllers, middleware, routes, services, utils, validators
│       └── services/sano/   núcleo de intenções do assistente (Fase 2)
├── frontend/           SPA React/Vite
│   └── src/            components, context, pages, services, styles, types
├── infrastructure/     Dockerfiles, Nginx e scripts de apoio
├── services/           ai-coach, media-server, sandbox (Fases 3–4)
├── shared/             constants, schemas e types compartilhados
├── tests/              unit, integration, e2e
└── docs/               documentação do projeto
```

## Pré-requisitos

- Node.js >= 20
- PostgreSQL >= 16 (local ou via Docker)

## Configuração inicial

```bash
# 1. dependências (workspaces npm)
npm install

# 2. subir o Postgres (ou aponte o DATABASE_URL para uma instância própria)
docker compose up -d db

# 3. gerar o .env de desenvolvimento com segredos aleatórios
node infrastructure/scripts/gen-dev-env.cjs

# 4. aplicar migrations e criar o primeiro admin
npm run db:deploy
npm run db:seed
```

O seed cria o usuário `ADMIN_USERNAME` (padrão `admin`) com a senha `ADMIN_PASSWORD` do `.env`. No primeiro login o sistema **exige** troca de senha e ativação do 2FA.

## Desenvolvimento

```bash
npm run dev          # sobe API (:8080) e frontend (:5173) juntos
npm run dev:api      # só a API
npm run dev:web      # só o frontend
npm run test         # testes unitários do núcleo do Sano (node:test)
```

O Vite faz proxy de `/api` para `localhost:8080`, então navegador e API ficam na mesma origem — isso é o que permite os cookies `SameSite=strict` funcionarem em desenvolvimento.

## Build

```bash
npm run build        # compila backend (tsc) e frontend (vite build)
```

## Rotas da API

| Método | Rota | Acesso | Descrição |
| ------ | ---- | ------ | --------- |
| GET  | `/api/health` | público | Health check |
| POST | `/api/auth/login` | público | Autentica e emite cookie `pre_auth` |
| POST | `/api/auth/change-password` | pre-auth | Troca de senha obrigatória |
| POST | `/api/auth/2fa/setup` | pre-auth | Gera segredo TOTP e QR Code |
| POST | `/api/auth/2fa/confirm` | pre-auth | Confirma e ativa o 2FA |
| POST | `/api/auth/2fa/verify` | pre-auth | Valida o código e emite cookie `session` |
| POST | `/api/auth/logout` | — | Encerra a sessão |
| GET  | `/api/auth/me` | sessão | Usuário autenticado |
| POST | `/api/sano/command` | sessão | Envia um comando ao Sano (retorna `intent`, `reply` e `actions`) |
| GET | `/api/appointments` | sessão | Lista os compromissos do usuário |
| GET | `/api/appointments/due` | sessão | Lembretes vencidos (marca como enviados ao responder) |
| POST | `/api/appointments` | sessão | Cria um compromisso |
| PATCH/DELETE | `/api/appointments/:id` | dono | Atualiza ou apaga |
| —    | `/api/admin/*` | admin | Gestão de usuários e logs de auditoria |

## O Sano (Fase 2)

O dashboard é um terminal: o usuário digita comandos em português e o roteador de intenções responde.

```bash
npm run test    # cobre normalização, intenções, permissões e comandos planejados
```

- **Normalização**: minúsculo, sem acentos e sem pontuação; o chamador `"Sano,"` é removido do início.
- **Intenções ativas**: `ajuda`, `quem sou eu`, `status`, `que horas são`, `painel adm` (só ADMIN).
- **Intenções mapeadas** (respondem "planejado para a Fase 3/4"): agenda, bate-papo, jogos, arquivos, treino, música e OSINT (só ADMIN).
- **Ações**: a resposta pode incluir `actions: [{ type: 'navigate', to: '/admin' }]`, executada pelo frontend.
- **Rate limit**: 30 comandos/min por IP (`commandLimiter`), acima do limite global de 120/min.
- **Auditoria**: registra apenas a **intenção** (`SANO_COMMAND`), nunca o texto digitado; `ajuda`, saudações e hora ficam de fora por serem ruído.
- **Extensão**: quando nenhuma intenção casa (`unknown`), `backend/src/services/sano/router.ts` é o ponto de entrada para a interpretação por IA em linguagem natural.

## Agenda (Fase 3 — módulo 2)

Os compromissos ficam no banco (modelo `Appointment`, por usuário) e aparecem em `/agenda`. O Sano cria, lista e cancela por frase:

```
agendar reunião com João amanhã às 14h
agendar revisão do projeto amanhã das 14h às 15h30 me lembre 15 minutos antes
ligar para o banco daqui a 10 minutos
quais são meus compromissos
cancelar reunião
cancelar todos os compromissos de amanhã, pode cancelar
```

O cancelamento em lote é a única ação destrutiva em massa, então **nunca apaga na primeira frase**: mostra a prévia do que será removido e só executa depois da confirmação.

- **Parser determinístico** (`backend/src/services/agenda/parse.ts`), sem IA: entende "hoje/amanhã/depois de amanhã", dias da semana, `15/10`, "da 15 de outubro", "daqui a 2 horas", `14h`, `14:30`, `das 14h às 15h30` e lembretes ("me lembre 15 minutos antes").
- **Fuso**: frases são resolvidas em `America/Sao_Paulo` e gravadas em UTC.
- **Falta de informação**: se a frase não tiver título ou data, o Sano pergunta o que falta em vez de adivinhar.
- **Cancelamento**: busca por trecho no título; havendo mais de um candidato, ele pergunta qual em vez de apagar o errado.
- **Limpeza do dia** (`cancelar todos … de <data>`): apaga apenas o dia pedido, exige confirmação por palavra e a frase sugerida usa um formato que o próprio parser entende.
- **Lembretes**: `remindBefore` (minutos) + `reminderSentAt`. Enquanto o app estiver aberto, `ReminderWatcher` faz polling a cada 30 s, mostra o aviso na tela e dispara a notificação do navegador (pedindo permissão com o sino na barra superior).
- **Aviso único**: o servidor marca o lembrete como enviado antes de responder, então polling concorrente ou várias abas não geram duplicidade.
- **Limite conhecido**: com o app fechado não há aviso — o push do PWA (Service Worker) fica para a Fase 5.

## Trainer / Sistema (Fase 4 — módulo 5)

Página `/treino`: cadastro objetivo, treino do dia, atributos em evolução e penalidades.

**Objetivo, não "classe".** O cadastro não oferece rótulos decorativos (Guerreiro/Monarca) — eles não mudavam nada no treino e só criavam interpretação ambígua. São quatro objetivos que descrevem exatamente o efeito:

| Objetivo | Efeito no plano |
|---|---|
| Ganhar massa muscular | Foco em pernas, peito, costas, ombros e braços; progressão de carga |
| Emagrecer | Foco em cardio, pernas, core e mobilidade |
| Melhorar condicionamento | Cardio e resistência muscular, com menos volume por grupo |
| Saúde e mobilidade | Treino leve de mobilidade, core e cardio |

Os grupos focais exibidos na tela vêm do **mesmo array** que o motor aplica, e um teste garante que o treino gerado nunca sai dessa lista — a tela não pode prometer uma coisa e entregar outra.

**O que continua temático (e é funcional):** nível, XP, radar de atributos e ofensiva — que são o histórico real de treino, não enfeite.

**Divisão 80/20 com a IA, aplicada de verdade:**

- **Código (80%)** — `services/trainer/rules.ts` decide exercício, volume e segurança. É **determinístico**: mesma entrada, mesma saída. A IA nunca participa dessa decisão.
- **IA (20%)** — `services/trainer/ai.ts` só transforma os números em texto: abertura da missão, relatório semanal, tira-dúvidas biomecânico e cardápio. Sem `AI_API_KEY`, tudo cai em texto local — o módulo nunca fica inoperante.

**Filtro de segurança** (`screenOut`), avaliado antes de qualquer escolha:

1. lesão declarada → exercício contraindicado é **sempre** removido;
2. equipamento indisponível → removido;
3. acima de 60 anos → nada de dificuldade máxima.

A ordem é proposital: a lesão vem primeiro, senão o motivo exibido esconderia o risco real. O usuário vê a lista do que foi bloqueado e por quê na aba "Biblioteca".

**Missões** nascem sob demanda (sem cron): uma por dia, garantida pelo índice único `(userId, day)`. Marcar todos os blocos fecha a missão e aplica XP, atributos e ofensiva. Dias em branco zeram a ofensiva e aplicam debuff de 5%/dia (teto de 40%), visível no radar em vermelho.

**Atalhos no chat** (o chat resume e age; a tela continua sendo o lugar principal):

```
meu treino
completei flexão
status
```

### Configurar a IA

```bash
# em backend/.env
AI_API_KEY=sua-chave
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
```

Os prompts de sistema fixos proíbem a IA de inventar exercício, série ou repetição, e de responder sobre equipamento ou lesão que o perfil não tem.

## Segurança — decisões de projeto

- **Sem cadastro público**: usuários só existem se o ADMIN criar.
- **Cookies HTTP-only**: o token nunca é exposto ao JavaScript (mitiga XSS).
- **2FA obrigatório**: `requireAuth` rejeita quem não trocou a senha e não ativou o 2FA.
- **Revogação imediata**: `tokenVersion` invalida todas as sessões do usuário.
- **Anti-CSRF**: métodos de escrita exigem `Origin` igual a `FRONTEND_URL`.
- **Rate limiting**: limite global + limite específico nas rotas de autenticação.
- **Segredos 2FA cifrados** em repouso com AES-256-GCM.

## Deploy

A hospedagem prevista é a **Discloud**. Os Dockerfiles em `infrastructure/docker/` e o `nginx.conf` em `infrastructure/nginx/` estão prontos para build de imagem. Em produção, defina `NODE_ENV=production`, `FRONTEND_URL` com a URL HTTPS real e `COOKIE_SAMESITE=none` caso front e API estejam em domínios diferentes — mantendo HTTPS obrigatório.

## Roadmap

- [x] **Fase 1** — Arquitetura, banco de dados e segurança base
- [x] **Fase 2** — Núcleo: dashboard do assistente e chat/comando central
- [ ] **Fase 3** — Módulo 2 (Agenda) ✅ · módulos 1, 3 e 4 pendentes
- [ ] **Fase 3** — Módulos 1 a 4 (chat E2EE, agenda, jogos cognitivos, utilitários)
- [ ] **Fase 4** — Módulos 5 a 7 (trainer IA, streaming, terminal OSINT em sandbox)
- [ ] **Fase 5** — Wrapper PWA, auditoria final e deploy