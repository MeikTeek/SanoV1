import { Router } from 'express';
import { requireAuth, requirePreAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/security';
import * as c from '../controllers/auth.controller';

const r = Router();

r.post('/login', authLimiter, c.login);
r.post('/change-password', authLimiter, requirePreAuth, c.changePassword);
r.post('/2fa/setup', authLimiter, requirePreAuth, c.setupTwoFactor);
r.post('/2fa/confirm', authLimiter, requirePreAuth, c.confirmTwoFactor);
r.post('/2fa/verify', authLimiter, requirePreAuth, c.verifyTwoFactor);
r.post('/logout', c.logout);
r.get('/me', requireAuth, c.me);

export default r;
