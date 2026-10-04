import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/appointment.controller';

const r = Router();

r.use(requireAuth);

r.get('/', c.list);
r.get('/due', c.due); // polled pelo ReminderWatcher; antes de '/:id' por segurança
r.post('/', c.create);
r.patch('/:id', c.update);
r.delete('/:id', c.remove);

export default r;