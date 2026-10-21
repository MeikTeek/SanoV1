import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategoryQuestion, parseFinanceEntry } from '../../backend/src/services/sano/intents/finance';
import { advanceDate } from '../../backend/src/services/finance/schedules';
import { matchIntent } from '../../backend/src/services/sano/router';
import { normalize } from '../../backend/src/services/sano/normalize';

test('lê gasto com vírgula decimal e preposição', () => {
  assert.deepEqual(parseFinanceEntry('gastei 45,90 no mercado'), { amount: -4_590, description: 'mercado', accountHint: undefined });
});

test('lê conta citada com "pelo"', () => {
  assert.deepEqual(parseFinanceEntry('Paguei R$ 120 de luz pelo Nubank'), { amount: -12_000, description: 'luz', accountHint: 'nubank' });
});

test('lê receita e milhar com ponto', () => {
  assert.deepEqual(parseFinanceEntry('recebi 6.500,00 de salário'), { amount: 650_000, description: 'salario', accountHint: undefined });
  assert.equal(parseFinanceEntry('recebi 1.500 do freela')?.amount, 150_000);
  assert.equal(parseFinanceEntry('gastei 12.50 com uber')?.amount, -1_250);
});

test('frase sem valor não é lançamento', () => {
  assert.equal(parseFinanceEntry('gastei demais esse mês'), null);
  assert.equal(parseFinanceEntry('quanto sobrou de lazer'), null);
});

test('pergunta de envelope extrai a categoria', () => {
  assert.equal(parseCategoryQuestion('quanto sobrou de lazer'), 'lazer');
  assert.equal(parseCategoryQuestion('quanto posso gastar com restaurantes esse mes'), 'restaurantes');
  assert.equal(parseCategoryQuestion('quanto gastei'), null);
});

test('roteador manda frases de dinheiro para finanças, não para a agenda', () => {
  for (const phrase of ['gastei 45 no mercado', 'paguei 120 de luz amanhã', 'quanto sobrou de lazer', 'resumo financeiro', 'meu orçamento']) {
    assert.equal(matchIntent(normalize(phrase))?.name, 'financas', phrase);
  }
  assert.notEqual(matchIntent(normalize('agendar dentista amanhã às 14h'))?.name, 'financas');
});

test('vencimento mensal volta ao dia original depois de mês curto', () => {
  assert.equal(advanceDate('2026-01-31', 'MONTHLY', 1, 31), '2026-02-28');
  assert.equal(advanceDate('2026-02-28', 'MONTHLY', 1, 31), '2026-03-31');
  assert.equal(advanceDate('2026-12-10', 'MONTHLY', 1, 10), '2027-01-10');
  assert.equal(advanceDate('2026-10-21', 'WEEKLY', 2, 21), '2026-11-04');
  assert.equal(advanceDate('2028-02-29', 'YEARLY', 1, 29), '2029-02-28');
  assert.equal(advanceDate('2026-10-21', 'ONCE', 1, 21), null);
});
