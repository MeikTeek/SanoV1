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

export type FriendshipStatus = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIEND' | 'REJECTED';

export interface PersonProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  bio: string | null;
  publicKey: string | null;
  createdAt: string;
  isSelf: boolean;
  friendshipStatus: FriendshipStatus;
  friendshipRequestId: string | null;
  isOnline: boolean | null;
  activityStatus: string | null;
}

export interface IncomingFriendRequest {
  id: string;
  createdAt: string;
  requester: Pick<PersonProfile, 'id' | 'username' | 'displayName' | 'avatarDataUrl'>;
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

export const getProfile = (username: string) =>
  api.get<{ profile: PersonProfile }>(`/chat/profiles/${encodeURIComponent(username)}`).then((r) => r.profile);

export const requestFriendship = (username: string) =>
  api
    .post<{ request: { id: string; status: 'PENDING' } }>(
      `/chat/profiles/${encodeURIComponent(username)}/friend-request`,
    )
    .then((r) => r.request);

export const getIncomingFriendRequests = () =>
  api.get<{ requests: IncomingFriendRequest[] }>('/chat/friend-requests').then((r) => r.requests);

export const respondFriendRequest = (id: string, status: 'ACCEPTED' | 'REJECTED') =>
  api.patch<{ ok: boolean }>(`/chat/friend-requests/${encodeURIComponent(id)}`, { status }).then(() => true);

export const updatePresence = (activity: string) =>
  api.put<{ ok: boolean }>('/chat/presence', { activity }).then(() => true);

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

/** `invitees` aceita somente códigos de usuário. */
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