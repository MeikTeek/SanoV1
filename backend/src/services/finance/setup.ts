import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { parseDate } from './budget';

type Tx = Prisma.TransactionClient;

const DEFAULT_GROUPS: { name: string; isIncome: boolean; categories: string[] }[] = [
  { name: 'Essenciais', isIncome: false, categories: ['Moradia', 'Contas da casa', 'Mercado', 'Transporte', 'Saúde'] },
  { name: 'Estilo de vida', isIncome: false, categories: ['Restaurantes', 'Lazer', 'Assinaturas', 'Compras', 'Educação'] },
  { name: 'Metas', isIncome: false, categories: ['Reserva de emergência', 'Investimentos'] },
  { name: 'Receitas', isIncome: true, categories: ['Salário', 'Outras receitas', 'Saldo inicial'] },
];

/** Formato do módulo antigo, gravado inteiro num JSON em ToolData. */
interface LegacyLedger {
  accounts?: { id: string; name: string; balance: number; createdAt?: string }[];
  transactions?: { id: string; accountId: string; description: string; amount: number; date: string; category: string; createdAt?: string }[];
  categories?: string[];
  budgets?: { month: string; category: string; amount?: number; allocated?: number; carryover?: boolean }[];
}

const LEGACY_TOOL = 'finance';
const LEGACY_KEY = 'ledger';
const cents = (value: number) => Math.round((Number(value) || 0) * 100);

async function seedDefaults(db: Tx, userId: string) {
  for (const [groupIndex, group] of DEFAULT_GROUPS.entries()) {
    await db.financeCategoryGroup.create({
      data: {
        userId, name: group.name, isIncome: group.isIncome, sortOrder: groupIndex,
        categories: {
          create: group.categories.map((name, sortOrder) => ({ userId, name, sortOrder })),
        },
      },
    });
  }
}

/**
 * Converte o ledger antigo para as tabelas novas.
 *
 * - categoria só com entradas → vira categoria de receita; o resto, despesa;
 * - o saldo da conta antiga embutia o valor inicial: a diferença entre o saldo
 *   e a soma das transações vira uma transação "Saldo inicial";
 * - pares "Transferência" (mesmo dia, valores opostos, contas diferentes) são
 *   religados como transferência de verdade.
 *
 * O JSON original fica guardado com outra chave, como backup.
 */
async function migrateLegacy(db: Tx, userId: string, ledger: LegacyLedger) {
  const accounts = ledger.accounts ?? [];
  const transactions = (ledger.transactions ?? []).filter((t) => accounts.some((a) => a.id === t.accountId));
  const names = new Set<string>([...(ledger.categories ?? []), ...transactions.map((t) => t.category)]);
  names.delete('Transferência');

  const incomeNames = [...names].filter((name) => {
    const rows = transactions.filter((t) => t.category === name);
    return rows.length > 0 && rows.every((t) => t.amount > 0);
  });
  const expenseNames = [...names].filter((name) => !incomeNames.includes(name));
  if (!incomeNames.includes('Saldo inicial')) incomeNames.push('Saldo inicial');

  const categoryId = new Map<string, string>();
  const createGroup = async (name: string, isIncome: boolean, sortOrder: number, list: string[]) => {
    const group = await db.financeCategoryGroup.create({ data: { userId, name, isIncome, sortOrder } });
    for (const [index, category] of list.entries()) {
      const created = await db.financeCategory.create({ data: { userId, groupId: group.id, name: category.slice(0, 100), sortOrder: index } });
      categoryId.set(category, created.id);
    }
  };
  await createGroup('Despesas', false, 0, expenseNames);
  await createGroup('Receitas', true, 1, incomeNames);

  const payeeId = new Map<string, string>();
  const payee = async (name: string) => {
    const key = name.trim().slice(0, 200) || 'Sem descrição';
    const lower = key.toLocaleLowerCase('pt-BR');
    if (!payeeId.has(lower)) payeeId.set(lower, (await db.financePayee.create({ data: { userId, name: key } })).id);
    return payeeId.get(lower)!;
  };

  const accountId = new Map<string, string>();
  for (const [index, account] of accounts.entries()) {
    const created = await db.financeAccount.create({ data: { userId, name: account.name.slice(0, 100), sortOrder: index } });
    accountId.set(account.id, created.id);
    const own = transactions.filter((t) => t.accountId === account.id);
    const opening = cents(account.balance) - own.reduce((sum, t) => sum + cents(t.amount), 0);
    if (opening !== 0) {
      const first = own.map((t) => t.date).sort()[0];
      const date = parseDate(first ?? '') ?? (account.createdAt ?? new Date().toISOString()).slice(0, 10);
      await db.financeTransaction.create({
        data: {
          userId, accountId: created.id, date, amount: opening, cleared: true,
          payeeId: await payee('Saldo inicial'), categoryId: categoryId.get('Saldo inicial'),
        },
      });
    }
  }

  const transfers = transactions.filter((t) => t.category === 'Transferência');
  const paired = new Set<string>();
  const newId = new Map<string, string>();
  for (const t of transactions) {
    const isTransfer = t.category === 'Transferência';
    const created = await db.financeTransaction.create({
      data: {
        userId,
        accountId: accountId.get(t.accountId)!,
        date: parseDate(t.date) ?? new Date().toISOString().slice(0, 10),
        amount: cents(t.amount),
        payeeId: isTransfer ? null : await payee(t.description),
        categoryId: isTransfer ? null : categoryId.get(t.category) ?? null,
        notes: isTransfer ? t.description.slice(0, 500) : null,
        cleared: true,
      },
    });
    newId.set(t.id, created.id);
  }
  for (const out of transfers.filter((t) => t.amount < 0)) {
    const match = transfers.find((t) => !paired.has(t.id) && t.id !== out.id && t.accountId !== out.accountId
      && t.date === out.date && cents(t.amount) === -cents(out.amount));
    if (!match || paired.has(out.id)) continue;
    paired.add(out.id).add(match.id);
    await db.financeTransaction.update({ where: { id: newId.get(out.id)! }, data: { transferId: newId.get(match.id)! } });
    await db.financeTransaction.update({ where: { id: newId.get(match.id)! }, data: { transferId: newId.get(out.id)! } });
  }

  for (const budget of ledger.budgets ?? []) {
    const id = categoryId.get(budget.category);
    if (!id || incomeNames.includes(budget.category) || !/^\d{4}-\d{2}$/.test(budget.month)) continue;
    await db.financeBudget.upsert({
      where: { categoryId_month: { categoryId: id, month: budget.month } },
      create: { userId, categoryId: id, month: budget.month, budgeted: cents(budget.allocated ?? budget.amount ?? 0), carryover: budget.carryover === true },
      update: {},
    });
  }

  await db.toolData.update({
    where: { userId_tool_key: { userId, tool: LEGACY_TOOL, key: LEGACY_KEY } },
    data: { key: `${LEGACY_KEY}-backup` },
  });
}

/**
 * Roda uma única vez por usuário. O insert em FinanceSettings (PK = userId)
 * serializa chamadas concorrentes: a segunda espera a primeira e esbarra na
 * chave única, então ninguém semeia em dobro.
 */
export async function initializeFinance(userId: string) {
  try {
    await prisma.$transaction(async (db) => {
      await db.financeSettings.create({ data: { userId } });
      const legacy = await db.toolData.findUnique({
        where: { userId_tool_key: { userId, tool: LEGACY_TOOL, key: LEGACY_KEY } },
      });
      const ledger = legacy?.data as LegacyLedger | undefined;
      if (ledger && ((ledger.accounts?.length ?? 0) > 0 || (ledger.categories?.length ?? 0) > 0)) {
        await migrateLegacy(db, userId, ledger);
      } else {
        await seedDefaults(db, userId);
      }
    }, { timeout: 60_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }
}
