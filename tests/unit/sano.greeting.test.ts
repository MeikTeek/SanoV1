import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGreeting } from '../../backend/src/services/sano/greeting';
import type { SanoAppointment } from '../../backend/src/services/sano/types';

// Horários em UTC; São Paulo é UTC-3.
const MANHA = new Date('2026-10-03T11:00:00Z'); // 08h SP
const TARDE = new Date('2026-10-03T19:00:00Z'); // 16h SP
const NOITE = new Date('2026-10-04T01:00:00Z'); // 22h SP

const appt = (title: string, iso: string, participants: string | null = null) =>
  ({ title, participants, startsAt: new Date(iso) } as SanoAppointment);

test('varia o período conforme o horário do dia', () => {
  assert.match(buildGreeting('Meik', [], MANHA), /^Bom dia, Meik\./);
  assert.match(buildGreeting('Meik', [], TARDE), /^Boa tarde, Meik\./);
  assert.match(buildGreeting('Meik', [], NOITE), /^Boa noite, Meik\./);
});

test('pergunta como está e o que pode fazer', () => {
  const r = buildGreeting('Meik', [], MANHA);
  assert.match(r, /Como você está\?/);
  assert.match(r, /Em que posso ser útil\?/);
});

test('sem compromissos informa agenda livre', () => {
  assert.match(buildGreeting('Meik', [], MANHA), /Agenda livre/);
});

test('lista os compromissos de hoje com o horário', () => {
  const hoje = [appt('Reunião', '2026-10-03T17:00:00Z', 'João'), appt('Almoço', '2026-10-03T22:00:00Z')];
  const r = buildGreeting('Meik', hoje, MANHA);
  assert.match(r, /2 compromissos/);
  assert.match(r, /14:00 — Reunião \(com João\)/);
  assert.match(r, /19:00 — Almoço/);
});

test('acerta o singular e limita a 4 itens', () => {
  assert.match(buildGreeting('Meik', [appt('Café', '2026-10-03T17:00:00Z')], MANHA), /1 compromisso:/);

  const muitos = Array.from({ length: 6 }, (_, i) => appt(`Item ${i}`, '2026-10-03T17:00:00Z'));
  const r = buildGreeting('Meik', muitos, MANHA);
  assert.match(r, /6 compromissos/);
  assert.match(r, /e mais 2/);
});