import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';

export interface FinanceAccount {
  id: string;
  name: string;
  balance: number;
  createdAt: string;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  createdAt: string;
}

export interface FinanceBudget {
  id: string;
  month: string;
  category: string;
  amount: number;
  allocated: number;
  carryover: boolean;
}

export interface FinanceCategoryGroup {
  id: string;
  name: string;
  categories: string[];
}

export interface FinanceImportRow {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  line: number;
}

interface FinanceLedger {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  categories: string[];
  categoryGroups: FinanceCategoryGroup[];
  budgets: FinanceBudget[];
}

const TOOL = 'finance';
const KEY = 'ledger';

function emptyLedger(): FinanceLedger {
  return { accounts: [], transactions: [], categories: [], categoryGroups: [], budgets: [] };
}

async function getLedger(userId: string): Promise<FinanceLedger> {
  const row = await prisma.toolData.findUnique({
    where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
  });
  if (!row) return emptyLedger();
  const value = row.data as Partial<FinanceLedger>;
  return {
    accounts: Array.isArray(value.accounts) ? value.accounts : [],
    transactions: Array.isArray(value.transactions) ? value.transactions : [],
    categories: Array.isArray(value.categories) ? value.categories : [],
    categoryGroups: Array.isArray(value.categoryGroups) ? value.categoryGroups : [],
    budgets: Array.isArray(value.budgets)
      ? value.budgets.map((budget) => ({
        ...budget,
        allocated: typeof budget.allocated === 'number' ? budget.allocated : budget.amount,
        carryover: budget.carryover === true,
      }))
      : [],
  };
}

async function saveLedger(userId: string, ledger: FinanceLedger) {
  await prisma.toolData.upsert({
    where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
    create: { userId, tool: TOOL, key: KEY, data: ledger as unknown as Prisma.InputJsonValue },
    update: { data: ledger as unknown as Prisma.InputJsonValue },
  });
  return ledger;
}

export async function getFinance(userId: string, month: string) {
  const ledger = await getLedger(userId);
  const transactions = ledger.transactions.filter((transaction) => transaction.date.startsWith(month));
  const income = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = transactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return {
    ...ledger,
    transactions,
    budgets: ledger.budgets.filter((budget) => budget.month === month).map((budget) => {
      const spent = transactions
        .filter((transaction) => transaction.category === budget.category && transaction.amount < 0)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
      const previousMonth = new Date(`${month}-01T00:00:00Z`);
      previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
      const previous = ledger.budgets.find((item) =>
        item.month === previousMonth.toISOString().slice(0, 7) && item.category === budget.category);
      const previousSpent = previous
        ? ledger.transactions
          .filter((transaction) => transaction.category === budget.category && transaction.date.startsWith(previous.month) && transaction.amount < 0)
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
        : 0;
      const rollover = budget.carryover && previous ? Math.max(previous.allocated - previousSpent, 0) : 0;
      return { ...budget, spent, available: budget.allocated + rollover - spent };
    }),
    summary: { income, expenses, balance: income - expenses },
  };
}

export async function getReports(userId: string, month: string) {
  const ledger = await getLedger(userId);
  const selected = ledger.transactions.filter((transaction) => transaction.date.startsWith(month));
  const byCategory = ledger.categories.map((category) => {
    const spent = selected
      .filter((transaction) => transaction.category === category && transaction.amount < 0)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const budget = ledger.budgets.find((item) => item.month === month && item.category === category);
    return { category, spent, allocated: budget?.allocated ?? 0, available: (budget?.allocated ?? 0) - spent };
  }).filter((item) => item.spent > 0 || item.allocated > 0);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);
    const transactions = ledger.transactions.filter((transaction) => transaction.date.startsWith(key));
    const income = transactions.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = transactions.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    return { month: key, income, expenses, balance: income - expenses };
  });
  return { month, byCategory, months };
}

export async function createAccount(userId: string, name: string, balance: number) {
  const ledger = await getLedger(userId);
  const account: FinanceAccount = {
    id: randomUUID(),
    name,
    balance,
    createdAt: new Date().toISOString(),
  };
  ledger.accounts.push(account);
  await saveLedger(userId, ledger);
  return account;
}

export async function createTransaction(
  userId: string,
  input: Omit<FinanceTransaction, 'id' | 'createdAt'>,
) {
  const ledger = await getLedger(userId);
  if (!ledger.accounts.some((account) => account.id === input.accountId)) {
    throw new AppError(404, 'Conta financeira não encontrada.');
  }
  if (ledger.categories.length > 0 && !ledger.categories.includes(input.category)) {
    throw new AppError(400, 'Selecione uma categoria válida.');
  }
  const transaction: FinanceTransaction = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  ledger.transactions.push(transaction);
  const account = ledger.accounts.find((item) => item.id === input.accountId)!;
  account.balance += input.amount;
  await saveLedger(userId, ledger);
  return transaction;
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Omit<FinanceTransaction, 'id' | 'createdAt'>,
) {
  const ledger = await getLedger(userId);
  const transaction = ledger.transactions.find((item) => item.id === id);
  if (!transaction) throw new AppError(404, 'Transação financeira não encontrada.');
  if (!ledger.accounts.some((account) => account.id === input.accountId)) {
    throw new AppError(404, 'Conta financeira não encontrada.');
  }
  if (ledger.categories.length > 0 && !ledger.categories.includes(input.category)) {
    throw new AppError(400, 'Selecione uma categoria válida.');
  }
  const oldAccount = ledger.accounts.find((account) => account.id === transaction.accountId);
  const newAccount = ledger.accounts.find((account) => account.id === input.accountId)!;
  if (oldAccount) oldAccount.balance -= transaction.amount;
  newAccount.balance += input.amount;
  Object.assign(transaction, input);
  await saveLedger(userId, ledger);
  return transaction;
}

export async function transfer(
  userId: string,
  input: { fromAccountId: string; toAccountId: string; amount: number; date: string },
) {
  if (input.fromAccountId === input.toAccountId) {
    throw new AppError(400, 'Escolha contas diferentes para a transferência.');
  }
  const ledger = await getLedger(userId);
  const from = ledger.accounts.find((account) => account.id === input.fromAccountId);
  const to = ledger.accounts.find((account) => account.id === input.toAccountId);
  if (!from || !to) throw new AppError(404, 'Conta financeira não encontrada.');
  from.balance -= input.amount;
  to.balance += input.amount;
  const category = 'Transferência';
  const base = { description: `Transferência para ${to.name}`, date: input.date, category };
  const outgoing: FinanceTransaction = { ...base, id: randomUUID(), accountId: from.id, amount: -input.amount, createdAt: new Date().toISOString() };
  const incoming: FinanceTransaction = { ...base, id: randomUUID(), accountId: to.id, amount: input.amount, createdAt: new Date().toISOString(), description: `Transferência de ${from.name}` };
  ledger.transactions.push(outgoing, incoming);
  await saveLedger(userId, ledger);
  return { outgoing, incoming };
}

export async function deleteTransaction(userId: string, id: string) {
  const ledger = await getLedger(userId);
  const index = ledger.transactions.findIndex((transaction) => transaction.id === id);
  if (index < 0) throw new AppError(404, 'Transação financeira não encontrada.');
  const [transaction] = ledger.transactions.splice(index, 1);
  const account = ledger.accounts.find((item) => item.id === transaction.accountId);
  if (account) account.balance -= transaction.amount;
  await saveLedger(userId, ledger);
}

function transactionFingerprint(input: Omit<FinanceTransaction, 'id' | 'createdAt'>) {
  return createHash('sha256')
    .update([input.accountId, input.date, input.amount.toFixed(2), input.description.trim().toLocaleLowerCase(), input.category.trim().toLocaleLowerCase()].join('|'))
    .digest('hex');
}

export async function importTransactions(userId: string, rows: FinanceImportRow[], commit: boolean) {
  const ledger = await getLedger(userId);
  const known = new Set(ledger.transactions.map(transactionFingerprint));
  const batch = new Set<string>();
  const valid: FinanceTransaction[] = [];
  const duplicates: number[] = [];
  const errors: { line: number; message: string }[] = [];
  for (const row of rows) {
    const input = { accountId: row.accountId, description: row.description, amount: row.amount, date: row.date, category: row.category };
    if (!ledger.accounts.some((account) => account.id === row.accountId)) {
      errors.push({ line: row.line, message: 'Conta financeira não encontrada.' });
      continue;
    }
    if (ledger.categories.length > 0 && !ledger.categories.includes(row.category)) {
      errors.push({ line: row.line, message: `Categoria "${row.category}" não existe.` });
      continue;
    }
    const fingerprint = transactionFingerprint(input);
    if (known.has(fingerprint) || batch.has(fingerprint)) {
      duplicates.push(row.line);
      continue;
    }
    batch.add(fingerprint);
    valid.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
  }
  if (commit && errors.length > 0) {
    throw new AppError(400, `A importação contém ${errors.length} linha(s) inválida(s).`);
  }
  if (commit) {
    for (const transaction of valid) {
      ledger.transactions.push(transaction);
      const account = ledger.accounts.find((item) => item.id === transaction.accountId)!;
      account.balance += transaction.amount;
    }
    await saveLedger(userId, ledger);
  }
  return { imported: commit ? valid.length : 0, preview: valid.map(({ id: _id, createdAt: _createdAt, ...row }) => row), duplicates, errors };
}

export async function createCategory(userId: string, name: string) {
  const ledger = await getLedger(userId);
  if (ledger.categories.some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new AppError(409, 'Essa categoria já existe.');
  }
  ledger.categories.push(name);
  await saveLedger(userId, ledger);
  return name;
}

export async function createCategoryGroup(userId: string, name: string) {
  const ledger = await getLedger(userId);
  if (ledger.categoryGroups.some((group) => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new AppError(409, 'Esse grupo de categorias já existe.');
  }
  const group = { id: randomUUID(), name, categories: [] };
  ledger.categoryGroups.push(group);
  await saveLedger(userId, ledger);
  return group;
}

export async function saveBudget(userId: string, input: Omit<FinanceBudget, 'id' | 'amount'> & { amount?: number }) {
  const ledger = await getLedger(userId);
  const existing = ledger.budgets.find((budget) => budget.month === input.month && budget.category === input.category);
  if (existing) {
    existing.amount = input.allocated;
    existing.allocated = input.allocated;
    existing.carryover = input.carryover;
  } else {
    ledger.budgets.push({
      ...input,
      id: randomUUID(),
      amount: input.allocated,
    });
  }
  await saveLedger(userId, ledger);
  return ledger.budgets.find((budget) => budget.month === input.month && budget.category === input.category)!;
}
