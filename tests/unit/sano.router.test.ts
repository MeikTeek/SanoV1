import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand, matchIntent, resolveContinuation } from '../../backend/src/services/sano/router';
import { normalize, stripWakeWord } from '../../backend/src/services/sano/normalize';
import { clearAssistantMemoryForTests } from '../../backend/src/services/sano/context.service';
import type { SanoUser } from '../../backend/src/services/sano/types';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  clearAssistantMemoryForTests();
});

const admin: SanoUser = { id: '1', username: 'root', role: 'ADMIN', lastLoginAt: null };
const user: SanoUser = { id: '2', username: 'ana', role: 'USER', lastLoginAt: new Date('2026-01-01T12:00:00Z') };
const deps = { pingDb: async () => 7 };
const run = (u: SanoUser, text: string) => handleCommand(u, text, deps, new Date('2026-10-03T17:30:00Z'));

/** true quando a resposta traz botões de confirmação (ação destrutiva). */
const previewsConfirmation = (r: { view?: { kind: string } }) => r.view?.kind === 'confirmation';

test('normalize remove acentos e pontuação', () => {
  assert.equal(normalize('  Sano, QUE horas são?! '), 'sano que horas sao');
  assert.equal(stripWakeWord('sano que horas sao'), 'que horas sao');
  assert.equal(stripWakeWord('ei sano ajuda'), 'ajuda');
});

test('ajuda lista comandos e esconde os de admin para USER', async () => {
  const r = await run(user, 'ajuda');
  assert.equal(r.intent, 'help');
  assert.match(r.reply, /agenda/);
  assert.match(r.reply, /Versão do site/);
  assert.doesNotMatch(r.reply, /osint/);
  assert.match(JSON.stringify(r.view), /versão do site/i);
  assert.match((await run(admin, 'ajuda')).reply, /osint/);
});

test('horas', async () => {
  const r = await run(user, 'Sano, que horas são?');
  assert.equal(r.intent, 'time');
  assert.match(r.reply, /2026/);
});

test('versão do site mostra commit e timestamp do build', async () => {
  const r = await run(user, 'qual versão do site?');
  assert.equal(r.intent, 'version');
  assert.match(r.reply, /Versão publicada: local/);
  assert.match(r.reply, /Build: unknown/);
});

test('comandos de módulos futuros são reconhecidos', async () => {
  assert.equal((await run(user, 'inicie a música X')).intent, 'musica');
  assert.equal((await run(user, 'montar meu treino')).intent, 'treino');
});

test('painel adm: negado para USER, navega para ADMIN', async () => {
  const denied = await run(user, 'painel adm');
  assert.match(denied.reply, /apenas para administradores/i);
  assert.equal(denied.actions, undefined);
  const ok = await run(admin, 'abrir painel admin');
  assert.deepEqual(ok.actions, [{ type: 'navigate', to: '/admin' }]);
});

test('osint é restrito a admin', async () => {
  assert.match((await run(user, 'abrir terminal osint')).reply, /apenas para administradores/i);
});

test('status usa o ping do banco e trata falha', async () => {
  assert.match((await run(user, 'status')).reply, /online \(7 ms\)/);
  const down = await handleCommand(user, 'status', { pingDb: async () => { throw new Error('x'); } });
  assert.match(down.reply, /INDISPONÍVEL/);
});

test('desconhecido e vazio', async () => {
  assert.equal((await run(user, 'blablabla xyz')).intent, 'unknown');
  assert.equal((await run(user, 'Sano')).intent, 'greeting');
  assert.equal(matchIntent('quem sou eu')?.name, 'whoami');
});

/* ------------------------------- agenda (Fase 3) ------------------------------- */

/** Agenda falsa: o núcleo do Sano recebe as dependências injetadas, sem tocar no banco. */
const fakeAgenda = () => {
  const store: { id: string; title: string; participants?: string; startsAt: Date; status: string }[] = [];
  return {
    store,
    deps: {
      list: async () => store.filter((a) => a.status === 'PENDING') as never,
      create: async (_id: string, data: { title: string; participants?: string; startsAt: Date }) => {
        const saved = { id: String(store.length + 1), title: data.title, participants: data.participants, startsAt: data.startsAt, status: 'PENDING' };
        store.push(saved);
        return saved as never;
      },
      findByTitle: async (_id: string, term: string) =>
        store.filter((a) => a.status === 'PENDING' && a.title.toLowerCase().includes(term.toLowerCase())) as never,
      cancel: async (_id: string, id: string) => { const item = store.find((a) => a.id === id); if (item) item.status = 'CANCELED'; },
      update: async (_id: string, id: string, data: { title?: string; startsAt?: Date }) => {
        const item = store.find((a) => a.id === id);
        if (!item) throw new Error('appointment not found');
        if (data.title) item.title = data.title;
        if (data.startsAt) item.startsAt = data.startsAt;
        return item as never;
      },
      listByDay: async (_id: string, from: Date, to: Date) =>
        store.filter((a) => a.status === 'PENDING' && a.startsAt >= from && a.startsAt < to) as never,
      cancelDay: async (_id: string, from: Date, to: Date) => {
        const alvo = store.filter((a) => a.status === 'PENDING' && a.startsAt >= from && a.startsAt < to);
        alvo.forEach((a) => { a.status = 'CANCELED'; });
        return alvo.length;
      },
    },
  };
};

let fixtureId = 0;
const fixtureUsers = new WeakMap<object, string>();
const runAgenda = (u: SanoUser, text: string, agenda: ReturnType<typeof fakeAgenda>) => {
  let id = fixtureUsers.get(agenda);
  if (!id) { id = `agenda-fixture-${++fixtureId}`; fixtureUsers.set(agenda, id); }
  return handleCommand({ ...u, id }, text, { pingDb: async () => 1, agenda: agenda.deps }, new Date('2026-10-03T13:00:00Z'));
};

const createAndConfirm = async (u: SanoUser, text: string, agenda: ReturnType<typeof fakeAgenda>) => {
  const preview = await runAgenda(u, text, agenda);
  assert.equal(preview.view?.kind, 'confirmation');
  assert.equal(agenda.store.length, 0);
  await runAgenda(u, 'confirmar', agenda);
  assert.equal(agenda.store.length, 1);
  return preview;
};

test('agendar por frase cria o compromisso', async () => {
  const agenda = fakeAgenda();
  const r = await runAgenda(user, 'agendar reunião com João amanhã às 14h', agenda);
  assert.equal(r.intent, 'agenda');
  assert.match(r.reply, /Reunião/);
  assert.match(JSON.stringify(r.view), /João/);
  assert.equal(r.view?.kind, 'confirmation');
  assert.equal(agenda.store.length, 0);
  await runAgenda(user, 'confirmar', agenda);
  assert.equal(agenda.store.length, 1);
  assert.equal(agenda.store[0].title, 'Reunião');
});

test('listar e cancelar pela agenda', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  assert.match((await runAgenda(user, 'quais são meus compromissos', agenda)).reply, /Reunião/);

  // Cancelar é destrutivo: a primeira frase só confirma, não apaga.
  const previa = await runAgenda(user, 'cancelar reunião', agenda);
  assert.equal(previa.view?.kind, 'confirmation');
  assert.equal(previewsConfirmation(previa), true);
  assert.equal(agenda.store[0].status, 'PENDING');

  // Com a confirmação, aí sim cancela.
  const feito = await runAgenda(user, 'confirmar', agenda);
  assert.match(feito.reply, /cancelei/i);
  assert.equal(agenda.store[0].status, 'CANCELED');
});

test('agenda pede data quando a frase não tem quando', async () => {
  const r = await runAgenda(user, 'agendar reunião com João', fakeAgenda());
  assert.match(r.reply, /para qual dia/i);
});

test('cancelar todos: pede confirmação e só apaga depois', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  await runAgenda(user, 'agendar almoço amanhã às 12h', agenda);
  await runAgenda(user, 'confirmar', agenda);

  // 1ª vez: mostra o que será apagado, sem apagar nada.
  const previa = await runAgenda(user, 'cancelar todos os compromissos de amanhã', agenda);
  assert.match(previa.reply, /Vou cancelar 2 compromissos/);
  assert.equal(previa.view?.kind, 'confirmation');
  assert.equal(agenda.store.filter((a) => a.status === 'PENDING').length, 2);

  // 2ª vez, confirmando: apaga.
  const feito = await runAgenda(user, 'confirmar', agenda);
  assert.match(feito.reply, /cancelei 2 compromissos/i);
  assert.equal(agenda.store.filter((a) => a.status === 'CANCELED').length, 2);
});

test('a confirmação textual conclui o cancelamento em lote', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);

  await runAgenda(user, 'cancelar todos os compromissos de amanhã', agenda);
  const feito = await runAgenda(user, 'sim', agenda);
  assert.match(feito.reply, /cancelei 1 compromisso/i);
});

test('cancelar todos: dia sem compromissos avisa e não quebra', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  const r = await runAgenda(user, 'cancelar todos os compromissos de 15/10', agenda);
  assert.match(r.reply, /Não há compromissos/i);
  assert.equal(agenda.store[0].status, 'PENDING');
});

/* ------------------------- memória e painéis (HUD) ------------------------- */

test('continuação de conversa reescreve a frase com base na memória', () => {
  const memory = {
    lastIntent: 'agenda',
    focusDay: '2026-10-03',
    lastAppointments: [{ id: '9', title: 'Reunião de projeto', startsAt: '2026-10-04T17:00:00.000Z' }],
    updatedAt: '',
  };

  // "e amanhã?" vira uma consulta de agenda.
  assert.equal(resolveContinuation('e amanha', memory), 'mostrar agenda amanha');

  // "cancela essa" aponta para o último compromisso listado.
  assert.equal(resolveContinuation('cancela essa', memory), 'cancelar Reunião de projeto');

  // Sem memória, a frase continua sendo tratada como comando normal.
  assert.equal(resolveContinuation('e amanha', { ...memory, lastIntent: null }), null);
});

test('agenda responde com painel de linha do tempo, não com texto solto', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  const r = await runAgenda(user, 'quais são meus compromissos', agenda);

  assert.equal(r.view?.kind, 'timeline');
  const items = (r.view as { items: { title: string }[] }).items;
  assert.equal(items[0].title, 'Reunião');
});

test('ajuda vira grade de botões clicáveis', async () => {
  const r = await run(user, 'ajuda');
  assert.equal(r.view?.kind, 'actions');
  const items = (r.view as { items: { command: string }[] }).items;
  assert.ok(items.some((i) => i.command === 'briefing'), 'deve incluir o briefing');
});

test('status vira medidores com tom por saúde', async () => {
  const r = await run(user, 'status');
  assert.equal(r.view?.kind, 'meters');
  const items = (r.view as { items: { label: string; tone?: string }[] }).items;
  assert.equal(items.find((i) => i.label === 'API')?.tone, 'ok');
});

test('agendar em horário ocupado avisa o conflito e sugere horário livre', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  const conflito = await runAgenda(user, 'agendar call amanhã às 14h', agenda);

  assert.match(conflito.reply, /conflito de horário/i);
  assert.equal(conflito.view?.kind, 'confirmation');
});

test('cancelamento mostra uma confirmação antes de remover o compromisso escolhido', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar revisão amanhã às 9h', agenda);
  await runAgenda(user, 'agendar revisão amanhã às 15h', agenda);
  await runAgenda(user, 'confirmar', agenda);

  const r = await runAgenda(user, 'cancelar revisão', agenda);
  // Ainda não pode ter apagado nada.
  assert.equal(agenda.store.filter((a) => a.status === 'PENDING').length, 2);
  assert.equal(r.view?.kind, 'confirmation');
});

test('alterar compromisso só atualiza depois da confirmação', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);

  const before = agenda.store[0].startsAt.toISOString();
  const preview = await runAgenda(user, 'mudar reunião para sexta às 15h', agenda);
  assert.equal(preview.view?.kind, 'confirmation');
  assert.equal(agenda.store[0].startsAt.toISOString(), before);

  await runAgenda(user, 'confirmar', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T18:00:00.000Z');
});

test('alterar compromisso preenche data e hora em turnos separados antes de confirmar', async () => {
  const agenda = fakeAgenda();
  await createAndConfirm(user, 'agendar reunião amanhã às 14h', agenda);
  const original = agenda.store[0].startsAt.toISOString();

  const askDate = await runAgenda(user, 'mudar reunião', agenda);
  assert.match(askDate.reply, /para qual dia/i);
  assert.equal(agenda.store[0].startsAt.toISOString(), original);

  const askTime = await runAgenda(user, 'sexta', agenda);
  assert.match(askTime.reply, /que horas/i);
  assert.equal(agenda.store[0].startsAt.toISOString(), original);

  const preview = await runAgenda(user, '15h', agenda);
  assert.equal(preview.view?.kind, 'confirmation');
  assert.equal(agenda.store[0].startsAt.toISOString(), original);

  await runAgenda(user, 'confirmar', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T18:00:00.000Z');
});

/* ------------------------- roteamento da IA no chat ------------------------- */

test('dúvidas vão para a intenção de IA; o resto continua por regra', () => {
  // Regressão: o normalize remove pontuação, então um padrão /\?$/ nunca casa.
  const routed = (t: string) => matchIntent(stripWakeWord(normalize(t)))?.name;

  for (const q of [
    'como faço flexão diamante?',
    'como fazer flexao',
    'como executo agachamento',
    'qual a postura correta do agachamento',
    'explica o erro comum da flexão',
  ]) {
    assert.equal(routed(q), 'pergunta', `"${q}" deveria ir para a IA`);
  }

  // E o que já respondia por regra precisa continuar indo por regra.
  assert.equal(routed('que horas são?'), 'time');
  assert.equal(routed('agendar reunião amanhã'), 'agenda');
  assert.equal(routed('meu treino'), 'treino');
  assert.equal(routed('blablabla'), undefined);
});