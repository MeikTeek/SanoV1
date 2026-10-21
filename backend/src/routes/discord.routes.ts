import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBot } from '../middleware/botAuth';
import * as c from '../controllers/discord.controller';

const r = Router();

// Bot (servidor → servidor, token Bearer). Prefixo em BOT_PATH_PREFIX.
r.post('/bot/link', requireBot, c.botLink);
r.post('/bot/unlink', requireBot, c.botUnlink);
r.post('/bot/command', requireBot, c.botCommand);
r.get('/bot/reminders', requireBot, c.botReminders);

// Usuário logado (tela de Ajustes).
r.get('/', requireAuth, c.status);
r.post('/link-code', requireAuth, c.linkCode);
r.delete('/link', requireAuth, c.unlink);

export default r;
