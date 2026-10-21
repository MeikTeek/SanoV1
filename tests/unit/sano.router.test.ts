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
type FakeItem = {
  id: string; title: string; participants?: string; startsAt: Date; endsAt?: Date | null;
  remindBefore?: number | null; status: string;
};
const fakeAgenda = () => {
  const store: FakeItem[] = [];
  const pending = () => store.filter((a) => a.status === 'PENDING');
  return {
    store,
    deps: {
      list: async () => pending() as never,
      create: async (_id: string, data: { title: string; participants?: string; startsAt: Date; endsAt?: Date; remindBefore?: number | null }) => {
        const saved: FakeItem = { id: String(store.length + 1), ...data, status: 'PENDING' };
        store.push(saved);
        return saved as never;
      },
      findByTitle: async (_id: string, term: string) => {
        const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const words = fold(term).split(/\s+/).filter(Boolean);
        return pending().filter((a) => words.every((w) => fold(`${a.title} ${a.participants ?? ''}`).includes(w))) as never;
      },
      cancel: async (_id: string, id: string) => { const item = store.find((a) => a.id === id); if (item) item.status = 'CANCELED'; },
      update: async (_id: string, id: string, data: Partial<FakeItem>) => {
        const item = store.find((a) => a.id === id);
        if (!item) throw new Error('appointment not found');
        Object.assign(item, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
        return item as never;
      },
      listByDay: async (_id: string, from: Date, to: Date) =>
        pending().filter((a) => a.startsAt >= from && a.startsAt < to).sort((a, b) => +a.startsAt - +b.startsAt) as never,
      cancelDay: async (_id: string, from: Date, to: Date) => {
        const alvo = pending().filter((a) => a.startsAt >= from && a.startsAt < to);
        alvo.forEach((a) => { a.status = 'CANCELED'; });
        return alvo.length;
      },
    },
  };
};

let fixtureId = 0;
const fixtureUsers = new WeakMap<object, string>();
// Sábado, 03/10/2026, 10:00 em São Paulo.
const runAgenda = (u: SanoUser, text: string, agenda: ReturnType<typeof fakeAgenda>) => {
  let id = fixtureUsers.get(agenda);
  if (!id) { id = `agenda-fixture-${++fixtureId}`; fixtureUsers.set(agenda, id); }
  return handleCommand({ ...u, id }, text, { pingDb: async () => 1, agenda: agenda.deps }, new Date('2026-10-03T13:00:00Z'));
};

test('agendar por frase cria na hora, como cartão, e "desfazer" reverte', async () => {
  const agenda = fakeAgenda();
  const r = await runAgenda(user, 'agendar reunião com João amanhã às 14h', agenda);
  assert.equal(r.intent, 'agenda');
  assert.match(r.reply, /Reunião/);
  assert.equal(r.view?.kind, 'event');
  assert.match(JSON.stringify(r.view), /João/);
  assert.equal(agenda.store.length, 1);
  assert.equal(agenda.store[0].title, 'Reunião');
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-04T17:00:00.000Z');
  assert.equal(agenda.store[0].remindBefore, 15, 'lembrete padrão de 15 min');

  const undone = await runAgenda(user, 'desfazer', agenda);
  assert.match(undone.reply, /Desfeito/);
  assert.equal(agenda.store[0].status, 'CANCELED');
});

test('título sai limpo, sem o verbo do pedido', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'me lembra de ligar pra minha mãe amanhã às 19h', agenda);
  await runAgenda(user, 'marca dentista sexta às 15h', agenda);
  assert.deepEqual(agenda.store.map((a) => a.title), ['Ligar pra minha mãe', 'Dentista']);
});

test('horário sem dia vale para hoje (ou amanhã, se já passou)', async () => {
  const agenda = fakeAgenda();
  const later = await runAgenda(user, 'me lembra de tomar remédio às 22h', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-04T01:00:00.000Z'); // 22h de hoje
  assert.match(later.reply, /considerei hoje/);
  await runAgenda(user, 'ligar pro banco às 8h', agenda);
  assert.equal(agenda.store[1].startsAt.toISOString(), '2026-10-04T11:00:00.000Z'); // 8h já passou → amanhã
});

test('listar e cancelar pela agenda', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  assert.match((await runAgenda(user, 'quais são meus compromissos', agenda)).reply, /Reunião/);

  // Cancelar é destrutivo: a primeira frase só confirma, não apaga.
  const previa = await runAgenda(user, 'cancelar reunião', agenda);
  assert.equal(previewsConfirmation(previa), true);
  assert.equal(agenda.store[0].status, 'PENDING');

  const feito = await runAgenda(user, 'confirmar', agenda);
  assert.match(feito.reply, /cancelei|removido|cancelado/i);
  assert.equal(agenda.store[0].status, 'CANCELED');

  await runAgenda(user, 'desfazer', agenda);
  assert.equal(agenda.store[0].status, 'PENDING');
});

test('agenda pede data quando a frase não tem quando, com sugestões', async () => {
  const r = await runAgenda(user, 'agendar reunião com João', fakeAgenda());
  assert.match(r.reply, /para qual dia|quando vai ser/i);
  assert.ok(r.suggestions?.includes('amanhã'));
});

test('rascunho incompleto não engole um comando novo', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião com o time', agenda);
  await runAgenda(user, 'marca academia amanhã às 7h', agenda);
  assert.deepEqual(agenda.store.map((a) => a.title), ['Academia']);
});

test('cancelar todos: pede confirmação e só apaga depois', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  await runAgenda(user, 'agendar almoço amanhã às 12h', agenda);

  const previa = await runAgenda(user, 'cancelar todos os compromissos de amanhã', agenda);
  assert.match(previa.reply, /Vou cancelar 2 compromissos/);
  assert.equal(previa.view?.kind, 'confirmation');
  assert.equal(agenda.store.filter((a) => a.status === 'PENDING').length, 2);

  const feito = await runAgenda(user, 'confirmar', agenda);
  assert.match(feito.reply, /cancelei 2 compromissos/i);
  assert.equal(agenda.store.filter((a) => a.status === 'CANCELED').length, 2);
});

test('a confirmação textual conclui o cancelamento em lote', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  await runAgenda(user, 'cancelar todos os compromissos de amanhã', agenda);
  const feito = await runAgenda(user, 'sim', agenda);
  assert.match(feito.reply, /cancelei 1 compromisso/i);
});

test('cancelar todos: dia sem compromissos avisa e não quebra', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
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
    pendingAction: null,
    updatedAt: '',
  };
  assert.equal(resolveContinuation('e amanha', memory), 'mostrar agenda amanha');
  assert.equal(resolveContinuation('cancela essa', memory), 'cancelar Reunião de projeto');
  assert.equal(resolveContinuation('e amanha', { ...memory, lastIntent: null }), null);
});

test('agenda responde com painel agrupado por dia, não com texto solto', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  const r = await runAgenda(user, 'o que tenho essa semana', agenda);
  assert.equal(r.view?.kind, 'agenda');
  const days = (r.view as { days: { label: string; items: { title: string; time: string }[] }[] }).days;
  assert.equal(days[0].label, 'amanhã');
  assert.deepEqual(days[0].items.map((i) => [i.time, i.title]), [['14h', 'Reunião']]);
});

test('perguntas: próximo compromisso, quando é e horário livre', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar dentista amanhã às 15h', agenda);
  await runAgenda(user, 'agendar reunião amanhã das 9h às 11h', agenda);

  assert.match((await runAgenda(user, 'qual meu próximo compromisso?', agenda)).reply, /próximo compromisso é Reunião/);
  assert.match((await runAgenda(user, 'quando é o dentista?', agenda)).reply, /Dentista é amanhã, às 15h/);
  const free = await runAgenda(user, 'tô livre amanhã de manhã?', agenda);
  assert.match(free.reply, /Reunião das 9h às 11h/);
  assert.match(free.reply, /livre das 6h às 9h e das 11h às 12h/);
});

test('agendar em horário ocupado avisa o conflito, sugere horário e só grava com "sim"', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  const conflito = await runAgenda(user, 'agendar call amanhã às 14h', agenda);

  assert.match(conflito.reply, /já tem Reunião às 14h/);
  assert.equal(conflito.view?.kind, 'confirmation');
  assert.ok(conflito.suggestions?.some((s) => /call amanhã às 1[35]h/i.test(s)));
  assert.equal(agenda.store.length, 1);
  await runAgenda(user, 'sim, marca mesmo assim', agenda);
  assert.equal(agenda.store.length, 2);
});

test('com dois candidatos parecidos, pergunta qual antes de cancelar', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar revisão amanhã às 9h', agenda);
  await runAgenda(user, 'agendar revisão amanhã às 15h', agenda);

  const r = await runAgenda(user, 'cancelar revisão', agenda);
  assert.equal(agenda.store.filter((a) => a.status === 'PENDING').length, 2);
  assert.ok(['confirmation', 'actions'].includes(r.view?.kind ?? ''));
});

test('remarcar acontece na hora e "desfazer" volta ao horário anterior', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  const original = agenda.store[0].startsAt.toISOString();

  const moved = await runAgenda(user, 'mudar reunião para sexta às 15h', agenda);
  assert.equal(moved.view?.kind, 'event');
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T18:00:00.000Z');

  await runAgenda(user, 'desfazer', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), original);
});

test('remarcar só o dia mantém o horário; só a hora mantém o dia; adiar soma', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  await runAgenda(user, 'passa a reunião pra sexta', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T17:00:00.000Z');
  await runAgenda(user, 'muda a reunião pras 16h', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T19:00:00.000Z');
  await runAgenda(user, 'adia a reunião em 30 minutos', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T19:30:00.000Z');
});

test('remarcar sem dizer quando pergunta e completa no turno seguinte', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião amanhã às 14h', agenda);
  const ask = await runAgenda(user, 'mudar reunião', agenda);
  assert.match(ask.reply, /para quando/i);
  await runAgenda(user, 'sexta', agenda);
  assert.equal(agenda.store[0].startsAt.toISOString(), '2026-10-09T17:00:00.000Z');
});

test('concluir e lembrete pelo chat', async () => {
  const agenda = fakeAgenda();
  await runAgenda(user, 'agendar reunião com Ana amanhã às 14h', agenda);
  await runAgenda(user, 'me lembra da reunião 1 hora antes', agenda);
  assert.equal(agenda.store[0].remindBefore, 60);
  await runAgenda(user, 'concluí a reunião com Ana', agenda);
  assert.equal(agenda.store[0].status, 'DONE');
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