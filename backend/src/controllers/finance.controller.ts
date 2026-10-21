import type { Request, Response } from 'express';
import * as finance from '../services/finance/service';
import * as v from '../validators/finance.validator';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthOf = (req: Request) => v.monthSchema.catch(currentMonth).parse(req.query.month);
const idOf = (req: Request) => v.idSchema.parse(req.params.id);

export async function overview(req: Request, res: Response) {
  res.json(await finance.getOverview(req.user!.id, monthOf(req)));
}

export async function reports(req: Request, res: Response) {
  res.json(await finance.getReports(req.user!.id, monthOf(req)));
}

/* contas */
export async function createAccount(req: Request, res: Response) {
  res.status(201).json(await finance.createAccount(req.user!.id, v.accountCreateSchema.parse(req.body)));
}
export async function updateAccount(req: Request, res: Response) {
  res.json(await finance.updateAccount(req.user!.id, idOf(req), v.accountUpdateSchema.parse(req.body)));
}
export async function deleteAccount(req: Request, res: Response) {
  await finance.deleteAccount(req.user!.id, idOf(req));
  res.status(204).send();
}

/* grupos e categorias */
export async function createGroup(req: Request, res: Response) {
  res.status(201).json(await finance.createGroup(req.user!.id, v.groupCreateSchema.parse(req.body)));
}
export async function updateGroup(req: Request, res: Response) {
  res.json(await finance.updateGroup(req.user!.id, idOf(req), v.groupUpdateSchema.parse(req.body)));
}
export async function deleteGroup(req: Request, res: Response) {
  await finance.deleteGroup(req.user!.id, idOf(req));
  res.status(204).send();
}
export async function createCategory(req: Request, res: Response) {
  res.status(201).json(await finance.createCategory(req.user!.id, v.categoryCreateSchema.parse(req.body)));
}
export async function updateCategory(req: Request, res: Response) {
  res.json(await finance.updateCategory(req.user!.id, idOf(req), v.categoryUpdateSchema.parse(req.body)));
}
export async function deleteCategory(req: Request, res: Response) {
  const { transferTo } = v.categoryDeleteSchema.parse(req.query);
  await finance.deleteCategory(req.user!.id, idOf(req), transferTo);
  res.status(204).send();
}

/* orçamento */
export async function setBudget(req: Request, res: Response) {
  res.json(await finance.setBudget(req.user!.id, v.budgetSchema.parse(req.body)));
}
export async function copyLastMonth(req: Request, res: Response) {
  res.json(await finance.copyLastMonth(req.user!.id, v.monthSchema.parse(req.body.month)));
}
export async function coverOverspending(req: Request, res: Response) {
  res.json(await finance.coverOverspending(req.user!.id, v.monthSchema.parse(req.body.month)));
}

/* transações */
export async function listTransactions(req: Request, res: Response) {
  res.json(await finance.listTransactions(req.user!.id, v.transactionQuerySchema.parse(req.query)));
}
export async function createTransaction(req: Request, res: Response) {
  res.status(201).json(await finance.createTransaction(req.user!.id, v.transactionSchema.parse(req.body)));
}
export async function updateTransaction(req: Request, res: Response) {
  res.json(await finance.updateTransaction(req.user!.id, idOf(req), v.transactionSchema.parse(req.body)));
}
export async function setCleared(req: Request, res: Response) {
  res.json(await finance.setCleared(req.user!.id, idOf(req), v.clearedSchema.parse(req.body).cleared));
}
export async function deleteTransaction(req: Request, res: Response) {
  await finance.deleteTransaction(req.user!.id, idOf(req));
  res.status(204).send();
}

export async function importTransactions(req: Request, res: Response) {
  const input = v.importSchema.parse(req.body);
  res.json(await finance.importTransactions(req.user!.id, input.accountId, input.rows, input.commit));
}
