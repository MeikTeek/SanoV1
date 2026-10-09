import type { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';

const profileSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarDataUrl: true,
  bio: true,
  chatPublicKey: true,
  createdAt: true,
  showOnlineStatus: true,
  showActivityStatus: true,
  lastSeenAt: true,
  currentActivity: true,
} as const;

export type FriendshipState = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIEND' | 'REJECTED';
const pairKeyFor = (a: string, b: string) => [a, b].sort().join(':');

async function hasDirectConversation(firstId: string, secondId: string) {
  return Boolean(await prisma.chatConversation.findFirst({
    where: {
      kind: 'DM',
      members: { some: { userId: firstId } },
      AND: { members: { some: { userId: secondId } } },
      messages: { some: {} },
    },
    select: { id: true },
  }));
}

export async function getSocialProfile(username: string, viewerId: string) {
  const profile = await prisma.user.findUnique({
    where: { username: username.toLowerCase(), active: true },
    select: profileSelect,
  });
  if (!profile) throw new AppError(404, 'Usuário não encontrado');

  const isSelf = profile.id === viewerId;
  if (!isSelf && !(await hasDirectConversation(viewerId, profile.id))) {
    throw new AppError(404, 'Perfil disponível somente por uma conversa direta');
  }

  const request = isSelf ? null : await prisma.friendRequest.findUnique({
    where: { pairKey: pairKeyFor(viewerId, profile.id) },
    select: { id: true, requesterId: true, status: true },
  });

  let friendshipStatus: FriendshipState = 'NONE';
  if (request?.status === 'ACCEPTED') friendshipStatus = 'FRIEND';
  else if (request?.status === 'PENDING') {
    friendshipStatus = request.requesterId === viewerId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
  } else if (request?.status === 'REJECTED' && request.requesterId === viewerId) {
    friendshipStatus = 'REJECTED';
  }

  const canSeePresence = friendshipStatus === 'FRIEND';
  const recentlyActive = Boolean(profile.lastSeenAt && profile.lastSeenAt.getTime() > Date.now() - 90_000);
  const online = canSeePresence && profile.showOnlineStatus && recentlyActive;

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarDataUrl: profile.avatarDataUrl,
    bio: profile.bio,
    publicKey: profile.chatPublicKey,
    createdAt: profile.createdAt.toISOString(),
    isSelf,
    friendshipStatus,
    friendshipRequestId: request?.id ?? null,
    isOnline: canSeePresence && profile.showOnlineStatus ? online : null,
    activityStatus: canSeePresence && profile.showActivityStatus && recentlyActive ? profile.currentActivity : null,
  };
}

export async function requestFriendship(viewerId: string, username: string) {
  const target = await prisma.user.findUnique({
    where: { username: username.toLowerCase(), active: true },
    select: { id: true },
  });
  if (!target) throw new AppError(404, 'Usuário não encontrado');
  if (target.id === viewerId) throw new AppError(400, 'Você não pode adicionar a si mesmo');
  if (!(await hasDirectConversation(viewerId, target.id))) {
    throw new AppError(403, 'Uma conversa direta é necessária para pedir amizade');
  }

  const pairKey = pairKeyFor(viewerId, target.id);
  const existing = await prisma.friendRequest.findUnique({ where: { pairKey } });
  if (existing?.status === 'ACCEPTED') throw new AppError(409, 'Vocês já são amigos');
  if (existing?.status === 'PENDING') {
    if (existing.requesterId === viewerId) return { id: existing.id, status: existing.status };
    throw new AppError(409, 'Já existe um pedido de amizade pendente');
  }
  if (existing?.status === 'REJECTED') {
    if (existing.requesterId === viewerId) throw new AppError(409, 'Este pedido já foi recusado');
    const reopened = await prisma.friendRequest.update({
      where: { id: existing.id },
      data: { requesterId: viewerId, recipientId: target.id, status: 'PENDING' },
      select: { id: true, status: true },
    });
    return reopened;
  }

  const request = await prisma.friendRequest.upsert({
    where: { pairKey },
    create: { requesterId: viewerId, recipientId: target.id, pairKey },
    update: {},
    select: { id: true, requesterId: true, status: true },
  });
  if (request.status === 'PENDING' && request.requesterId === viewerId) {
    return { id: request.id, status: request.status };
  }
  if (request.status === 'ACCEPTED') throw new AppError(409, 'Vocês já são amigos');
  throw new AppError(409, 'Já existe um pedido de amizade pendente');
}

export async function listIncomingFriendRequests(userId: string) {
  return prisma.friendRequest.findMany({
    where: { recipientId: userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      requester: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
    },
  });
}

export async function respondFriendRequest(
  userId: string,
  requestId: string,
  status: Extract<FriendRequestStatus, 'ACCEPTED' | 'REJECTED'>,
) {
  const result = await prisma.friendRequest.updateMany({
    where: { id: requestId, recipientId: userId, status: 'PENDING' },
    data: { status },
  });
  if (result.count === 0) throw new AppError(404, 'Pedido de amizade não encontrado ou já respondido');
}

export async function updatePresence(userId: string, activity: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date(), currentActivity: activity },
  });
}
