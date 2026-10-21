import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { computeBudgetMonth, parseDate, parseMoney, shiftMonth, type BudgetEntry, type BudgetInput } from './budget';
import { initializeFinance } from './setup';

type Tx = Prisma.TransactionClient;

export const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT', 'CASH', 'INVESTMENT', 'OTHER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface TransactionInput {
  accountId: string;
  date: string;
  amount: number;
  payee?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  cleared?: boolean;
  /** Preenchido = transferência para esta conta (cria a transação espelho). */
  transferAccountId?: string | null;
}

export interface ImportRowInput {
  line: number;
  date: string;
  amount: string;
  payee: string;
  notes?: string;
  category?: string;
  externalId?: string;
}

/* ───────────────────────── inicialização ───────────────────────── */

/**
 * Garante categorias padrão (ou a migração do ledger antigo) antes de qualquer
 * operação. Caminho rápido: uma consulta por chave primária.
 */
async function ready(userId: string) {
  const settings = await prisma.financeSettings.findUnique({ where: { userId } });
  if (!settings) await initializeFinance(userId);
}

/* ───────────────────────── posse dos registros ───────────────────────── */

async function ownAccount(db: Tx, userId: string, id: string) {
  const account = await db.financeAccount.findFirst({ where: { id, userId } });
  if (!account) throw new AppError(404, 'Conta não encontrada.');
  return account;
}

async function ownCategory(db: Tx, userId: string, id: string) {
  const category = await db.financeCategory.findFirst({ where: { id, userId }, include: { group: true } });
  if (!category) throw new AppError(404, 'Categoria não encontrada.');
  return category;
}

async function ownGroup(db: Tx, userId: string, id: string) {
  const group = await db.financeCategoryGroup.findFirst({ where: { id, userId } });
  if (!group) throw new AppError(404, 'Grupo não encontrado.');
  return group;
}

async function ownTransaction(db: Tx, userId: string, id: string) {
  const transaction = await db.financeTransaction.findFirst({ where: { id, userId } });
  if (!transaction) throw new AppError(404, 'Transação não encontrada.');
  return transaction;
}

async function nextSort(
  count: Promise<{ _max: { sortOrder: number | null } }>,
) {
  return ((await count)._max.sortOrder ?? -1) + 1;
}

async function findOrCreatePayee(db: Tx, userId: string, rawName: string | null | undefined) {
  const name = rawName?.trim();
  if (!name) return null;
  const existing = await db.financePayee.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' } },
  });
  return existing ?? db.financePayee.create({ data: { userId, name } });
}

/* ───────────────────────── visão geral ───────────────────────── */

async function loadBudgetInput(userId: string): Promise<BudgetInput> {
  const [categories, budgets, activity] = await Promise.all([
    prisma.financeCategory.findMany({ where: { userId }, select: { id: true, group: { select: { isIncome: true } } } }),
    prisma.financeBudget.findMany({ where: { userId } }),
    prisma.$queryRaw<{ categoryId: string; month: string; total: bigint }[]>`
      SELECT "categoryId", LEFT("date", 7) AS month, SUM("amount")::bigint AS total
      FROM "FinanceTransaction"
      WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
      GROUP BY 1, 2`,
  ]);

  const budgetMap: Record<string, Record<string, BudgetEntry>> = {};
  for (const budget of budgets) {
    (budgetMap[budget.month] ??= {})[budget.categoryId] = { budgeted: budget.budgeted, carryover: budget.carryover };
  }
  const activityMap: Record<string, Record<string, number>> = {};
  for (const row of activity) (activityMap[row.month] ??= {})[row.categoryId] = Number(row.total);

  return {
    categories: categories.map((category) => ({ id: category.id, isIncome: category.group.isIncome })),
    budgets: budgetMap,
    activity: activityMap,
  };
}

async function accountBalances(userId: string) {
  const [all, cleared] = await Promise.all([
    prisma.financeTransaction.groupBy({ by: ['accountId'], where: { userId }, _sum: { amount: true } }),
    prisma.financeTransaction.groupBy({ by: ['accountId'], where: { userId, cleared: true }, _sum: { amount: true } }),
  ]);
  const balance = new Map(all.map((row) => [row.accountId, row._sum.amount ?? 0]));
  const clearedBalance = new Map(cleared.map((row) => [row.accountId, row._sum.amount ?? 0]));
  return { balance, clearedBalance };
}

export async function getOverview(userId: string, month: string) {
  await ready(userId);
  const [accounts, groups, payees, input, balances, uncategorized] = await Promise.all([
    prisma.financeAccount.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.financeCategoryGroup.findMany({
      where: { userId },
      orderBy: [{ isIncome: 'asc' }, { sortOrder: 'asc' }],
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.financePayee.findMany({ where: { userId }, orderBy: { name: 'asc' }, take: 1000 }),
    loadBudgetInput(userId),
    accountBalances(userId),
    prisma.financeTransaction.count({
      where: { userId, categoryId: null, transferId: null, account: { offBudget: false } },
    }),
  ]);

  return {
    month,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      offBudget: account.offBudget,
      closed: account.closed,
      balance: balances.balance.get(account.id) ?? 0,
      clearedBalance: balances.clearedBalance.get(account.id) ?? 0,
    })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      isIncome: group.isIncome,
      hidden: group.hidden,
      categories: group.categories.map((category) => ({ id: category.id, name: category.name, hidden: category.hidden })),
    })),
    payees: payees.map((payee) => ({ id: payee.id, name: payee.name, lastCategoryId: payee.lastCategoryId })),
    budget: computeBudgetMonth(input, month),
    uncategorized,
  };
}

/* ───────────────────────── contas ───────────────────────── */

export async function createAccount(
  userId: string,
  input: { name: string; type: AccountType; offBudget: boolean; balance: number; date: string },
) {
  await ready(userId);
  return prisma.$transaction(async (db) => {
    const sortOrder = await nextSort(db.financeAccount.aggregate({ where: { userId }, _max: { sortOrder: true } }));
    const account = await db.financeAccount.create({
      data: { userId, name: input.name, type: input.type, offBudget: input.offBudget, sortOrder },
    });
    if (input.balance !== 0) {
      // Como no Actual: o saldo inicial é uma transação comum. Em conta do
      // orçamento ela entra como receita "Saldo inicial" e vira dinheiro a orçar.
      const startCategory = input.offBudget ? null : await db.financeCategory.findFirst({
        where: { userId, name: 'Saldo inicial', group: { isIncome: true } },
      });
      const payee = await findOrCreatePayee(db, userId, 'Saldo inicial');
      await db.financeTransaction.create({
        data: {
          userId, accountId: account.id, date: input.date, amount: input.balance,
          payeeId: payee?.id, categoryId: startCategory?.id ?? null, cleared: true,
        },
      });
    }
    return account;
  });
}

export async function updateAccount(
  userId: string,
  id: string,
  input: { name?: string; type?: AccountType; closed?: boolean },
) {
  const account = await ownAccount(prisma, userId, id);
  if (input.closed && !account.closed) {
    const sum = await prisma.financeTransaction.aggregate({ where: { accountId: id }, _sum: { amount: true } });
    if ((sum._sum.amount ?? 0) !== 0) {
      throw new AppError(400, 'Zere o saldo (transferindo para outra conta) antes de fechar esta conta.');
    }
  }
  return prisma.financeAccount.update({ where: { id }, data: input });
}

export async function deleteAccount(userId: string, id: string) {
  await ownAccount(prisma, userId, id);
  await prisma.$transaction(async (db) => {
    // Transferências com outras contas: o lado de lá vira uma transação comum.
    const own = await db.financeTransaction.findMany({ where: { accountId: id }, select: { id: true } });
    await db.financeTransaction.updateMany({
      where: { transferId: { in: own.map((t) => t.id) }, accountId: { not: id } },
      data: { transferId: null },
    });
    await db.financeAccount.delete({ where: { id } });
  });
}

/* ───────────────────────── categorias ───────────────────────── */

export async function createGroup(userId: string, input: { name: string; isIncome: boolean }) {
  await ready(userId);
  const sortOrder = await nextSort(prisma.financeCategoryGroup.aggregate({ where: { userId }, _max: { sortOrder: true } }));
  return prisma.financeCategoryGroup.create({ data: { userId, ...input, sortOrder } });
}

export async function updateGroup(userId: string, id: string, input: { name?: string; hidden?: boolean }) {
  await ownGroup(prisma, userId, id);
  return prisma.financeCategoryGroup.update({ where: { id }, data: input });
}

export async function deleteGroup(userId: string, id: string) {
  const group = await ownGroup(prisma, userId, id);
  const count = await prisma.financeCategory.count({ where: { groupId: id } });
  if (count > 0) throw new AppError(400, 'Mova ou apague as categorias do grupo antes de removê-lo.');
  if (group.isIncome) {
    const incomeGroups = await prisma.financeCategoryGroup.count({ where: { userId, isIncome: true } });
    if (incomeGroups <= 1) throw new AppError(400, 'É preciso manter ao menos um grupo de receitas.');
  }
  await prisma.financeCategoryGroup.delete({ where: { id } });
}

export async function createCategory(userId: string, input: { groupId: string; name: string }) {
  await ownGroup(prisma, userId, input.groupId);
  const sortOrder = await nextSort(prisma.financeCategory.aggregate({ where: { groupId: input.groupId }, _max: { sortOrder: true } }));
  return prisma.financeCategory.create({ data: { userId, ...input, sortOrder } });
}

export async function updateCategory(
  userId: string,
  id: string,
  input: { name?: string; hidden?: boolean; groupId?: string },
) {
  const category = await ownCategory(prisma, userId, id);
  if (input.groupId && input.groupId !== category.groupId) {
    const group = await ownGroup(prisma, userId, input.groupId);
    if (group.isIncome !== category.group.isIncome) {
      throw new AppError(400, 'Uma categoria não pode trocar entre receita e despesa.');
    }
  }
  return prisma.financeCategory.update({ where: { id }, data: input });
}

/** Apaga a categoria; `transferTo` move transações e orçamentos antes. */
export async function deleteCategory(userId: string, id: string, transferTo?: string) {
  const category = await ownCategory(prisma, userId, id);
  await prisma.$transaction(async (db) => {
    if (transferTo) {
      const target = await ownCategory(db, userId, transferTo);
      if (target.id === id) throw new AppError(400, 'Escolha outra categoria de destino.');
      if (target.group.isIncome !== category.group.isIncome) {
        throw new AppError(400, 'O destino precisa ser do mesmo tipo (receita ou despesa).');
      }
      await db.financeTransaction.updateMany({ where: { categoryId: id }, data: { categoryId: target.id } });
      const budgets = await db.financeBudget.findMany({ where: { categoryId: id } });
      for (const budget of budgets) {
        await db.financeBudget.upsert({
          where: { categoryId_month: { categoryId: target.id, month: budget.month } },
          create: { userId, categoryId: target.id, month: budget.month, budgeted: budget.budgeted },
          update: { budgeted: { increment: budget.budgeted } },
        });
      }
    }
    await db.financeCategory.delete({ where: { id } });
  });
}

/* ───────────────────────── orçamento ───────────────────────── */

export async function setBudget(
  userId: string,
  input: { month: string; categoryId: string; budgeted?: number; carryover?: boolean },
) {
  const category = await ownCategory(prisma, userId, input.categoryId);
  if (category.group.isIncome) throw new AppError(400, 'Categorias de receita não recebem orçamento.');
  const data = {
    ...(input.budgeted !== undefined && { budgeted: input.budgeted }),
    ...(input.carryover !== undefined && { carryover: input.carryover }),
  };
  return prisma.financeBudget.upsert({
    where: { categoryId_month: { categoryId: input.categoryId, month: input.month } },
    create: { userId, categoryId: input.categoryId, month: input.month, ...data },
    update: data,
  });
}

/** Copia os valores orçados do mês anterior (o carryover já é herdado). */
export async function copyLastMonth(userId: string, month: string) {
  const previous = await prisma.financeBudget.findMany({ where: { userId, month: shiftMonth(month, -1) } });
  await prisma.$transaction(previous.map((budget) => prisma.financeBudget.upsert({
    where: { categoryId_month: { categoryId: budget.categoryId, month } },
    create: { userId, categoryId: budget.categoryId, month, budgeted: budget.budgeted, carryover: budget.carryover },
    update: { budgeted: budget.budgeted },
  })));
  return { copied: previous.length };
}

/**
 * Preenche cada envelope com o necessário para não ficar negativo
 * (cobre os estouros do mês), limitado ao que há em "A orçar".
 */
export async function coverOverspending(userId: string, month: string) {
  const input = await loadBudgetInput(userId);
  const current = computeBudgetMonth(input, month);
  let available = current.toBudget;
  let covered = 0;
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const [categoryId, value] of Object.entries(current.categories)) {
    if (value.balance >= 0 || available <= 0 || input.categories.find((c) => c.id === categoryId)?.isIncome) continue;
    const amount = Math.min(-value.balance, available);
    available -= amount;
    covered += amount;
    updates.push(prisma.financeBudget.upsert({
      where: { categoryId_month: { categoryId, month } },
      create: { userId, categoryId, month, budgeted: amount },
      update: { budgeted: { increment: amount } },
    }));
  }
  await prisma.$transaction(updates);
  return { covered };
}

/* ───────────────────────── transações ───────────────────────── */

const includeTransaction = {
  payee: { select: { name: true } },
  account: { select: { name: true } },
} as const;

export async function listTransactions(
  userId: string,
  filters: { accountId?: string; month?: string; search?: string; categoryId?: string; uncategorized?: boolean },
) {
  await ready(userId);
  const search = filters.search?.trim();
  const where: Prisma.FinanceTransactionWhereInput = {
    userId,
    ...(filters.accountId && { accountId: filters.accountId }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.uncategorized && { categoryId: null, transferId: null, account: { offBudget: false } }),
    // Busca vale para todo o histórico; sem busca, só o mês aberto.
    ...(search
      ? {
        OR: [
          { payee: { name: { contains: search, mode: 'insensitive' } } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }
      : filters.month && !filters.uncategorized && { date: { startsWith: filters.month } }),
  };
  const rows = await prisma.financeTransaction.findMany({
    where,
    include: includeTransaction,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 1000,
  });

  const mirrors = await prisma.financeTransaction.findMany({
    where: { id: { in: rows.map((row) => row.transferId).filter((id): id is string => !!id) } },
    select: { id: true, accountId: true, account: { select: { name: true } } },
  });
  const mirrorById = new Map(mirrors.map((mirror) => [mirror.id, mirror]));

  return rows.map((row) => {
    const mirror = row.transferId ? mirrorById.get(row.transferId) : undefined;
    return {
      id: row.id,
      accountId: row.accountId,
      accountName: row.account.name,
      date: row.date,
      amount: row.amount,
      payee: row.payee?.name ?? null,
      categoryId: row.categoryId,
      notes: row.notes,
      cleared: row.cleared,
      transferAccountId: mirror?.accountId ?? null,
      transferAccountName: mirror?.account.name ?? null,
    };
  });
}

export async function insertTransaction(db: Tx, userId: string, input: TransactionInput) {
  const account = await ownAccount(db, userId, input.accountId);
  if (account.closed) throw new AppError(400, 'Esta conta está fechada.');

  if (input.transferAccountId) {
    const other = await ownAccount(db, userId, input.transferAccountId);
    if (other.id === account.id) throw new AppError(400, 'Escolha contas diferentes para a transferência.');
    if (other.closed) throw new AppError(400, 'A conta de destino está fechada.');
    // Só faz sentido categorizar quando o dinheiro sai/entra do orçamento
    // (conta do orçamento ↔ conta fora dele), e só no lado do orçamento.
    const crosses = account.offBudget !== other.offBudget;
    const categoryId = crosses && input.categoryId ? (await ownCategory(db, userId, input.categoryId)).id : null;
    const base = { userId, date: input.date, notes: input.notes ?? null };
    const first = await db.financeTransaction.create({
      data: {
        ...base, accountId: account.id, amount: input.amount, cleared: input.cleared ?? false,
        categoryId: account.offBudget ? null : categoryId,
      },
    });
    const second = await db.financeTransaction.create({
      data: {
        ...base, accountId: other.id, amount: -input.amount, transferId: first.id,
        categoryId: other.offBudget ? null : categoryId,
      },
    });
    return db.financeTransaction.update({ where: { id: first.id }, data: { transferId: second.id } });
  }

  const category = input.categoryId && !account.offBudget ? await ownCategory(db, userId, input.categoryId) : null;
  const payee = await findOrCreatePayee(db, userId, input.payee);
  if (payee && category && payee.lastCategoryId !== category.id) {
    await db.financePayee.update({ where: { id: payee.id }, data: { lastCategoryId: category.id } });
  }
  return db.financeTransaction.create({
    data: {
      userId, accountId: account.id, date: input.date, amount: input.amount,
      payeeId: payee?.id ?? null, categoryId: category?.id ?? null,
      notes: input.notes ?? null, cleared: input.cleared ?? false,
    },
  });
}

async function removeTransaction(db: Tx, userId: string, id: string) {
  const transaction = await ownTransaction(db, userId, id);
  await db.financeTransaction.deleteMany({
    where: { userId, id: { in: [transaction.id, transaction.transferId].filter((x): x is string => !!x) } },
  });
  return transaction;
}

export async function createTransaction(userId: string, input: TransactionInput) {
  await ready(userId);
  return prisma.$transaction((db) => insertTransaction(db, userId, input));
}

/**
 * Editar transferência (ou transformar uma em outra coisa) envolve duas linhas,
 * então substituímos o par inteiro numa transação do banco. Edição simples é
 * um update comum e preserva o id.
 */
export async function updateTransaction(userId: string, id: string, input: TransactionInput) {
  return prisma.$transaction(async (db) => {
    const current = await ownTransaction(db, userId, id);
    if (current.transferId || input.transferAccountId) {
      await removeTransaction(db, userId, id);
      return insertTransaction(db, userId, { ...input, cleared: input.cleared ?? current.cleared });
    }
    const account = await ownAccount(db, userId, input.accountId);
    const category = input.categoryId && !account.offBudget ? await ownCategory(db, userId, input.categoryId) : null;
    const payee = await findOrCreatePayee(db, userId, input.payee);
    if (payee && category) {
      await db.financePayee.update({ where: { id: payee.id }, data: { lastCategoryId: category.id } });
    }
    return db.financeTransaction.update({
      where: { id },
      data: {
        accountId: account.id, date: input.date, amount: input.amount,
        payeeId: payee?.id ?? null, categoryId: category?.id ?? null,
        notes: input.notes ?? null, ...(input.cleared !== undefined && { cleared: input.cleared }),
      },
    });
  });
}

export async function setCleared(userId: string, id: string, cleared: boolean) {
  await ownTransaction(prisma, userId, id);
  return prisma.financeTransaction.update({ where: { id }, data: { cleared } });
}

export async function deleteTransaction(userId: string, id: string) {
  await prisma.$transaction((db) => removeTransaction(db, userId, id));
}

/* ───────────────────────── importação CSV ───────────────────────── */

function fingerprint(accountId: string, date: string, amount: number, payee: string) {
  return createHash('sha256')
    .update([accountId, date, amount, payee.trim().toLocaleLowerCase('pt-BR')].join('|'))
    .digest('hex');
}

/**
 * Importa linhas já separadas pelo frontend. O servidor interpreta data e
 * valor (formatos BR e ISO) e deduplica por ocorrência: duas compras iguais no
 * mesmo dia do extrato entram as duas, mas reimportar o mesmo extrato não
 * duplica nada.
 */
export async function importTransactions(userId: string, accountId: string, rows: ImportRowInput[], commit: boolean) {
  await ready(userId);
  const account = await ownAccount(prisma, userId, accountId);
  const [categories, payees, existing] = await Promise.all([
    prisma.financeCategory.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.financePayee.findMany({ where: { userId }, select: { name: true, lastCategoryId: true } }),
    prisma.financeTransaction.findMany({
      where: { accountId },
      select: { date: true, amount: true, importHash: true, payee: { select: { name: true } } },
    }),
  ]);
  const categoryByName = new Map(categories.map((c) => [c.name.toLocaleLowerCase('pt-BR'), c]));
  const payeeCategory = new Map(payees.map((p) => [p.name.toLocaleLowerCase('pt-BR'), p.lastCategoryId]));

  const known = new Map<string, number>();
  for (const row of existing) {
    const key = row.importHash ?? fingerprint(accountId, row.date, row.amount, row.payee?.name ?? '');
    known.set(key, (known.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  const preview = rows.map((row) => {
    const date = parseDate(row.date);
    const amount = parseMoney(row.amount);
    const payee = row.payee.trim();
    const base = { line: row.line, date: date ?? row.date, amount: amount ?? 0, payee, notes: row.notes?.trim() || null };
    if (!date) return { ...base, status: 'error' as const, message: `Data inválida: "${row.date}"`, categoryId: null };
    if (amount === null || amount === 0) return { ...base, status: 'error' as const, message: `Valor inválido: "${row.amount}"`, categoryId: null };
    if (!payee) return { ...base, status: 'error' as const, message: 'Descrição vazia.', categoryId: null };

    const named = row.category ? categoryByName.get(row.category.trim().toLocaleLowerCase('pt-BR')) : undefined;
    if (row.category?.trim() && !named) {
      return { ...base, status: 'error' as const, message: `Categoria "${row.category}" não existe.`, categoryId: null };
    }
    const categoryId = account.offBudget ? null : named?.id ?? payeeCategory.get(payee.toLocaleLowerCase('pt-BR')) ?? null;

    const hash = row.externalId
      ? createHash('sha256').update(['ofx', accountId, row.externalId].join('|')).digest('hex')
      : fingerprint(accountId, date, amount, payee);
    const occurrence = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, occurrence);
    if (occurrence <= (known.get(hash) ?? 0)) {
      return { ...base, status: 'duplicate' as const, message: 'Já existe na conta.', categoryId, hash };
    }
    return { ...base, status: 'ok' as const, message: null, categoryId, hash };
  });

  let imported = 0;
  if (commit) {
    const errors = preview.filter((row) => row.status === 'error').length;
    if (errors) throw new AppError(400, `Corrija ${errors} linha(s) com erro antes de importar.`);
    await prisma.$transaction(async (db) => {
      for (const row of preview) {
        if (row.status !== 'ok') continue;
        const payee = await findOrCreatePayee(db, userId, row.payee);
        await db.financeTransaction.create({
          data: {
            userId, accountId, date: row.date, amount: row.amount, payeeId: payee?.id ?? null,
            categoryId: row.categoryId, notes: row.notes, cleared: true, importHash: row.hash,
          },
        });
        imported += 1;
      }
    }, { timeout: 60_000 });
  }

  return {
    imported,
    rows: preview.map((row) => { const { hash: _hash, ...rest } = row as typeof row & { hash?: string }; return rest; }),
  };
}

/* ───────────────────────── relatórios ───────────────────────── */

export async function getReports(userId: string, month: string) {
  await ready(userId);
  const input = await loadBudgetInput(userId);
  const incomeIds = new Set(input.categories.filter((c) => c.isIncome).map((c) => c.id));
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5));

  const cashflow = months.map((key) => {
    let income = 0;
    let spending = 0;
    for (const [categoryId, total] of Object.entries(input.activity[key] ?? {})) {
      if (incomeIds.has(categoryId)) income += total;
      else spending -= total;
    }
    return { month: key, income, spending, net: income - spending };
  });

  const [categories, monthlyTotals] = await Promise.all([
    prisma.financeCategory.findMany({
      where: { userId, group: { isIncome: false } },
      select: { id: true, name: true, group: { select: { name: true } } },
    }),
    prisma.$queryRaw<{ month: string; total: bigint }[]>`
      SELECT LEFT("date", 7) AS month, SUM("amount")::bigint AS total
      FROM "FinanceTransaction" WHERE "userId" = ${userId}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const activity = input.activity[month] ?? {};
  const byCategory = categories
    .map((category) => ({ categoryId: category.id, name: category.name, group: category.group.name, spent: -(activity[category.id] ?? 0) }))
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // Patrimônio no fim de cada mês: soma acumulada de todas as contas.
  const netWorth = months.map((key) => ({
    month: key,
    value: monthlyTotals.filter((row) => row.month <= key).reduce((sum, row) => sum + Number(row.total), 0),
  }));

  return { month, cashflow, byCategory, netWorth };
}
