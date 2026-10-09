import type { Request, Response } from 'express';
import {
  addMemberSchema,
  conversationParamSchema,
  createGroupSchema,
  friendRequestResponseSchema,
  listMessagesQuerySchema,
  openDirectSchema,
  profileParamsSchema,
  presenceSchema,
  sendMessageSchema,
  setPublicKeySchema,
  updateBioSchema,
} from '../validators/chat.validator';
import {
  addToGroup,
  createGroup,
  getConversation,
  leaveGroup,
  listConversations,
  listMessages,
  markRead,
  openDirectByNumber,
  sendMessage,
} from '../services/chat/conversation.service';
import { myNumber } from '../services/chat/number.service';
import { setPublicKey, updateBio } from '../services/chat/profile-data.service';
import {
  getSocialProfile,
  listIncomingFriendRequests,
  requestFriendship,
  respondFriendRequest,
  updatePresence,
} from '../services/chat/friend.service';
import { logAudit } from '../services/audit.service';

/* --------------------------------- Número -------------------------------- */

/** O "telefone" do usuário, válido por 15 horas. */
export async function myCode(req: Request, res: Response) {
  res.json({ number: await myNumber(req.user!.id) });
}

/* -------------------------------- Conversas ------------------------------ */

export async function conversations(req: Request, res: Response) {
  res.json({ conversations: await listConversations(req.user!.id) });
}

export async function conversation(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  res.json({ conversation: await getConversation(id, req.user!.id) });
}

/** Abre uma DM pelo código de 8 caracteres ou pelo id do diretório. */
export async function openDirect(req: Request, res: Response) {
  const { number } = openDirectSchema.parse(req.body);
  const result = await openDirectByNumber(req.user!.id, number);

  await logAudit(req, 'CHAT_DM_OPENED', req.user!.id, { conversationId: result.id });
  res.status(201).json({ conversation: result });
}

export async function group(req: Request, res: Response) {
  const { name, invitees } = createGroupSchema.parse(req.body);
  const result = await createGroup(req.user!.id, name, invitees);
  await logAudit(req, 'CHAT_GROUP_CREATED', req.user!.id, { conversationId: result.id });
  res.status(201).json({ conversation: result });
}

export async function addMember(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  const { userId } = addMemberSchema.parse(req.body);
  await addToGroup(id, req.user!.id, userId);
  res.status(201).json({ conversation: await getConversation(id, req.user!.id) });
}

export async function leave(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  await leaveGroup(id, req.user!.id);
  res.json({ ok: true });
}
/* -------------------------------- Mensagens ------------------------------ */

export async function messages(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  const query = listMessagesQuerySchema.parse(req.query);
  res.json({
    messages: await listMessages(id, req.user!.id, { before: query.before, limit: query.limit }),
  });
}

/**
 * Grava a mensagem. O corpo já chega cifrado do navegador — aqui só se valida
 * a autorização e o tamanho do blob.
 */
export async function send(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  const data = sendMessageSchema.parse(req.body);

  const message = await sendMessage({
    conversationId: id,
    senderId: req.user!.id,
    clientId: data.clientId,
    kind: data.kind,
    envelope: data.envelope,
    meta: data.meta ?? null,
  });
  res.status(201).json({ message });
}

export async function read(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  await markRead(id, req.user!.id);
  res.json({ ok: true });
}

/* ------------------------------ Perfis sociais --------------------------- */

export async function profile(req: Request, res: Response) {
  const { username } = profileParamsSchema.parse(req.params);
  res.json({ profile: await getSocialProfile(username, req.user!.id) });
}

export async function friendRequest(req: Request, res: Response) {
  const { username } = profileParamsSchema.parse(req.params);
  const request = await requestFriendship(req.user!.id, username);
  await logAudit(req, 'FRIEND_REQUEST_SENT', req.user!.id, { requestId: request.id });
  res.status(201).json({ request });
}

export async function friendRequests(req: Request, res: Response) {
  res.json({ requests: await listIncomingFriendRequests(req.user!.id) });
}

export async function respondToFriendRequest(req: Request, res: Response) {
  const { id } = conversationParamSchema.parse(req.params);
  const { status } = friendRequestResponseSchema.parse(req.body);
  await respondFriendRequest(req.user!.id, id, status);
  await logAudit(req, status === 'ACCEPTED' ? 'FRIEND_REQUEST_ACCEPTED' : 'FRIEND_REQUEST_REJECTED', req.user!.id, { requestId: id });
  res.json({ ok: true });
}

export async function presence(req: Request, res: Response) {
  const { activity } = presenceSchema.parse(req.body);
  await updatePresence(req.user!.id, activity);
  res.json({ ok: true });
}

export async function bio(req: Request, res: Response) {
  const { bio: text } = updateBioSchema.parse(req.body);
  res.json({ profile: await updateBio(req.user!.id, text) });
}

/** Chave pública E2EE do usuário (gerada e guardada no navegador). */
export async function publicKey(req: Request, res: Response) {
  const { publicKey } = setPublicKeySchema.parse(req.body);
  await setPublicKey(req.user!.id, publicKey);
  res.json({ ok: true });
}