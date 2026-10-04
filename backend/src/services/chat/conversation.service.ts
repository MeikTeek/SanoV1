/**
 * Conversas diretas e grupos.
 *
 * Ponto central do módulo: o servidor NUNCA vê conteúdo. Ele valida quem pode
 * ler/gravar em cada conversa, guarda o `envelope` cifrado e o entrega. Texto,
 * imagem e áudio só são abertos no navegador, com a chave do usuário.
 */
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { resolveNumber } from './number.service';

export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_MEMBERS = 30;
/** Limite do blob cifrado por mensagem (~300 KB de mídia depois do base64). */
export const MAX_ENVELOPE_CHARS = 400_000;

const memberSelect = {
  id: true,
  role: true,
  lastReadAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarDataUrl: true,
      chatPublicKey: true,
    },
  },
} as const;

const conversationSelect = {
  id: true,
  kind: true,
  name: true,
  createdAt: true,
  lastMessageAt: true,
  members: { select: memberSelect },
} as const;

/** Chave estável e ordenada para garantir "uma DM por par de pessoas". */
const dmKeyFor = (a: string, b: string) => [a, b].sort().join(':');

async function assertMember(conversationId: string, userId: string) {
  const member = await prisma.chatMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, role: true },
  });
  if (!member) throw new AppError(403, 'Você não participa desta conversa');
  return member;
}

export interface ConversationMemberView {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  /** Chave pública E2EE: o cliente cifra para cada membro com esta chave. */
  publicKey: string | null;
  role: string;
}

/** Como o `memberSelect` entrega (ainda com o nome da coluna do banco). */
type MemberUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  chatPublicKey: string | null;
};

type MemberRow = {
  id: string;
  role: string;
  lastReadAt: Date;
  user: MemberUserRow;
};

export interface ConversationView {
  id: string;
  kind: 'DM' | 'GROUP';
  name: string | null;
  createdAt: string;
  lastMessageAt: string;
  members: ConversationMemberView[];
  /** Nome pronto para exibir (grupo ou o outro participante da DM). */
  title: string;
  subtitle: string | null;
  /** Membros que leram depois de mim — sinaliza atividade nova. */
  unread: number;
}

type ConversationRow = {
  id: string;
  kind: string;
  name: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  members: MemberRow[];
};

function toView(c: ConversationRow, userId: string): ConversationView {
  const others = c.members.filter((m) => m.user.id !== userId);
  const me = c.members.find((m) => m.user.id === userId);
  const myReadAt = me?.lastReadAt ?? new Date(0);

  return {
    id: c.id,
    kind: c.kind as 'DM' | 'GROUP',
    name: c.name,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
    title: c.kind === 'GROUP'
      ? c.name ?? 'Grupo'
      : others[0]?.user.displayName || others[0]?.user.username || 'Conversa',
    subtitle: c.kind === 'GROUP'
      ? others.map((m) => m.user.displayName || m.user.username).join(', ')
      : (others[0] ? `@${others[0].user.username}` : null),
    members: c.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarDataUrl: m.user.avatarDataUrl,
      publicKey: m.user.chatPublicKey,
      role: m.role,
    })),
    unread: c.members.filter((m) => m.lastReadAt > myReadAt).length,
  };
}

/** Lista as conversas do usuário, mais recentes primeiro. */
export async function listConversations(userId: string): Promise<ConversationView[]> {
  const rows = await prisma.chatConversation.findMany({
    where: { members: { some: { userId } } },
    orderBy: { lastMessageAt: 'desc' },
    select: conversationSelect,
  });
  return rows.map((c) => toView(c, userId));
}

export async function getConversation(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  const row = await prisma.chatConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: conversationSelect,
  });
  return toView(row, userId);
}

/**
 * Abre (ou reaproveita) a conversa direta com a pessoa do código-digitado.
 * `viewerId` é quem digitou.
 */
export async function openDirectByNumber(viewerId: string, input: string) {
  const user = await resolveNumber(input);
  if (user.id === viewerId) throw new AppError(400, 'Esse é o seu próprio código');

  const dmKey = dmKeyFor(viewerId, user.id);
  const existing = await prisma.chatConversation.findUnique({ where: { dmKey } });
  if (existing) return getConversation(existing.id, viewerId);

  const created = await prisma.chatConversation.create({
    data: {
      kind: 'DM',
      dmKey,
      createdById: viewerId,
      members: { create: [{ userId: viewerId, role: 'OWNER' }, { userId: user.id, role: 'MEMBER' }] },
    },
    select: { id: true },
  });
  return getConversation(created.id, viewerId);
}

/** Abre (ou reaproveita) a DM direta com alguém escolhido no diretório. */
export async function openDirectByUser(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw new AppError(400, 'Você não pode conversar consigo mesmo');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { active: true } });
  if (!target?.active) throw new AppError(404, 'Usuário não encontrado');

  const dmKey = dmKeyFor(viewerId, targetId);
  const existing = await prisma.chatConversation.findUnique({ where: { dmKey } });
  if (existing) return getConversation(existing.id, viewerId);

  const created = await prisma.chatConversation.create({
    data: {
      kind: 'DM',
      dmKey,
      createdById: viewerId,
      members: { create: [{ userId: viewerId, role: 'OWNER' }, { userId: targetId, role: 'MEMBER' }] },
    },
    select: { id: true },
  });
  return getConversation(created.id, viewerId);
}
/**
 * Resolve a lista de pessoas convidadas. Cada item pode ser um `@username` ou
 * um código de 8 caracteres — quem convida costuma ter o código do outro lado.
 */
export async function resolveInvitees(inputs: string[]) {
  const ids: string[] = [];

  for (const raw of inputs) {
    const value = raw.trim().replace(/^@/, '');
    if (!value) continue;

    const byUsername = await prisma.user.findUnique({
      where: { username: value.toLowerCase() },
      select: { id: true, active: true },
    });
    if (byUsername?.active) {
      if (!ids.includes(byUsername.id)) ids.push(byUsername.id);
      continue;
    }

    // Não é username: tenta como número (o normalizador rejeita formato ruim).
    const user = await resolveNumber(value);
    if (!ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

/** Cria um grupo. O criador vira OWNER e sempre é membro. */
export async function createGroup(viewerId: string, name: string, invitees: string[]) {
  const ids = (await resolveInvitees(invitees)).filter((id) => id !== viewerId);
  if (ids.length === 0) {
    throw new AppError(400, 'Ninguém para convidar — informe @usuário ou um código');
  }

  const created = await prisma.chatConversation.create({
    data: {
      kind: 'GROUP',
      name: name.trim(),
      createdById: viewerId,
      members: {
        create: [
          { userId: viewerId, role: 'OWNER' },
          ...ids.map((userId) => ({ userId, role: 'MEMBER' })),
        ],
      },
    },
    select: { id: true },
  });
  return getConversation(created.id, viewerId);
}

/** Adiciona alguém a um grupo existente. Só o dono pode. */
export async function addToGroup(conversationId: string, actorId: string, inviteeId: string) {
  const actor = await assertMember(conversationId, actorId);
  if (actor.role !== 'OWNER') throw new AppError(403, 'Só o dono do grupo pode convidar');

  const target = await prisma.user.findUnique({ where: { id: inviteeId }, select: { active: true } });
  if (!target?.active) throw new AppError(404, 'Usuário não encontrado');

  await prisma.chatMember.upsert({
    where: { conversationId_userId: { conversationId, userId: inviteeId } },
    create: { conversationId, userId: inviteeId },
    update: {},
  });
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  kind: 'TEXT' | 'IMAGE' | 'AUDIO';
  /** Blob cifrado. Só o navegador com a chave certa abre. */
  envelope: unknown;
  /** Metadados não sensíveis (tipo, tamanho, duração, mime da mídia). */
  meta: Record<string, unknown> | null;
  createdAt: string;
  mine: boolean;
}

/**
 * Histórico da conversa. `before` faz paginação para trás (carregar mais).
 */
export async function listMessages(
  conversationId: string,
  userId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<MessageView[]> {
  await assertMember(conversationId, userId);

  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 100),
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      kind: true,
      envelope: true,
      meta: true,
      createdAt: true,
      sender: { select: { username: true, displayName: true, avatarDataUrl: true } },
    },
  });

  // Mais antiga primeiro, como na tela.
  return rows.reverse().map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.sender.displayName || m.sender.username,
    senderAvatar: m.sender.avatarDataUrl,
    kind: m.kind as 'TEXT' | 'IMAGE' | 'AUDIO',
    envelope: m.envelope,
    meta: (m.meta ?? null) as Record<string, unknown> | null,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === userId,
  }));
}
export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  clientId?: string;
  kind: 'TEXT' | 'IMAGE' | 'AUDIO';
  envelope: unknown;
  meta?: Record<string, unknown> | null;
}

/**
 * Grava a mensagem já cifrada. Duas checagens importam:
 * - o remetente precisa ser membro da conversa;
 * - o envelope precisa ter uma cópia cifrada para CADA membro (inclusive o
 *   próprio), senão alguém ficaria sem conseguir ler.
 */
export async function sendMessage(input: SendMessageInput): Promise<MessageView> {
  const { conversationId, senderId, clientId, kind, envelope, meta } = input;
  await assertMember(conversationId, senderId);

  const serialized = JSON.stringify(envelope ?? {});
  if (serialized.length > MAX_ENVELOPE_CHARS) {
    throw new AppError(413, 'Arquivo muito grande — envie algo menor');
  }

  const members = await prisma.chatMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const copies = (envelope as { copies?: Record<string, unknown> } | null)?.copies ?? {};
  if (members.some((m) => !copies[m.userId])) {
    throw new AppError(400, 'Mensagem incompleta — falta a cópia cifrada de um participante');
  }

  const data = {
    conversationId,
    senderId,
    kind,
    envelope: envelope as object,
    meta: (meta ?? undefined) as object | undefined,
  };

  // `clientId` torna o envio idempotente: retentativa devolve a mesma mensagem.
  const message = clientId
    ? await prisma.chatMessage.upsert({
        where: { senderId_clientId: { senderId, clientId } },
        create: { ...data, clientId },
        update: {},
      })
    : await prisma.chatMessage.create({ data });

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });

  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: senderId },
    select: { username: true, displayName: true, avatarDataUrl: true },
  });

  return {
    id: message.id,
    conversationId,
    senderId,
    senderName: sender.displayName || sender.username,
    senderAvatar: sender.avatarDataUrl,
    kind,
    envelope: message.envelope,
    meta: (message.meta ?? null) as Record<string, unknown> | null,
    createdAt: message.createdAt.toISOString(),
    mine: true,
  };
}

/** Marca a conversa como lida até agora. */
export async function markRead(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  await prisma.chatMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Sai de um grupo. Em DM não faz sentido — não há como "sair" da conversa. */
export async function leaveGroup(conversationId: string, userId: string) {
  const member = await assertMember(conversationId, userId);
  const conversation = await prisma.chatConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { kind: true },
  });
  if (conversation.kind !== 'GROUP') {
    throw new AppError(400, 'Não é possível sair de uma conversa direta');
  }
  await prisma.chatMember.delete({ where: { id: member.id } });
}