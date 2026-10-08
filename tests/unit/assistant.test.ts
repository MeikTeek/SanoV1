import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAssistantMemoryForTests } from '../../backend/src/services/sano/context.service';
import { normalizeMessage } from '../../backend/src/services/assistant/normalize';
import { extractEntities } from '../../backend/src/services/assistant/entities';
import { createIntentRegistry } from '../../backend/src/services/assistant/registry';
import { unknownResponse } from '../../backend/src/services/assistant/recovery';
import { handleCommand, matchIntent } from '../../backend/src/services/sano/router';
import type { SanoUser } from '../../backend/src/services/sano/types';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  clearAssistantMemoryForTests();
});

const NOW = new Date('2026-10-03T13:00:00.000Z');
const user: SanoUser = { id: `assistant-${Date.now()}`, username: 'ana', role: 'USER', lastLoginAt: null };
const route = (phrase: string) => matchIntent(normalizeMessage(phrase))?.name;

test('normalização trata acentos, abreviações, pontuação e espaços', () => {
  assert.equal(normalizeMessage(' AMNH, às 10h!  VC  sabe PQ? '), 'amanha as 10h voce sabe porque');
  assert.equal(normalizeMessage('HJ agenda'), 'hoje agenda');
});

test('registro pontua sinônimos e tolera erro curto de digitação', () => {
  const registry = createIntentRegistry<string>();
  registry.registerIntent({
    id: 'agenda',
    module: 'agenda',
    patterns: ['agenda', 'marcar reunião', 'agendar compromisso'],
    entities: ['date', 'time', 'title'],
    handler: 'agenda-handler',
    threshold: 0.75,
  });

  assert.equal(registry.detectIntent('marcar uma reuniao').intent.handler, 'agenda-handler');
  assert.equal(registry.detectIntent('agnda').intent.id, 'agenda');
  assert.equal(registry.detectIntent('xyz completamente'), null);
});

const phraseGroups: { label: string; intent: string; phrases: string[] }[] = [
  {
    label: 'criação de compromisso',
    intent: 'agenda',
    phrases: [
      'agende uma reunião amanhã às 10 horas',
      'marque na agenda uma reunião amanhã às 14 horas',
      'coloca reunião amanhã duas da tarde',
      'me lembra de ligar pro João dia 15 às 9:30',
      'amanhã 10h reunião',
      'anota dentista amanhã às 11h',
      'registre almoço sexta às 12h',
      'adicione consulta dia 15 às 8h',
    ],
  },
  {
    label: 'consulta da agenda',
    intent: 'agenda',
    phrases: [
      'o que tenho hoje',
      'minha agenda de amanhã',
      'tem algo marcado sexta?',
      'ver minha agenda',
      'agenda',
      'consultar calendário',
      'quais são meus compromissos hoje',
      'compromissos da semana que vem',
    ],
  },
  {
    label: 'cancelamento de compromisso',
    intent: 'agenda',
    phrases: [
      'cancelar reunião',
      'cancele o compromisso',
      'cancela a consulta de amanhã',
      'apagar reunião do João',
      'apague meu lembrete',
      'remover compromisso',
      'remova consulta sexta',
      'quero cancelar o evento',
    ],
  },
  {
    label: 'alteração de compromisso',
    intent: 'agenda',
    phrases: [
      'mudar reunião para sexta às 15h',
      'muda o compromisso para amanhã às 10h',
      'alterar consulta para dia 15 às 9h',
      'altere a reunião para segunda às 14h',
      'remarcar reunião para semana que vem às 11h',
      'remarque consulta para amanhã às 8h',
      'reagendar compromisso sexta às 16h',
      'reagende a reunião para depois de amanhã às 10h',
    ],
  },
  {
    label: 'atalho para agenda',
    intent: 'agenda',
    phrases: [
      'abrir agenda', 'abre a agenda', 'quero abrir minha agenda', 'ir para agenda',
      'calendário', 'mostrar agenda', 'agenda de hoje', 'abrir compromissos',
    ],
  },
  {
    label: 'atalho e status do treino',
    intent: 'treino',
    phrases: [
      'treino', 'meu treino', 'missão de hoje', 'status do treino',
      'abrir treino', 'quero treinar', 'ver meus exercícios', 'status do personagem',
    ],
  },
  {
    label: 'atalho administrativo',
    intent: 'admin',
    phrases: [
      'admin', 'painel admin', 'painel adm', 'abrir painel administrativo',
      'abre painel admin', 'ir ao painel admin', 'quero ver o admin', 'entrar no painel administrativo',
    ],
  },
  {
    label: 'atalho de ajustes',
    intent: 'settings',
    phrases: [
      'ajustes', 'configurações', 'config', 'preferências',
      'abrir ajustes', 'abre configurações', 'quero ver as preferências', 'ir para ajustes',
    ],
  },
  {
    label: 'atalho de perfil',
    intent: 'whoami',
    phrases: [
      'perfil', 'meu perfil', 'quem sou eu', 'quero ver meu perfil',
      'abre perfil', 'abrir meu perfil', 'mostra meu perfil', 'ver perfil',
    ],
  },
  {
    label: 'resumo do dia',
    intent: 'briefing',
    phrases: [
      'resumo do dia', 'resumo', 'briefing', 'panorama de hoje',
      'como está meu dia', 'como vai ser meu dia', 'meu dia', 'situação do dia',
    ],
  },
  {
    label: 'data e hora atuais',
    intent: 'time',
    phrases: [
      'que horas são', 'que horas', 'qual a hora agora', 'data de hoje',
      'que dia é hoje', 'hora', 'dia', 'data e hora atuais',
    ],
  },
  {
    label: 'diagnóstico do sistema',
    intent: 'status',
    phrases: [
      'diagnóstico do sistema', 'status do sistema', 'diagnóstico da API',
      'saúde do servidor', 'sistema funcionando', 'status', 'diagnostico', 'como está o sistema',
    ],
  },
  {
    label: 'ajuda',
    intent: 'help',
    phrases: [
      'ajuda', 'help', 'comandos', 'lista de comandos',
      'me ajuda', 'preciso de ajuda', 'o que você sabe fazer', 'como posso pedir',
    ],
  },
];

for (const group of phraseGroups) {
  test(`reconhece oito variações: ${group.label}`, () => {
    assert.equal(group.phrases.length, 8);
    for (const phrase of group.phrases) {
      assert.equal(route(phrase), group.intent, `"${phrase}"`);
    }
  });
}

test('pedido de música é reconhecido como recurso futuro', async () => {
  assert.equal(route('toca a música X pra mim'), 'musica');
  assert.equal(route('coloca X para tocar'), 'musica');
  const response = await handleCommand(user, 'toca a música X pra mim', { pingDb: async () => 1 }, NOW);
  assert.match(response.reply, /ainda não está disponível/i);
  assert.doesNotMatch(response.reply, /não entendi|comando inválido|digite ajuda/i);
});

test('datas e horas extraídas produzem o mesmo instante local', () => {
  const numeric = extractEntities('agende reunião amanhã às 14h', NOW);
  const spoken = extractEntities('agende reunião amanhã duas da tarde', NOW);
  assert.equal(numeric.date?.toISOString(), spoken.date?.toISOString());
  assert.deepEqual(numeric.time, { hours: 14, minutes: 0 });
  assert.deepEqual(spoken.time, { hours: 14, minutes: 0 });
});

test('preenche data e hora em turnos separados e não grava antes da confirmação', async () => {
  const store: { id: string; title: string; startsAt: Date; status: string }[] = [];
  const agenda = {
    list: async () => store as never,
    create: async (_userId: string, input: { title: string; startsAt: Date }) => {
      const saved = { id: 'scheduled-1', ...input, status: 'PENDING' };
      store.push(saved);
      return saved as never;
    },
    findByTitle: async () => store as never,
    cancel: async () => undefined,
    update: async () => store[0] as never,
    listByDay: async () => store as never,
    cancelDay: async () => 0,
  };
  const assistantUser = { ...user, id: `slot-fill-${Date.now()}` };
  const deps = { pingDb: async () => 1, agenda };

  const dateQuestion = await handleCommand(assistantUser, 'agende reunião com o time', deps, NOW);
  assert.match(dateQuestion.reply, /para qual dia/i);
  const timeQuestion = await handleCommand(assistantUser, 'amanhã', deps, NOW);
  assert.match(timeQuestion.reply, /que horas/i);
  const preview = await handleCommand(assistantUser, '14h', deps, NOW);
  assert.equal(preview.view?.kind, 'confirmation');
  assert.equal(store.length, 0);
  await handleCommand(assistantUser, 'confirmar', deps, NOW);
  assert.equal(store.length, 1);
  assert.equal(store[0].title, 'Reunião com o time');
  assert.equal(store[0].startsAt.toISOString(), '2026-10-04T17:00:00.000Z');
});

test('frases fora de escopo recebem recuperação útil, sem respostas de falha genéricas', async () => {
  const confusing = [
    'asdfgh', 'quero aquilo ali', 'manda o negócio', 'isso de ontem pra depois',
    'faz acontecer', 'xyz blorpt', 'onde fica o planeta azul', 'preciso de uma coisa',
    'não sei explicar', 'me ajuda com uma ideia', 'faz um desenho', 'cria uma receita',
    'tem como resolver isso', 'como está aquilo', 'me surpreende', 'pode ser diferente',
    'tô pensando numa coisa', 'lembra daquela parada', 'faz do jeito certo', 'quero mudar tudo',
    'xpto 987', '???', 'fala alguma coisa', 'sabe de um lugar legal',
    'pode tocar qualquer coisa', 'como funciona o universo', 'me conta algo',
    'amanha talvez depois', 'marca isso quando der', 'não sei o que pedir',
  ];
  const blocked = /não entendi|comando inválido|digite ajuda|comando não reconhecido|tente de novo/i;
  for (const phrase of confusing) {
    const response = unknownResponse(user, phrase);
    assert.ok(response.reply.trim(), `resposta vazia para "${phrase}"`);
    assert.doesNotMatch(response.reply, blocked, `"${phrase}"`);
  }
});

test('saudações e respostas sociais variam sem repetir imediatamente', async () => {
  const socialUser = { ...user, id: `social-${Date.now()}` };
  const responses = await Promise.all([
    handleCommand(socialUser, 'oi', { pingDb: async () => 1 }, NOW),
    handleCommand(socialUser, 'oi', { pingDb: async () => 1 }, NOW),
    handleCommand(socialUser, 'oi', { pingDb: async () => 1 }, NOW),
  ]);
  assert.equal(new Set(responses.map((response) => response.reply)).size, 3);
  assert.match((await handleCommand(socialUser, 'quem é você?', { pingDb: async () => 1 }, NOW)).reply, /Sou o Sano/i);
  assert.match((await handleCommand(socialUser, 'obrigado', { pingDb: async () => 1 }, NOW)).reply, /Por nada|à disposição|ajudou/i);
});
