import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTerm, understandAgenda } from '../../backend/src/services/agenda/nlu';
import { expandSeries, nextOccurrence } from '../../backend/src/services/agenda/recurrence';

// Quarta, 21/10/2026, 13:00 em São Paulo.
const NOW = new Date('2026-10-21T16:00:00Z');
const act = (t: string) => understandAgenda(t, NOW).act;

test('classifica o pedido pelo que ele quer, não só pelo verbo', () => {
  assert.equal(act('marca dentista sexta às 15h'), 'create');
  assert.equal(act('tenho consulta no cardiologista dia 30 às 9h'), 'create');
  assert.equal(act('o que tenho essa semana'), 'list');
  assert.equal(act('minha agenda'), 'list');
  assert.equal(act('tenho algo amanhã?'), 'list');
  assert.equal(act('qual meu próximo compromisso'), 'next');
  assert.equal(act('quando é o dentista?'), 'when');
  assert.equal(act('estou livre quinta à tarde?'), 'free');
  assert.equal(act('quantos compromissos tenho semana que vem'), 'count');
  assert.equal(act('adia o dentista em 1 hora'), 'shift');
  assert.equal(act('muda o dentista pra sábado'), 'reschedule');
  assert.equal(act('desmarca a call'), 'cancel');
  assert.equal(act('cancela tudo de amanhã'), 'cancel_all');
  assert.equal(act('concluí a reunião com Ana'), 'complete');
  assert.equal(act('me lembra do dentista 1 dia antes'), 'remind');
  assert.equal(act('desfazer'), 'undo');
});

test('adiar/antecipar viram minutos com sinal', () => {
  assert.equal(understandAgenda('adia o dentista em 1 hora', NOW).shiftMinutes, 60);
  assert.equal(understandAgenda('antecipa a reunião meia hora', NOW).shiftMinutes, -30);
  assert.equal(understandAgenda('empurra a call 2 dias', NOW).shiftMinutes, 2880);
});

test('termo de busca sem verbo, artigo, data nem hora', () => {
  assert.equal(extractTerm('muda o dentista pra sábado', NOW), 'dentista');
  assert.equal(extractTerm('passa a reunião pras 16h', NOW), 'reuniao');
  assert.equal(extractTerm('quando é a consulta da Bia?', NOW), 'consulta bia');
});

test('recorrência, dia inteiro, local e lembrete', () => {
  const weekly = understandAgenda('academia toda segunda às 7h', NOW);
  assert.equal(weekly.recurrence, 'WEEKLY');
  assert.equal(weekly.schedule?.title, 'Academia');
  assert.equal(weekly.schedule?.startsAt.toISOString(), '2026-10-26T10:00:00.000Z');
  assert.equal(understandAgenda('pagar aluguel todo dia 5 às 9h', NOW).recurrence, 'MONTHLY');
  assert.equal(understandAgenda('standup dias úteis às 9h30', NOW).recurrence, 'WEEKDAYS');
  assert.equal(understandAgenda('aniversário da Bia dia 15/11 o dia todo', NOW).allDay, true);
  assert.equal(understandAgenda('reunião amanhã às 10h local: Sala 3', NOW).location, 'Sala 3');
  assert.equal(understandAgenda('treino amanhã às 18h sem lembrete', NOW).remindMinutes, null);
  assert.equal(understandAgenda('prova sexta às 8h me avisa 1 dia antes', NOW).remindMinutes, 1440);
});

test('intervalos: semana, fim de semana e período do dia', () => {
  const week = understandAgenda('o que tenho essa semana', NOW).range!;
  assert.equal(week.label, 'essa semana');
  assert.equal(week.end.toISOString(), '2026-10-26T03:00:00.000Z'); // até domingo 24h
  const afternoon = understandAgenda('tô livre amanhã à tarde?', NOW).range!;
  assert.equal(afternoon.start.toISOString(), '2026-10-22T15:00:00.000Z'); // 12h
  assert.equal(afternoon.end.toISOString(), '2026-10-22T21:00:00.000Z'); // 18h
});

test('recorrência mantém o horário local e o dia do mês', () => {
  const first = new Date('2026-01-31T12:00:00Z'); // 31/01 09:00
  assert.equal(nextOccurrence(first, 'MONTHLY', 31).toISOString(), '2026-02-28T12:00:00.000Z');
  const friday = new Date('2026-10-23T12:00:00Z');
  assert.equal(nextOccurrence(friday, 'WEEKDAYS', 23).toISOString(), '2026-10-26T12:00:00.000Z');
  const weeks = expandSeries(new Date('2026-10-26T10:00:00Z'), 'WEEKLY', new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(weeks.map((d) => d.toISOString().slice(0, 10)), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
});
