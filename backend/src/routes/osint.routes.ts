import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { osintLimiter } from '../middleware/security';
import * as c from '../controllers/osint.controller';

const r = Router();

// Ferramenta sensível: só ADMIN, com teto próprio de varreduras.
r.use(requireAuth, requireRole('ADMIN'));

r.get('/', c.catalog);
r.post('/domain', osintLimiter, c.domainScan);
r.post('/email', osintLimiter, c.emailScan);
r.post('/username', osintLimiter, c.usernameScan);
r.get('/variations', c.variations);

export default r;
