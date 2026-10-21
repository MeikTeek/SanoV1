import { prisma } from '../../config/prisma';
import type { SanoFinanceDeps } from '../sano/types';
import { getOverview, createTransaction } from './service';
import { listSchedules, runAutoPost, todayInBrazil } from './schedules';

/** Ponte entre o chat do Sano e o módulo de finanças. */

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Casa por igualdade, depois por "contém" nos dois sentidos, depois por radical (4 letras). */
function bestMatch<T extends { name: string }>(items: T[], term: string): T | undefined {
  const needle = fold(term);
  if (!needle) return undefined;
  return items.find((i) => fold(i.name) === needle)
    ?? items.find((i) => fold(i.name).includes(needle) || needle.includes(fold(i.name)))
    ?? items.find((i) => needle.split(' ').some((w) => w.length >= 4 && fold(i.name).split(' ').some((n) => n.slice(0, 4) === w.slice(0, 4))));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const financeChat: SanoFinanceDeps = {
  async summary(userId) {
    await runAutoPost(userId);
    const today = todayInBrazil();
    const [overview, schedules] = await Promise.all([getOverview(userId, today.slice(0, 7)), listSchedules(userId)]);
    const expense = overview.groups.filter((g) => !g.isIncome).flatMap((g) => g.categories);
    const categories = expense.map((c) => {
      const v = overview.budget.categories[c.id];
      return { name: c.name, budgeted: v?.budgeted ?? 0, spent: -(v?.spent ?? 0), balance: v?.balance ?? 0 };
    }).sort((a, b) => a.balance - b.balance);
    return {
      hasAccounts: overview.accounts.length > 0,
      toBudget: overview.budget.toBudget,
      income: overview.budget.income,
      spent: -overview.budget.totalSpent,
      budgeted: overview.budget.totalBudgeted,
      categories,
      upcoming: schedules.filter((s) => s.active).slice(0, 3).map((s) => ({ name: s.name, amount: s.amount, nextDate: s.nextDate })),
    };
  },

  async record(userId, entry) {
    const today = todayInBrazil();
    const overview = await getOverview(userId, today.slice(0, 7));
    const open = overview.accounts.filter((a) => !a.closed);
    if (!open.length) return { ok: false, message: 'Cadastre uma conta em Finanças antes de lançar pelo chat.' };

    let account = entry.accountHint ? bestMatch(open, entry.accountHint) : undefined;
    if (entry.accountHint && !account) {
      return { ok: false, message: `Não achei a conta "${entry.accountHint}". Contas: ${open.map((a) => a.name).join(', ')}.` };
    }
    // Sem conta citada: a primeira conta corrente do orçamento (ordem da barra lateral).
    account ??= open.find((a) => !a.offBudget && a.type === 'CHECKING') ?? open.find((a) => !a.offBudget) ?? open[0];

    const isIncome = entry.amount > 0;
    const pool = overview.groups.filter((g) => g.isIncome === isIncome).flatMap((g) => g.categories).filter((c) => !c.hidden);
    const payee = await prisma.financePayee.findFirst({
      where: { userId, name: { equals: entry.description, mode: 'insensitive' } },
    });
    // Receita sem categoria não entra no "A orçar": na falta de nome melhor,
    // cai em "Outras receitas" (ou na primeira receita que não seja saldo inicial).
    const incomeFallback = isIncome
      ? pool.find((c) => fold(c.name) === 'outras receitas') ?? pool.find((c) => fold(c.name) !== 'saldo inicial')
      : undefined;
    const category = account.offBudget
      ? undefined
      : bestMatch(pool, entry.description) ?? pool.find((c) => c.id === payee?.lastCategoryId) ?? incomeFallback;

    await createTransaction(userId, {
      accountId: account.id,
      date: today,
      amount: entry.amount,
      payee: payee?.name ?? capitalize(entry.description),
      categoryId: category?.id ?? null,
      notes: 'Lançado pelo chat',
    });

    let categoryBalance: number | undefined;
    if (category && !isIncome) {
      const after = await getOverview(userId, today.slice(0, 7));
      categoryBalance = after.budget.categories[category.id]?.balance;
    }
    return {
      ok: true,
      accountName: account.name,
      payee: payee?.name ?? capitalize(entry.description),
      categoryName: category?.name ?? null,
      categoryBalance,
    };
  },
};
