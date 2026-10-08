# Assistente do Sano

O reconhecimento do console é determinístico. `services/assistant/normalize.ts` normaliza a mensagem, `registry.ts` pontua padrões e tolera pequenos erros de digitação, e `dateTime.ts`/`entities.ts` extraem data, hora e título. Datas relativas usam `America/Sao_Paulo`. `services/sano/router.ts` aplica contexto, permissões e encaminha a intenção aos serviços existentes.

Para adicionar uma intenção:

1. Implemente um handler que use as dependências injetadas em `SanoContext`; não acesse o Prisma nem replique regras de negócio de um módulo.
2. Registre-a em `services/sano/intents.ts` ou no módulo correspondente como `Intent` (id/nome, módulo, padrões, exemplos e handler).
3. O router registra as intenções existentes com `registerIntent({ id, module, patterns, entities, handler })`. Para um módulo novo, chame esse registro durante a inicialização e mantenha o handler tipado.
4. Marque ações administrativas com `adminOnly`. Ações que gravam ou removem dados devem retornar uma confirmação estruturada; a execução ocorre apenas após a confirmação autenticada do próprio usuário.
5. Adicione variações de linguagem, casos de data/hora e diálogos de confirmação em `tests/unit`.

O frontend renderiza respostas tipadas em `frontend/src/components/chat/ViewRenderer.tsx`. Para novos cards, atualize também o contrato `SanoView` do backend e do frontend. O endpoint `/sano/command` mantém autenticação, validação Zod e `commandLimiter`; o núcleo de reconhecimento não faz chamadas externas. A intenção já existente de perguntas técnicas do treino permanece separada e só usa IA quando configurada.
