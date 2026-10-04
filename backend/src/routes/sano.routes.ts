import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { commandLimiter } from '../middleware/security';
import * as c from '../controllers/sano.controller';

const r = Router();

r.get('/greeting', requireAuth, c.greeting);
r.get('/panels', requireAuth, c.panels);
r.post('/command', requireAuth, commandLimiter, c.command);

export default r;