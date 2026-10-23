import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand } from '../../backend/src/services/sano/router';
import { scheduleEvidence } from '../../backend/src/services/sano/agendaGate';
import { clearAssistantMemoryForTests } from '../../backend/src/services/sano/context.service';
import type { SanoUser } from '../../backend/src/services/sano/types';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  clearAssistantMemoryForTests();
});

const now = new Date('2026-10-03T17:30:00Z');
const user: SanoUser = { id: 'gate-1', username: 'teek', role: 'USER', lastLoginAt: null };
const run = (text: string, ai?: Parameters<typeof handleCommand>[2]['ai']) =>
  handleCommand(user, text, { pingDb: async () => 7, ai, agenda: { listByDay: async () => [], create: async (_id: string, d: object) => ({ id: '1', ...d }) } as never }, now);

test('evidência: pedido claro é forte; conversa que cita o dia é fraca', () => {
  assert.equal(scheduleEvidence('agendar dentista sexta às 15h', now), 'strong');
  assert.equal(scheduleEvidence('almoço com o João amanhã', now), 'strong');
  assert.equal(scheduleEvidence('o que tenho hoje', now), 'strong');
  assert.equal(scheduleEvidence('10 número 6.255. Como vocês estão hoje?', now), 'weak');
  assert.equal(scheduleEvidence('estou um pouco melancólico', now), 'none');
});

test('conversa que só cita "hoje" não abre rascunho de agenda', async () => {
  const r = await run('10 número 6.255. Como vocês estão hoje?');
  assert.equal(r.intent, 'agenda-confirm');
  assert.doesNotMatch(r.reply, /Para qual dia/);
  // E nada ficou pendente: a próxima frase não é engolida.
  assert.notEqual((await run('que horas são?')).intent, 'agenda');
});

test('rascunho aberto não engole frases de outro assunto', async () => {
  const first = await run('anotar dentista');
  assert.match(first.reply, /Para qual dia|Quando vai ser|para qual dia/i);
  const drop = await run('nenhum');
  assert.match(drop.reply, /não anotei/);
  await run('anotar dentista');
  const other = await run('isso era um teste');
  assert.match(other.reply, /não anotei/);
});

test('rascunho segue valendo quando a resposta traz dia ou hora', async () => {
  await run('anotar dentista');
  assert.match((await run('sexta')).reply, /horas|horário/i);
  assert.match(JSON.stringify(await run('15h')), /dentista/i);
});

test('com IA: desabafo que a IA reescreve como "anotar" vira pergunta, não rascunho', async () => {
  const r = await run('estou um pouco melancólico', async () => ({ ok: true, command: 'anotar estou um pouco melancólico' }));
  assert.equal(r.intent, 'agenda-confirm');
  assert.equal(r.view?.kind, 'actions');
});

test('com IA: pedido claro continua virando agenda', async () => {
  const r = await run('preciso ver o dentista na sexta', async () => ({ ok: true, command: 'agendar dentista sexta' }));
  assert.equal(r.intent, 'agenda');
});
