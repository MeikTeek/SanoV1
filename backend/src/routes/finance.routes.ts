import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/finance.controller';

const r = Router();
r.use(requireAuth);

r.get('/', c.overview);
r.get('/reports', c.reports);

r.post('/accounts', c.createAccount);
r.patch('/accounts/:id', c.updateAccount);
r.delete('/accounts/:id', c.deleteAccount);

r.post('/groups', c.createGroup);
r.patch('/groups/:id', c.updateGroup);
r.delete('/groups/:id', c.deleteGroup);
r.post('/categories', c.createCategory);
r.patch('/categories/:id', c.updateCategory);
r.delete('/categories/:id', c.deleteCategory);

r.put('/budgets', c.setBudget);
r.post('/budgets/copy-last-month', c.copyLastMonth);
r.post('/budgets/cover-overspending', c.coverOverspending);

r.get('/transactions', c.listTransactions);
r.post('/transactions', c.createTransaction);
r.patch('/transactions/:id', c.updateTransaction);
r.patch('/transactions/:id/cleared', c.setCleared);
r.delete('/transactions/:id', c.deleteTransaction);

r.post('/import', c.importTransactions);

export default r;
