import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/music.controller';

const r = Router();
r.post('/shares', requireAuth, c.create);
r.post('/shares/claim', requireAuth, c.claim);
r.get('/storage-status', requireAuth, c.storageStatus);
r.post('/shares/:id/upload', requireAuth, c.upload);
r.post('/shares/:id/finalize', requireAuth, c.finalize);
export default r;
