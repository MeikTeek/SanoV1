import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/admin.controller';

const r = Router();

r.use(requireAuth, requireRole('ADMIN')); // tudo aqui exige sessão completa + cargo ADMIN

r.get('/users', c.listUsers);
r.post('/users', c.createUser);
r.patch('/users/:id/active', c.setActive);
r.post('/users/:id/reset', c.resetCredentials);
r.get('/logs', c.listLogs);

export default r;
