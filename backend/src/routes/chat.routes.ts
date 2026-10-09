import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatLimiter, numberLookupLimiter } from '../middleware/security';
import * as c from '../controllers/chat.controller';

const r = Router();

/* ------------------------------- Perfis ------------------------------- */
r.get('/profiles/:username', requireAuth, c.profile);
r.post('/profiles/:username/friend-request', requireAuth, c.friendRequest);
r.get('/friend-requests', requireAuth, c.friendRequests);
r.patch('/friend-requests/:id', requireAuth, c.respondToFriendRequest);
r.put('/presence', requireAuth, c.presence);
r.put('/bio', requireAuth, c.bio);

/* ------------------------------ Identidade ---------------------------- */
// Chave pública E2EE do usuário: o navegador gera e guarda a privada.
r.put('/key', requireAuth, c.publicKey);

/* -------------------------------- Número ------------------------------ */
// Limite próprio: buscar código alheio é a operação que merece teto.
r.get('/number', requireAuth, c.myCode);

/* ------------------------------ Conversas ------------------------------ */
r.get('/conversations', requireAuth, c.conversations);
r.post('/conversations/direct', requireAuth, numberLookupLimiter, c.openDirect);
r.post('/conversations/group', requireAuth, chatLimiter, c.group);
r.get('/conversations/:id', requireAuth, c.conversation);
r.post('/conversations/:id/members', requireAuth, c.addMember);
r.delete('/conversations/:id/members', requireAuth, c.leave);

/* ------------------------------ Mensagens ------------------------------ */
r.get('/conversations/:id/messages', requireAuth, c.messages);
r.post('/conversations/:id/messages', requireAuth, chatLimiter, c.send);
r.post('/conversations/:id/read', requireAuth, c.read);

export default r;