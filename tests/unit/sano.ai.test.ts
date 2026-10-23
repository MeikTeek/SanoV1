import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand } from '../../backend/src/services/sano/router';
import { parseAiAnswer } from '../../backend/src/services/sano/ai.service';
import { clearAssistantMemoryForTests } from '../../backend/src/services/sano/context.service';
import type { SanoAiDeps, SanoUser } from '../../backend/src/services/sano/types';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  clearAssistantMemoryForTests();
});

const user: SanoUser = { id: 'ai-1', username: 'ana', role: 'USER', lastLoginAt: null };
const now = new Date('2026-10-03T17:30:00Z');
const withAi = (ai: SanoAiDeps) => (text: string) => handleCommand(user, text, { pingDb: async () => 7, ai }, now);

test('parseAiAnswer lê JSON, JSON cercado de texto e texto puro', () => {
  assert.deepEqual(parseAiAnswer('{"command": "que horas são"}'), { command: 'que horas são' });
  assert.deepEqual(parseAiAnswer('```json\n{"reply":"Olá, senhor."}\n```'), { reply: 'Olá, senhor.' });
  assert.deepEqual(parseAiAnswer('**Claro!** Posso ajudar.'), { reply: 'Claro! Posso ajudar.' });
  assert.equal(parseAiAnswer('   '), null);
});

test('frase que as regras entendem não chama a IA', async () => {
  let calls = 0;
  const r = await withAi(async () => { calls++; return { ok: true, reply: 'x' }; })('que horas são?');
  assert.equal(r.intent, 'time');
  assert.equal(calls, 0);
});

test('IA reescreve como comando e o motor determinístico executa', async () => {
  const r = await withAi(async () => ({ ok: true, command: 'que horas são' }))('me diz o horário aí, parceiro');
  assert.equal(r.intent, 'time');
});

test('IA conversa quando não é comando', async () => {
  const r = await withAi(async ({ catalog }) => {
    assert.ok(catalog.some((c) => c.name === 'musica'));
    return { ok: true, reply: 'A capital da Austrália é Camberra.' };
  })('qual a capital da austrália');
  assert.equal(r.intent, 'ai');
  assert.match(r.reply, /Camberra/);
});

test('comando de música volta ao navegador como ação', async () => {
  const r = await withAi(async () => ({ ok: true, command: 'tocar favoritas' }))('frase estranha qualquer');
  assert.deepEqual(r.actions, [{ type: 'run', command: 'tocar favoritas' }]);
});

test('tradução que ainda não casa não entra em laço', async () => {
  let calls = 0;
  const r = await withAi(async () => { calls++; return { ok: true, command: 'blablabla xyz' }; })('frase estranha qualquer');
  assert.equal(calls, 1);
  assert.equal(r.intent, 'unknown');
});

test('cota esgotada avisa e mantém os atalhos', async () => {
  const r = await withAi(async () => ({ ok: false, reason: 'quota' }))('frase estranha qualquer');
  assert.equal(r.intent, 'unknown');
  assert.match(r.reply, /cota/);
  assert.equal(r.view?.kind, 'actions');
});

test('sem chave (null) é o Sano de sempre', async () => {
  const r = await withAi(async () => null)('frase estranha qualquer');
  assert.equal(r.intent, 'unknown');
  assert.doesNotMatch(r.reply, /IA/);
});

test('casamento fraco vai à IA, mas a regra fica de reserva', async () => {
  const fuzzy = 'qual a capital da australia'; // as regras acham "agenda" com nota baixa
  assert.equal((await withAi(async () => ({ ok: true, reply: 'Camberra.' }))(fuzzy)).intent, 'ai');
  assert.equal((await withAi(async () => ({ ok: false, reason: 'unavailable' }))(fuzzy)).intent, 'agenda');
});
