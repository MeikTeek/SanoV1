import type { Request, Response } from 'express';
import { z } from 'zod';
import { createAccount, createCategory, createCategoryGroup, createTransaction, deleteTransaction, getFinance, getReports, importTransactions, saveBudget, transfer, updateTransaction } from '../services/finance.service';

const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  balance: z.number().finite().default(0),
});

const transactionSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(200),
  amount: z.number().finite().refine((value) => value !== 0, 'O valor não pode ser zero.'),
  date: z.string().date(),
  category: z.string().trim().min(1).max(100),
});
const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().finite().positive(),
  date: z.string().date(),
});
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Informe o mês no formato AAAA-MM.');
const categorySchema = z.object({ name: z.string().trim().min(1).max(100) });
const groupSchema = z.object({ name: z.string().trim().min(1).max(100) });
const budgetSchema = z.object({
  month: monthSchema,
  category: z.string().trim().min(1).max(100),
  allocated: z.number().finite().nonnegative(),
  carryover: z.boolean().default(false),
});
const importSchema = z.object({
  commit: z.boolean().default(false),
  rows: z.array(z.object({
    accountId: z.string().uuid(),
    description: z.string().trim().min(1).max(200),
    amount: z.number().finite().refine((value) => value !== 0),
    date: z.string().date(),
    category: z.string().trim().min(1).max(100),
    line: z.number().int().positive(),
  })).min(1).max(2000),
});

export async function dashboard(req: Request, res: Response) {
  const month = monthSchema.catch(new Date().toISOString().slice(0, 7)).parse(req.query.month);
  res.json(await getFinance(req.user!.id, month));
}

export async function reports(req: Request, res: Response) {
  const month = monthSchema.catch(new Date().toISOString().slice(0, 7)).parse(req.query.month);
  res.json(await getReports(req.user!.id, month));
}

export async function importPreview(req: Request, res: Response) {
  res.json(await importTransactions(req.user!.id, importSchema.parse(req.body).rows, false));
}

export async function importCommit(req: Request, res: Response) {
  res.json(await importTransactions(req.user!.id, importSchema.parse(req.body).rows, true));
}

export async function account(req: Request, res: Response) {
  const input = accountSchema.parse(req.body);
  res.status(201).json(await createAccount(req.user!.id, input.name, input.balance));
}

export async function transaction(req: Request, res: Response) {
  res.status(201).json(await createTransaction(req.user!.id, transactionSchema.parse(req.body)));
}

export async function update(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  res.json(await updateTransaction(req.user!.id, id, transactionSchema.parse(req.body)));
}

export async function move(req: Request, res: Response) {
  res.status(201).json(await transfer(req.user!.id, transferSchema.parse(req.body)));
}

export async function removeTransaction(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  await deleteTransaction(req.user!.id, id);
  res.status(204).send();
}

export async function category(req: Request, res: Response) {
  res.status(201).json(await createCategory(req.user!.id, categorySchema.parse(req.body).name));
}

export async function categoryGroup(req: Request, res: Response) {
  res.status(201).json(await createCategoryGroup(req.user!.id, groupSchema.parse(req.body).name));
}

export async function budget(req: Request, res: Response) {
  res.status(201).json(await saveBudget(req.user!.id, budgetSchema.parse(req.body)));
}
