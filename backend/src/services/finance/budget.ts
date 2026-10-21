/**
 * Motor do orçamento por envelopes — mesma regra do Actual Budget
 * (`loot-core/src/server/budget/envelope.ts`), reescrita como função pura.
 *
 * Por categoria de despesa, em cada mês:
 *
 *   saldo = orçado + movimento + herança
 *   herança = saldo do mês anterior, se ele era positivo OU a categoria
 *             estava com "carregar saldo negativo" (carryover) ligado;
 *             senão 0 — o estouro sai do "A orçar" do mês seguinte.
 *
 * No resumo do mês:
 *
 *   disponível      = receitas do mês + "A orçar" do mês anterior
 *   estouro anterior = soma dos saldos negativos do mês anterior sem carryover
 *   A orçar         = disponível + estouro anterior − total orçado
 *
 * Tudo em centavos inteiros, então a soma nunca acumula erro de arredondamento.
 */

export interface BudgetCategoryInput {
  id: string;
  isIncome: boolean;
}

export interface BudgetEntry {
  budgeted: number;
  carryover: boolean;
}

export interface BudgetInput {
  categories: BudgetCategoryInput[];
  /** `budgets[mês][categoria]` */
  budgets: Record<string, Record<string, BudgetEntry>>;
  /** `activity[mês][categoria]` = soma das transações (centavos, com sinal). */
  activity: Record<string, Record<string, number>>;
}

export interface CategoryMonth {
  budgeted: number;
  spent: number;
  balance: number;
  carryover: boolean;
}

export interface BudgetMonth {
  month: string;
  income: number;
  fromLastMonth: number;
  lastMonthOverspent: number;
  totalBudgeted: number;
  totalSpent: number;
  totalBalance: number;
  toBudget: number;
  categories: Record<string, CategoryMonth>;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

export function computeBudgetMonth(input: BudgetInput, target: string): BudgetMonth {
  const known = [...Object.keys(input.budgets), ...Object.keys(input.activity)].filter((m) => m <= target);
  const first = known.length ? known.reduce((a, b) => (a < b ? a : b)) : target;
  const expense = input.categories.filter((c) => !c.isIncome);
  const income = input.categories.filter((c) => c.isIncome);

  let previous: BudgetMonth | null = null;
  for (const month of monthRange(first, target)) {
    const budgets = input.budgets[month] ?? {};
    const activity = input.activity[month] ?? {};
    const categories: Record<string, CategoryMonth> = {};
    let totalBudgeted = 0;
    let totalSpent = 0;
    let totalBalance = 0;
    let lastMonthOverspent = 0;

    for (const category of expense) {
      const entry = budgets[category.id];
      const budgeted = entry?.budgeted ?? 0;
      const spent = activity[category.id] ?? 0;
      const prev = previous?.categories[category.id];
      const inherited = prev ? (prev.carryover || prev.balance > 0 ? prev.balance : 0) : 0;
      if (prev && !prev.carryover && prev.balance < 0) lastMonthOverspent += prev.balance;
      const balance = budgeted + spent + inherited;
      categories[category.id] = { budgeted, spent, balance, carryover: entry?.carryover ?? false };
      totalBudgeted += budgeted;
      totalSpent += spent;
      totalBalance += balance;
    }

    let monthIncome = 0;
    for (const category of income) {
      const received = activity[category.id] ?? 0;
      monthIncome += received;
      categories[category.id] = { budgeted: 0, spent: received, balance: received, carryover: false };
    }

    const fromLastMonth: number = previous?.toBudget ?? 0;
    previous = {
      month,
      income: monthIncome,
      fromLastMonth,
      lastMonthOverspent,
      totalBudgeted,
      totalSpent,
      totalBalance,
      toBudget: monthIncome + fromLastMonth + lastMonthOverspent - totalBudgeted,
      categories,
    };
  }

  return previous!;
}

/** "1.234,56", "-12.50", "R$ 10" → centavos. null quando não é número. */
export function parseMoney(raw: string): number | null {
  let text = raw.replace(/[R$\s ]/g, '');
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-') || text.endsWith('-');
  text = text.replace(/[()+-]/g, '');
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) text = text.replace(/,/g, '');
  else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return negative ? -cents : cents;
}

/** "31/12/2026", "2026-12-31", "31-12-26" → "2026-12-31". null quando inválida. */
export function parseDate(raw: string): string | null {
  const text = raw.trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 100) year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
