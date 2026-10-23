import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { commandLimiter, ttsLimiter } from '../middleware/security';
import * as c from '../controllers/sano.controller';

const r = Router();

r.get('/greeting', requireAuth, c.greeting);
r.get('/panels', requireAuth, c.panels);
r.post('/command', requireAuth, commandLimiter, c.command);

// IA: cada usuário cadastra a própria chave da OpenRouter.
r.get('/ai', requireAuth, c.aiStatus);
r.put('/ai', requireAuth, commandLimiter, c.aiSave);
r.delete('/ai', requireAuth, c.aiRemove);
r.get('/ai/quota', requireAuth, c.aiQuota);
r.get('/ai/models', requireAuth, c.aiModels);

// Voz neural do Sano (Microsoft Edge TTS).
r.get('/voice/voices', requireAuth, c.voices);
r.post('/voice/tts', requireAuth, ttsLimiter, c.speak);

export default r;