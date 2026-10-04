/**
 * Perfis públicos no estilo rede social (Instagram): bio, seguidores e
 * seguindo.
 *
 * O perfil expõe apenas o que o usuário controla (displayName, avatar, bio) —
 * nunca hash de senha, segredo 2FA ou flags além do rótulo de papel.
 */
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';

export const MAX_BIO_LENGTH = 280;

const publicSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarDataUrl: true,
  bio: true,
  chatPublicKey: true,
  createdAt: true,
} as const;

export interface SocialProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  bio: string | null;
  createdAt: string;
  /** Chave pública E2EE: o cliente precisa dela para cifrar mensagens. */
  publicKey: string | null;
  followersCount: number;
  followingCount: number;
  /** Se quem está vendo já segue essa pessoa (null no próprio perfil). */
  isFollowing: boolean | null;
  /** A pessoa segue de volta — usado para o selo "segue você". */
  followsYou: boolean;
  isSelf: boolean;
}

/** Item do diretório: o mesmo perfil, com `isFollowing` já resolvido. */
export interface DirectoryEntry {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  bio: string | null;
  createdAt: string;
  publicKey: string | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

/** Item das listas de seguidores/seguindo. */
export interface RelationEntry {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  bio: string | null;
  publicKey: string | null;
  isSelf: boolean;
  isFollowing: boolean | null;
}

/** Perfil de uma pessoa, com os contadores calculados para `viewerId`. */
export async function getProfileByUsername(username: string, viewerId: string): Promise<SocialProfile> {
  const row = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { ...publicSelect, _count: { select: { followers: true } } },
  });
  if (!row) throw new AppError(404, 'Usuário não encontrado');

  // Três contagens em paralelo: quantos ele segue, se eu sigo, se ele me segue.
  const [followingCount, iFollow, theyFollow] = await Promise.all([
    prisma.follow.count({ where: { followerId: row.id } }),
    prisma.follow.count({ where: { followerId: viewerId, followingId: row.id } }),
    prisma.follow.count({ where: { followerId: row.id, followingId: viewerId } }),
  ]);

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarDataUrl: row.avatarDataUrl,
    bio: row.bio,
    createdAt: row.createdAt.toISOString(),
    publicKey: row.chatPublicKey,
    followersCount: row._count.followers,
    followingCount,
    isFollowing: viewerId === row.id ? null : iFollow > 0,
    followsYou: theyFollow > 0,
    isSelf: viewerId === row.id,
  };
}
/**
 * Diretório de pessoas: quem o usuário já segue aparece primeiro, depois os
 * demais. A busca por nome deixa achar alguém rápido.
 */
export async function listProfiles(
  viewerId: string,
  opts: { search?: string; limit?: number } = {},
): Promise<DirectoryEntry[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const search = opts.search?.trim();

  const users = await prisma.user.findMany({
    where: {
      active: true,
      id: { not: viewerId },
      ...(search
        ? {
            OR: [
              { username: { contains: search.toLowerCase() } },
              { displayName: { contains: search, mode: 'insensitive' as const } },
              { bio: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      ...publicSelect,
      _count: { select: { followers: true } },
      // Quem o usuário segue. O nome da relação no model User é `following`
      // (o lado `Follow.follower`), então é aqui que se filtra por viewerId.
      following: { where: { followerId: viewerId }, select: { followingId: true } },
    },
    take: limit,
  });

  // `followingCount` de cada um numa consulta só, para não fazer N+1.
  const grouped = users.length
    ? await prisma.follow.groupBy({
        by: ['followingId'],
        where: { followingId: { in: users.map((u) => u.id) } },
        _count: true,
      })
    : [];
  const countBy = new Map(grouped.map((c) => [c.followingId, c._count]));

  const entries: DirectoryEntry[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarDataUrl: u.avatarDataUrl,
    bio: u.bio,
    createdAt: u.createdAt.toISOString(),
    publicKey: u.chatPublicKey,
    followersCount: u._count.followers,
    followingCount: countBy.get(u.id) ?? 0,
    isFollowing: u.following.length > 0,
  }));

  return entries.sort(
    (a, b) => Number(b.isFollowing) - Number(a.isFollowing) || a.followersCount - b.followersCount,
  );
}
/** Atualiza a bio. Texto vazio limpa o campo (vira `null` no banco). */
export async function updateBio(userId: string, bio: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: { bio: bio?.trim() ? bio.trim() : null },
    select: { bio: true, displayName: true, avatarDataUrl: true },
  });
}

/** Registra a chave pública E2EE gerada no navegador (SPKI em base64). */
export async function setPublicKey(userId: string, publicKey: string) {
  await prisma.user.update({ where: { id: userId }, data: { chatPublicKey: publicKey } });
}

/** Seguir. O `upsert` torna a operação idempotente (cliques repetidos). */
export async function follow(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw new AppError(400, 'Você não pode seguir a si mesmo');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { active: true } });
  if (!target?.active) throw new AppError(404, 'Usuário não encontrado');

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
    create: { followerId: viewerId, followingId: targetId },
    update: {},
  });
}

export async function unfollow(viewerId: string, targetId: string) {
  await prisma.follow.deleteMany({ where: { followerId: viewerId, followingId: targetId } });
}

/** Listas de seguidores/seguindo, com os dados públicos e o estado do botão. */
export async function listFollowers(
  targetId: string,
  viewerId: string,
  direction: 'followers' | 'following',
): Promise<RelationEntry[]> {
  const rows = await prisma.follow.findMany({
    where: direction === 'followers' ? { followingId: targetId } : { followerId: targetId },
    select: { follower: { select: publicSelect }, following: { select: publicSelect } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const users = rows.map((r) => (direction === 'followers' ? r.follower : r.following));
  const followed = users.length
    ? await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: users.map((u) => u.id) } },
        select: { followingId: true },
      })
    : [];
  const isFollowing = new Set(followed.map((f) => f.followingId));

  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarDataUrl: u.avatarDataUrl,
    bio: u.bio,
    publicKey: u.chatPublicKey,
    isSelf: u.id === viewerId,
    isFollowing: u.id === viewerId ? null : isFollowing.has(u.id),
  }));
}