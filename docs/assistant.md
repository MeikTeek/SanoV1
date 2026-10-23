# Assistente do Sano

O reconhecimento do console é determinístico. `services/assistant/normalize.ts` normaliza a mensagem, `registry.ts` pontua padrões e tolera pequenos erros de digitação, e `dateTime.ts`/`entities.ts` extraem data, hora e título. Datas relativas usam `America/Sao_Paulo`. `services/sano/router.ts` aplica contexto, permissões e encaminha a intenção aos serviços existentes.

Para adicionar uma intenção:

1. Implemente um handler que use as dependências injetadas em `SanoContext`; não acesse o Prisma nem replique regras de negócio de um módulo.
2. Registre-a em `services/sano/intents.ts` ou no módulo correspondente como `Intent` (id/nome, módulo, padrões, exemplos e handler).
3. O router registra as intenções existentes com `registerIntent({ id, module, patterns, entities, handler })`. Para um módulo novo, chame esse registro durante a inicialização e mantenha o handler tipado.
4. Marque ações administrativas com `adminOnly`. Ações que gravam ou removem dados devem retornar uma confirmação estruturada; a execução ocorre apenas após a confirmação autenticada do próprio usuário.
5. Adicione variações de linguagem, casos de data/hora e diálogos de confirmação em `tests/unit`.

O frontend renderiza respostas tipadas em `frontend/src/components/chat/ViewRenderer.tsx`. Para novos cards, atualize também o contrato `SanoView` do backend e do frontend. O endpoint `/sano/command` mantém autenticação, validação Zod e `commandLimiter`; o núcleo de reconhecimento não faz chamadas externas. A intenção já existente de perguntas técnicas do treino permanece separada e só usa IA quando configurada.

## IA por usuário (OpenRouter)

Cada usuário pode cadastrar a própria chave da OpenRouter em Ajustes → Inteligência artificial (`/sano/ai`). A chave é validada em `GET /api/v1/key`, guardada criptografada em `SanoAiConfig` e nunca volta ao navegador. O modelo padrão é `openrouter/free`, que escolhe um modelo gratuito disponível.

A IA entra em `router.ts` só quando nenhuma regra entendeu a frase, quando a regra casou com nota baixa (tolerância a erros) ou para a intenção `pergunta`. Ela nunca executa nada: devolve `{"command": ...}`, que roda de novo pelo motor determinístico (sem IA, para não entrar em laço e com as confirmações de sempre), ou `{"reply": ...}` para conversa. Comandos do player de música voltam ao navegador como a ação `run`. Se a IA falhar e havia uma regra de reserva, a regra vale; sem reserva, o Sano explica o motivo (cota, chave recusada, privacidade) e mostra os atalhos. O histórico da conversa com a IA fica só na memória do processo (8 falas, 30 minutos).

Voz: `frontend/src/voice/voice.ts` ouve com a Web Speech API do navegador (pt-BR). Para falar, usa por padrão a voz neural da Microsoft (`POST /sano/voice/tts`, `services/sano/tts.service.ts`, biblioteca `msedge-tts` em versão fixa). É o serviço "Ler em voz alta" do Edge: grátis, sem chave e não oficial, então se ele falhar o navegador cai no `speechSynthesis` do aparelho. Atualizações da Microsoft já quebraram versões antigas da biblioteca (a 2.0.9 recebe 403): se a voz neural parar, atualize o `msedge-tts`. As preferências ficam no `localStorage` do aparelho.
