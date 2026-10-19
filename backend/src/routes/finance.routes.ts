import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/finance.controller';

const r = Router();
r.use(requireAuth);
r.get('/', c.dashboard);
r.get('/reports', c.reports);
r.post('/import/preview', c.importPreview);
r.post('/import/commit', c.importCommit);
r.post('/accounts', c.account);
r.post('/categories', c.category);
r.post('/category-groups', c.categoryGroup);
r.post('/budgets', c.budget);
r.post('/transactions', c.transaction);
r.patch('/transactions/:id', c.update);
r.post('/transfers', c.move);
r.delete('/transactions/:id', c.removeTransaction);

export default r;
