import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/profile.controller';

const r = Router();

// Perfil pessoal: foto e nome de exibição. Não muda o `username` de acesso.
r.get('/', requireAuth, c.show);
r.put('/avatar', requireAuth, c.avatar);
r.delete('/avatar', requireAuth, c.avatarRemove);
r.put('/display-name', requireAuth, c.displayName);
r.put('/privacy', requireAuth, c.privacy);

export default r;