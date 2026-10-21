import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBudgetMonth, parseDate, parseMoney, shiftMonth, type BudgetInput } from '../../backend/src/services/finance/budget';

const categories = [
  { id: 'mercado', isIncome: false },
  { id: 'lazer', isIncome: false },
  { id: 'salario', isIncome: true },
];

test('receita vira "A orçar" e o orçado sai dele', () => {
  const input: BudgetInput = {
    categories,
    budgets: { '2026-10': { mercado: { budgeted: 80_000, carryover: false } } },
    activity: { '2026-10': { salario: 500_000, mercado: -30_000 } },
  };
  const month = computeBudgetMonth(input, '2026-10');
  assert.equal(month.income, 500_000);
  assert.equal(month.totalBudgeted, 80_000);
  assert.equal(month.toBudget, 420_000);
  assert.deepEqual(month.categories.mercado, { budgeted: 80_000, spent: -30_000, balance: 50_000, carryover: false });
});

test('saldo positivo do envelope passa para o mês seguinte', () => {
  const input: BudgetInput = {
    categories,
    budgets: { '2026-09': { lazer: { budgeted: 20_000, carryover: false } } },
    activity: { '2026-09': { salario: 100_000, lazer: -5_000 } },
  };
  const month = computeBudgetMonth(input, '2026-10');
  assert.equal(month.categories.lazer.balance, 15_000);
  assert.equal(month.fromLastMonth, 80_000);
  assert.equal(month.toBudget, 80_000);
});

test('estouro sem carryover sai do "A orçar" do mês seguinte e o envelope zera', () => {
  const input: BudgetInput = {
    categories,
    budgets: { '2026-09': { mercado: { budgeted: 10_000, carryover: false } } },
    activity: { '2026-09': { salario: 100_000, mercado: -25_000 } },
  };
  const month = computeBudgetMonth(input, '2026-10');
  assert.equal(month.lastMonthOverspent, -15_000);
  assert.equal(month.categories.mercado.balance, 0);
  assert.equal(month.toBudget, 90_000 - 15_000);
});

test('estouro com carryover continua no envelope', () => {
  const input: BudgetInput = {
    categories,
    budgets: { '2026-09': { mercado: { budgeted: 10_000, carryover: true } } },
    activity: { '2026-09': { salario: 100_000, mercado: -25_000 } },
  };
  const month = computeBudgetMonth(input, '2026-10');
  assert.equal(month.lastMonthOverspent, 0);
  assert.equal(month.categories.mercado.balance, -15_000);
  assert.equal(month.toBudget, 90_000);
});

test('mês sem nenhum dado devolve tudo zerado', () => {
  const month = computeBudgetMonth({ categories, budgets: {}, activity: {} }, '2026-10');
  assert.equal(month.toBudget, 0);
  assert.equal(month.categories.mercado.balance, 0);
});

test('dados futuros não afetam o mês consultado', () => {
  const input: BudgetInput = { categories, budgets: {}, activity: { '2026-12': { salario: 100_000 } } };
  assert.equal(computeBudgetMonth(input, '2026-10').toBudget, 0);
});

test('shiftMonth atravessa a virada do ano', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

test('parseMoney entende formatos BR, US e negativos', () => {
  assert.equal(parseMoney('1.234,56'), 123_456);
  assert.equal(parseMoney('-12,50'), -1_250);
  assert.equal(parseMoney('R$ 10'), 1_000);
  assert.equal(parseMoney('1,234.56'), 123_456);
  assert.equal(parseMoney('-45.9'), -4_590);
  assert.equal(parseMoney('(30,00)'), -3_000);
  assert.equal(parseMoney('1.000'), 100_000);
  assert.equal(parseMoney('abc'), null);
});

test('parseDate entende DD/MM/AAAA e ISO e recusa datas impossíveis', () => {
  assert.equal(parseDate('31/12/2026'), '2026-12-31');
  assert.equal(parseDate('2026-01-05'), '2026-01-05');
  assert.equal(parseDate('05-01-26'), '2026-01-05');
  assert.equal(parseDate('31/02/2026'), null);
});
