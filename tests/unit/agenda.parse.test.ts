import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule } from '../../backend/src/services/agenda/parse';

// Quarta-feira, 03/10/2026, 10:00 local (America/Sao_Paulo = UTC-3).
const NOW = new Date('2026-10-03T13:00:00Z');

// O parser recebe o texto ORIGINAL; ele mesmo faz o "fold" interno.
const parse = (t: string) => parseSchedule(t, NOW);

// 14h em São Paulo = 17:00Z.
const iso = (d?: Date) => (d ? d.toISOString() : undefined);

test('frase completa: título, participantes, data e hora', () => {
  const r = parse('agendar reunião com João amanhã às 14h');
  assert.equal(r.action, 'create');
  assert.equal(r.title, 'Reunião');
  assert.equal(r.participants, 'João');
  assert.equal(iso(r.startsAt), '2026-10-04T17:00:00.000Z');
  assert.equal(r.missing, undefined);
});

test('múltiplos participantes', () => {
  assert.equal(parse('agendar almoço com João e Maria sexta as 12h').participants, 'João e Maria');
});

test('datas relativas e por extenso', () => {
  assert.match(iso(parse('reunião hoje as 16h').startsAt)!, /2026-10-03T19:00/);
  assert.match(iso(parse('reunião depois de amanhã as 9h').startsAt)!, /2026-10-05T12:00/);
  assert.match(iso(parse('call com equipe sexta as 10h').startsAt)!, /2026-10-09T13:00/); // sexta desta semana
  assert.match(iso(parse('dentista 15/10 as 8h').startsAt)!, /2026-10-15T11:00/);
});

test('datas relativas preservam a hora atual', () => {
  // "em 10 minutos" = agora + 10min, e NÃO o padrão 09:00.
  const r = parse('ligar para o banco daqui a 10 minutos');
  assert.equal(r.startsAt.getTime(), NOW.getTime() + 10 * 60_000);
  // 13:00Z + 2h = 15:00Z.
  assert.match(iso(parse('dentista daqui a 2 horas').startsAt)!, /2026-10-03T15:00/);
});

test('hora: formatos numéricos, falados e pedido do horário que falta', () => {
  assert.match(iso(parse('reuniao amanha as 9:30').startsAt)!, /2026-10-04T12:30/);
  assert.match(iso(parse('reuniao amanha as 14h30').startsAt)!, /2026-10-04T17:30/);
  assert.match(iso(parse('reuniao amanha as 14').startsAt)!, /2026-10-04T17:00/);
  assert.match(iso(parse('reuniao amanha 10 e meia').startsAt)!, /2026-10-04T13:30/);
  assert.match(iso(parse('reuniao amanha duas da tarde').startsAt)!, /2026-10-04T17:00/);
  assert.match(iso(parse('reuniao amanha oito da noite').startsAt)!, /2026-10-04T23:00/);
  assert.match(iso(parse('reuniao amanha meio-dia').startsAt)!, /2026-10-04T15:00/);
  assert.equal(parse('reuniao amanha').missing, 'time');
});

test('datas e horários relativos usam o calendário de São Paulo', () => {
  const tomorrowAtTwo = parse('reuniao amanha as 14h');
  const tomorrowAtTwoSpelled = parse('reuniao amanha duas da tarde');
  assert.equal(iso(tomorrowAtTwo.startsAt), iso(tomorrowAtTwoSpelled.startsAt));
  assert.equal(iso(parse('reuniao dia 15 as 9:30').startsAt), '2026-10-15T12:30:00.000Z');
  assert.equal(iso(parse('reuniao 15/03 as 10h').startsAt), '2027-03-15T13:00:00.000Z');
  assert.equal(iso(parse('reuniao daqui a 3 dias as 10h').startsAt), '2026-10-06T13:00:00.000Z');
  assert.equal(iso(parse('reuniao semana que vem as 10h').startsAt), '2026-10-05T13:00:00.000Z');
  assert.equal(iso(parse('reuniao proxima segunda as 10h').startsAt), '2026-10-05T13:00:00.000Z');
  assert.equal(iso(parse('reuniao amnh as 14h').startsAt), '2026-10-04T17:00:00.000Z');
  assert.equal(iso(parse('reuniao hj as 14h').startsAt), '2026-10-03T17:00:00.000Z');
});

test('intervalo das 14h às 15h30', () => {
  const r = parse('agendar revisão do projeto amanhã das 14h às 15h30');
  assert.equal(iso(r.startsAt), '2026-10-04T17:00:00.000Z');
  assert.equal(iso(r.endsAt), '2026-10-04T18:30:00.000Z');
  // Só a primeira letra é capitalizada: o resto segue o que o usuário digitou.
  assert.equal(r.title, 'Revisão do projeto');
});

test('lembrete em minutos, horas e "quando"', () => {
  assert.equal(parse('reuniao amanha as 14h me lembre 15 minutos antes').remindBeforeMinutes, 15);
  assert.equal(parse('reuniao amanha as 14h me lembre 1 hora antes').remindBeforeMinutes, 60);
  assert.equal(parse('ligar para o medico amanha as 10h me lembre quando').remindBeforeMinutes, 0);
  assert.equal(parse('reuniao amanha as 14h').remindBeforeMinutes, undefined);
});

test('cancelar em lote recognize "todos" e exige confirmação', () => {
  const r = parse('cancelar todos os compromissos de amanhã');
  assert.equal(r.action, 'cancel_all');
  assert.equal(r.missing, undefined);
  assert.equal(iso(r.dayStart), '2026-10-04T03:00:00.000Z'); // 00:00 em SP
  assert.equal(iso(r.dayEnd), '2026-10-05T03:00:00.000Z'); // 24:00 do mesmo dia
  assert.equal(r.confirmed, false);

  assert.equal(parse('cancele tudo de hoje').action, 'cancel_all');
  assert.equal(parse('apagar todos os compromissos de 15/10').action, 'cancel_all');
  assert.equal(parse('cancelar todos os compromissos de amanhã pode cancelar').confirmed, true);
});

test('cancelar em lote sem data pede o dia', () => {
  const r = parse('cancelar todos os meus compromissos');
  assert.equal(r.action, 'cancel_all');
  assert.equal(r.missing, 'date');
});

test('cancelar um continua sendo individual', () => {
  assert.equal(parse('cancelar reunião de amanhã').action, 'cancel');
});

test('ações de listar e cancelar', () => {
  assert.equal(parse('quais são meus compromissos').action, 'list');
  assert.equal(parse('ver minha agenda').action, 'list');
  assert.equal(parse('cancelar reunião de amanhã').action, 'cancel');
});

test('cancelar extrai o termo de busca', () => {
  assert.equal(parse('cancelar reunião').title, 'Reunião');
  assert.equal(parse('cancelar reunião com João').title, 'Reunião');
  assert.equal(parse('apagar revisão do projeto').title, 'Revisão do projeto');
});

test('recusa quando falta data ou título', () => {
  assert.equal(parse('agendar reunião com João').missing, 'date');
  assert.equal(parse('agendar amanhã as 14h').missing, 'title');
});