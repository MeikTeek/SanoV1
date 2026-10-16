import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/music.controller';

const r = Router();
r.post('/shares', requireAuth, c.create);
r.post('/shares/claim', requireAuth, c.claim);
r.post('/shares/:id/finalize', requireAuth, c.finalize);
export default r;
