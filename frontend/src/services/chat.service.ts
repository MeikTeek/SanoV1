import { api } from './api';
import type { Envelope } from './crypto.service';

/* -------------------------------- Tipos ---------------------------------- */

export interface MyNumber {
  code: string;
  formatted: string;
  expiresAt: string;
  expiresInSeconds: number;
  windowHours: number;
}

export interface Person {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  bio: string | null;
  publicKey: string | null;
  isFollowing?: boolean | null;
}

export interface PersonProfile extends Person {
  createdAt: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean | null;
  followsYou: boolean;
  isSelf: boolean;
}

export interface DirectoryEntry extends Person {
  createdAt: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface ConversationMember {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  publicKey: string | null;
  role: string;
}

export interface Conversation {
  id: string;
  kind: 'DM' | 'GROUP';
  name: string | null;
  createdAt: string;
  lastMessageAt: string;
  members: ConversationMember[];
  title: string;
  subtitle: string | null;
  unread: number;
}

export type MessageKind = 'TEXT' | 'IMAGE' | 'AUDIO';

export interface MessageMeta {
  mime?: string;
  bytes?: number;
  seconds?: number;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  kind: MessageKind;
  envelope: Envelope;
  meta: MessageMeta | null;
  createdAt: string;
  mine: boolean;
  /** Preenchido pelo cliente após decifrar; null enquanto não decifra. */
  text?: string | null;
  /** URL de objeto para mídia decifrada (ciclo de vida = a tela). */
  mediaUrl?: string | null;
  /** Quando a decifragem falhou (chave ausente, dado adulterado). */
  failed?: boolean;
}

/* ------------------------------- Número ---------------------------------- */

export const getMyNumber = () => api.get<{ number: MyNumber }>('/chat/number').then((r) => r.number);

/* ------------------------------ Perfis ----------------------------------- */

export const getDirectory = (search?: string) =>
  api
    .get<{ profiles: DirectoryEntry[] }>(`/chat/profiles${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    .then((r) => r.profiles);

export const getProfile = (username: string) =>
  api.get<{ profile: PersonProfile }>(`/chat/profiles/${encodeURIComponent(username)}`).then((r) => r.profile);

export const getRelations = (username: string, list: 'followers' | 'following') =>
  api
    .get<{ list: Person[]; direction: 'followers' | 'following' }>(
      `/chat/profiles/${encodeURIComponent(username)}/relations?list=${list}`,
    )
    .then((r) => r.list);

export const followUser = (username: string) =>
  api
    .post<{ profile: PersonProfile }>(`/chat/profiles/${encodeURIComponent(username)}/follow`)
    .then((r) => r.profile);

export const unfollowUser = (username: string) =>
  api
    .delete<{ profile: PersonProfile }>(`/chat/profiles/${encodeURIComponent(username)}/follow`)
    .then((r) => r.profile);

export const setBio = (bio: string) =>
  api.put<{ profile: { bio: string | null } }>('/chat/bio', { bio }).then((r) => r.profile);

/** Registra a chave pública E2EE (a privada nunca sai do navegador). */
export const publishPublicKey = (publicKey: string) =>
  api.put<{ ok: boolean }>('/chat/key', { publicKey }).then(() => true);

/* ----------------------------- Conversas --------------------------------- */

export const listConversations = () =>
  api.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => r.conversations);

/** Abre (ou reaproveita) a conversa com o código de 8 caracteres digitado. */
export const openDirectByNumber = (number: string) =>
  api.post<{ conversation: Conversation }>('/chat/conversations/direct', { number }).then((r) => r.conversation);

export const openDirectByUser = (userId: string) =>
  api.post<{ conversation: Conversation }>('/chat/conversations/direct', { userId }).then((r) => r.conversation);

/** `invitees` aceita `@usuario` ou o código de 8 caracteres de cada pessoa. */
export const createGroup = (name: string, invitees: string[]) =>
  api
    .post<{ conversation: Conversation }>('/chat/conversations/group', { name, invitees })
    .then((r) => r.conversation);

export const leaveGroup = (conversationId: string) =>
  api.delete<{ ok: boolean }>(`/chat/conversations/${conversationId}/members`).then(() => true);

export const listMessages = (conversationId: string, before?: string) =>
  api
    .get<{ messages: Message[] }>(
      `/chat/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    )
    .then((r) => r.messages);

/** Envia a mensagem já cifrada. `clientId` evita duplicata em retentativa. */
export const sendMessage = (
  conversationId: string,
  payload: { envelope: Envelope; kind: MessageKind; meta?: MessageMeta; clientId?: string },
) =>
  api
    .post<{ message: Message }>(`/chat/conversations/${conversationId}/messages`, payload)
    .then((r) => r.message);

export const markRead = (conversationId: string) =>
  api.post<{ ok: boolean }>(`/chat/conversations/${conversationId}/read`).then(() => true);

/* --------------------- Prévia da última mensagem --------------------- */

/**
 * Cache de prévias em memória.
 *
 * O servidor **não** pode mandar a última mensagem em claro — é exatamente o
 * que a criptografia ponta a ponta esconde dele. Então a prévia só existe para
 * quem já decifrou aquela mensagem neste navegador. Funciona assim:
 *
 * 1. a tela registra a prévia ao decifrar a conversa aberta;
 * 2. a lista usa o que houver em cache;
 * 3. o que não estiver aparece como "conversa criptografada", sem fingir que o
 *    servidor sabe o conteúdo.
 *
 * Como é memória pura, um recarregamento limpa — o mesmo comportamento de antes,
 * só que agora a troca de conversa não apaga mais o que já foi lido.
 */
const previews = new Map<string, string>();

export const setPreview = (conversationId: string, text: string) => {
  previews.set(conversationId, text.slice(0, 120));
};

/** O que mostra no item da lista quando ainda não há prévia decifrada. */
export const previewOrPlaceholder = (conversation: Conversation): string => {
  const cached = previews.get(conversation.id);
  if (cached) return cached;
  return conversation.kind === 'GROUP'
    ? `${conversation.members.length} pessoas`
    : 'conversa criptografada';
};