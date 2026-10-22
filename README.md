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

### Módulo financeiro interno

Página `/financas`: orçamento por envelopes no modelo do Actual Budget
(`Integracoes/actual-26.10.0`), com tabelas próprias no PostgreSQL (`Finance*`).

- **A orçar**: toda receita (categorias do grupo de receitas, incluindo o "Saldo
  inicial" das contas) entra em "A orçar"; o usuário distribui entre as categorias
  até zerar.
- **Envelopes**: saldo = orçado + movimento + sobra do mês anterior. Estouro sem
  carryover (↻) sai do "A orçar" do mês seguinte; com carryover, continua no envelope.
  A regra é a mesma de `loot-core/src/server/budget/envelope.ts`, implementada como
  função pura em `backend/src/services/finance/budget.ts` e coberta por testes.
- **Contas** no orçamento ou fora dele (investimentos). Transferências criam o par
  espelhado e só levam categoria quando cruzam o limite do orçamento.
- **Transações**: beneficiários lembram a última categoria, marcação de "conferida",
  busca em todo o histórico e categorização direto na linha.
- **Importação OFX e CSV**: OFX usa o FITID do banco para deduplicar; CSV aceita `,`
  ou `;`, datas BR/ISO, valores `1.234,56`/`-12.50`. Sempre há prévia antes de gravar,
  e reimportar o mesmo extrato não duplica.
- **Contas recorrentes** (aluguel, assinaturas, salário): semanal, mensal, anual ou única;
  "Lançar"/"Pular" com um clique ou lançamento automático no vencimento. Mensais
  respeitam o dia original (todo dia 31 → 28/02 → 31/03).
- **Pelo chat do Sano**: `gastei 45,90 no mercado`, `paguei 120 de luz pelo nubank`,
  `recebi 6500 de salário`, `quanto sobrou de lazer?`, `resumo financeiro`. A conta e a
  categoria são resolvidas pelo nome (ou pela última categoria usada com aquele beneficiário).
- **Relatórios**: receitas × gastos (6 meses), gastos por categoria e patrimônio.
- **Dinheiro em centavos inteiros** em todo o caminho (banco, API e cálculo).
- **Migração automática**: no primeiro acesso, o ledger antigo (JSON em `ToolData`)
  é convertido para as tabelas novas; o JSON original fica como `ledger-backup`.

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
| GET  | `/api/osint` | admin | Catálogo de verificações e categorias de sites |
| POST | `/api/osint/domain` | admin | Varredura de domínio/IP (stream NDJSON) |
| POST | `/api/osint/username` | admin | Busca de username (stream NDJSON) |

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

Página `/agenda`: calendário do mês, próximos compromissos, lista por dia ou semana,
criação rápida por frase (com prévia do que será salvo) e editor completo — local,
participantes, dia inteiro, lembrete, recorrência e notas.

### O Sano como assistente de agenda

```
marca dentista sexta às 15h                  → cria na hora, com "Desfazer"
me lembra de ligar pra minha mãe às 19h      → hoje (ou amanhã, se já passou)
academia toda segunda às 7h                  → série semanal (também: todo dia, dias úteis, todo dia 5, todo ano)
aniversário da Bia dia 15/11                 → dia inteiro
reunião com Ana dia 30 das 10h às 11h30 local: Sala 3
qual meu próximo compromisso? / quando é o dentista?
o que tenho essa semana? / quantos compromissos semana que vem?
tô livre quinta à tarde?                     → mostra os intervalos livres
adia o dentista 1 hora / antecipa a reunião 30 min / passa a call pra sexta
me lembra da reunião 1 dia antes / concluí a reunião com Ana
cancela o dentista (confirma) · cancela a academia → "só essa" ou "todas as próximas"
desfazer
```

- **Entendimento** em `services/agenda/nlu.ts` (o que o pedido quer, intervalos como
  "essa semana"/"à tarde", recorrência, termo de busca) + `parse.ts` (título,
  participantes, horários). Determinístico, sem IA, coberto por testes.
- **Criar e mover acontecem na hora** com "desfazer" (são reversíveis). **Cancelar pede
  confirmação**; conflito de horário também, sugerindo horários livres próximos.
- **Respostas como cartões** (compromisso, agenda do período) e **respostas rápidas**
  (chips) — perguntas incompletas oferecem os dias/horários mais prováveis.
- **Lembrete padrão**: 15 min antes (na hora, se faltar menos de 30 min).
- **Recorrência**: cada ocorrência é uma linha própria com o mesmo `seriesId`, gerada
  até 120 dias à frente e estendida sob demanda. Editar/excluir na tela permite "só
  este" ou "este e os próximos".
- **Busca sem acento**: "reuniao" acha "Reunião"; título e participantes contam.
- **Lembretes**: `ReminderWatcher` faz polling a cada 30 s; o servidor marca como enviado
  antes de responder, então várias abas não duplicam aviso. Com o app fechado não há
  aviso — o push do PWA fica para a Fase 5.

### Agenda no Discord (SanoBot)

O bot fica em um projeto separado (`../SanoBot`) e fala com o Sano por
`/api/integrations/discord/bot/*`, autenticado por `Authorization: Bearer
<DISCORD_BOT_SECRET>` (sem essa variável, a integração fica desligada).

- **Vínculo**: em *Ajustes → Discord* o usuário gera um código de uso único (10 min)
  e digita `/vincular` no Discord. Sem vínculo o bot não acessa nada.
- **Só agenda**: o bot roda o mesmo roteador do chat, mas recebe apenas a agenda;
  outros pedidos recebem um aviso. Memória, confirmação e "desfazer" são os mesmos do site.
- **Lembretes por DM**: `discordRemindedAt` é independente do aviso no navegador; o
  Sano marca antes de responder, então nenhum lembrete chega duas vezes.

## Trainer / Sistema (Fase 4 — módulo 5)

Página `/treino`, organizada em seis seções numa barra lateral (nível, ofensiva e semana sempre à vista):

| Seção | O que tem |
|---|---|
| **Hoje** | Treino do dia com mapa muscular, sugestão de carga por exercício, meta semanal, recuperação muscular (mapa de calor das últimas 72h), últimos treinos e o coach |
| **Plano** | Semana completa; trocar exercício por outro do mesmo músculo (só opções seguras); volume semanal × faixa recomendada e recuperação por músculo |
| **Exercícios** | Biblioteca filtrada tocando no músculo do corpo (padrão wger), por equipamento ou busca; detalhe com técnica, erro comum, variações e o seu histórico |
| **Progresso** | Calendário de frequência, gráfico de 8 semanas, recordes pessoais, conquistas e histórico de sessões (apagar recalcula tudo) |
| **Corpo** | Avaliação quinzenal, composição corporal, meta de peso e aderência |
| **Nutrição** | Calorias e macros calculados, sugestão de refeições |

**Treino ao vivo** (`WorkoutPlayer`): cada série tem carga, reps e RIR reais, a última execução ao lado e a carga sugerida
já preenchida — marcar a série é um toque e dispara o descanso (com bipe, vibração e tela ligada). A sessão fica salva no
navegador: recarregar ou minimizar não perde nada. Ao finalizar, só as séries marcadas são gravadas e o resumo mostra
duração, volume, XP e recordes batidos.

**Progressão dupla** (`services/trainer/progression.ts`, regra do wger): sobe as repetições dentro da faixa; quando
todas as séries chegam ao topo sem falha (RIR ≥ 1), sobe a carga (+2,5 kg; +5 kg em pernas) e volta ao início da faixa.

**Tudo derivado do histórico**: XP, nível, ofensiva, recordes e conquistas são recalculados das sessões
(`WorkoutSession`/`WorkoutLog`/`WorkoutSet`). A ofensiva conta **dias planejados** — descanso do plano não quebra a
sequência. Trocas de exercício ficam em `ToolData` (`trainer/plan-swaps`); nenhuma migração foi necessária.

**Mapa muscular**: desenhos do wger (`frontend/public/muscles`, base do Wikimedia Commons) e contornos por músculo
em `components/trainer/musclePaths.ts`; os ids de músculo são os mesmos do wger (`services/trainer/muscles.ts`).

**Objetivo, não "classe".** O cadastro não oferece rótulos decorativos (Guerreiro/Monarca) — eles não mudavam nada no treino e só criavam interpretação ambígua. São quatro objetivos que descrevem exatamente o efeito:

| Objetivo | Efeito no plano |
|---|---|
| Ganhar massa muscular | Foco em pernas, peito, costas, ombros e braços; progressão de carga |
| Emagrecer | Foco em cardio, pernas, core e mobilidade |
| Melhorar condicionamento | Cardio e resistência muscular, com menos volume por grupo |
| Saúde e mobilidade | Treino leve de mobilidade, core e cardio |

Os grupos focais exibidos na tela vêm do **mesmo array** que o motor aplica, e um teste garante que o treino gerado nunca sai dessa lista — a tela não pode prometer uma coisa e entregar outra.

**O que continua temático (e é funcional):** nível, XP, ofensiva e conquistas — que são o histórico real de treino, não enfeite.

**Divisão 80/20 com a IA, aplicada de verdade:**

- **Código (80%)** — `services/trainer/rules.ts` decide exercício, volume e segurança. É **determinístico**: mesma entrada, mesma saída. A IA nunca participa dessa decisão.
- **IA (20%)** — `services/trainer/ai.ts` só transforma os números em texto: abertura da missão, relatório semanal, tira-dúvidas biomecânico e cardápio. Sem `AI_API_KEY`, tudo cai em texto local — o módulo nunca fica inoperante.

**Filtro de segurança** (`screenOut`), avaliado antes de qualquer escolha:

1. lesão declarada → exercício contraindicado é **sempre** removido;
2. equipamento indisponível → removido;
3. acima de 60 anos → nada de dificuldade máxima.

A ordem é proposital: a lesão vem primeiro, senão o motivo exibido esconderia o risco real. O usuário vê a lista do que foi bloqueado e por quê em "Exercícios".

**Escolha dos exercícios** (`weeklyPlan.ts`): cada slot usa o músculo **principal** do exercício (antes um músculo
secundário bastava, e Superman entrava no dia de pernas) e, dentro do músculo, prefere o equipamento do local
escolhido, compostos antes de isolados, dificuldade compatível com a experiência e menos impacto.

**Atalhos no chat** (usam o mesmo plano semanal da tela; o chat resume e anota, a tela continua sendo o lugar principal):

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

## OSINT (Fase 4 — módulo 7)

Página `/osint`, **só ADMIN** (rota, API e comando do Sano). Duas abas:

- **Domínio / IP**: 13 verificações em paralelo — IPs e PTR, geolocalização, DNS, WHOIS (RDAP),
  certificado TLS, servidor HTTP, cabeçalhos de segurança/HSTS/cookies, e-mail (MX, SPF, DMARC, DKIM),
  subdomínios (Certificate Transparency), meta tags e perfis sociais da página, DNSSEC, `robots.txt`
  e `security.txt`. Adaptado de `Integracoes/web-check-2.3.0` (MIT) em `backend/src/services/osint/domain.ts`,
  sem puppeteer/cheerio/whoiser; registros DNS vão por DNS-over-HTTPS (Google/Cloudflare).
- **Username**: ~690 sites da base `wmn-data.json` do WhatsMyName (CC BY-SA 4.0, cópia sem alterações;
  para atualizar, substitua o arquivo). Sites adultos ficam de fora salvo opt-in.

Os resultados chegam em NDJSON (`POST /api/osint/domain` e `/api/osint/username`), então a tela enche
conforme cada verificação termina. Do Sano: `abrir terminal osint`, `osint exemplo.com.br`,
`osint username fulano`.

Segurança: toda conexão ao alvo passa por `services/osint/net.ts`, que recusa localhost, redes privadas,
link-local/metadados de nuvem e domínios que resolvem para elas (inclusive a cada redirecionamento);
limite de 20 varreduras a cada 10 min; uma busca de username por vez; cada varredura vai para o audit log
(`OSINT_DOMAIN_SCAN`, `OSINT_USERNAME_SCAN`).

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
DB reset at 2026-10-08 18:45:00
