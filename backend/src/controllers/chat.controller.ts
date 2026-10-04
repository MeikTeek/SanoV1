import type { Request, Response } from 'express';
import {
  addMemberSchema,
  conversationParamSchema,
  createGroupSchema,
  directoryQuerySchema,
  listMessagesQuerySchema,
  openDirectSchema,
  profileParamsSchema,
  relationsQuerySchema,
  sendMessageSchema,
  setPublicKeySchema,
  updateBioSchema,
  usernameParamSchema,
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
  openDirectByUser,
  sendMessage,
} from '../services/chat/conversation.service';
import { myNumber } from '../services/chat/number.service';
import {
  follow,
  getProfileByUsername,
  listFollowers,
  listProfiles,
  setPublicKey,
  unfollow,
  updateBio,
} from '../services/chat/social.service';
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
  const data = openDirectSchema.parse(req.body);
  const result = 'number' in data
    ? await openDirectByNumber(req.user!.id, data.number)
    : await openDirectByUser(req.user!.id, data.userId);

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

export async function directory(req: Request, res: Response) {
  const { search, limit } = directoryQuerySchema.parse(req.query);
  res.json({ profiles: await listProfiles(req.user!.id, { search, limit }) });
}

export async function profile(req: Request, res: Response) {
  const { username } = profileParamsSchema.parse(req.params);
  res.json({ profile: await getProfileByUsername(username, req.user!.id) });
}

/** Seguidores/seguindo do perfil. `?list=followers|following`. */
export async function relations(req: Request, res: Response) {
  // `username` vem da rota e `list` da query — em fontes diferentes, por isso
  // as duas validações separadas.
  const { username } = profileParamsSchema.parse(req.params);
  const { list } = relationsQuerySchema.parse(req.query);

  const target = await getProfileByUsername(username, req.user!.id);
  const direction = list ?? 'followers';

  res.json({
    list: await listFollowers(target.id, req.user!.id, direction),
    direction,
    profile: {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      avatarDataUrl: target.avatarDataUrl,
    },
  });
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

export async function followUser(req: Request, res: Response) {
  const { username } = usernameParamSchema.parse(req.params);
  const target = await getProfileByUsername(username, req.user!.id);
  await follow(req.user!.id, target.id);
  await logAudit(req, 'CHAT_FOLLOW', req.user!.id, { username });
  res.json({ profile: await getProfileByUsername(username, req.user!.id) });
}

export async function unfollowUser(req: Request, res: Response) {
  const { username } = usernameParamSchema.parse(req.params);
  const target = await getProfileByUsername(username, req.user!.id);
  await unfollow(req.user!.id, target.id);
  res.json({ profile: await getProfileByUsername(username, req.user!.id) });
}