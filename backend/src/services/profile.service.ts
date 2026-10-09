/**
 * Perfil do usuário: foto e nome de exibição.
 *
 * Regras de segurança/troca:
 * - Avatar guardado como data URL (base64). Evita storage externo e funciona em
 *   qualquer deploy; o tamanho é limitado para não inchar o banco.
 * - O nome de exibição só pode ser trocado a cada 60 dias (`nameChangedAt`).
 *   O `username` (login) nunca muda — é a identidade de acesso.
 */
import type { Request } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { logAudit } from './audit.service';

/** 60 dias ≈ "uma vez a cada 2 meses". */
export const NAME_CHANGE_COOLDOWN_DAYS = 60;

/** 512 KB de base64 ≈ 384 KB de imagem — folgado para um avatar. */
export const MAX_AVATAR_BYTES = 512 * 1024;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Só PNG/JPEG/WEBP/GIF. O mime é declarado pelo cliente, então checamos o "magic bytes". */
function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  return null;
}

export interface ProfileView {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  role: string;
  canChangeName: boolean;
  /** Dias restantes até liberar a próxima troca de nome. */
  nameChangeAvailableInDays: number;
  nameChangedAt: string | null;
  showOnlineStatus: boolean;
  showActivityStatus: boolean;
}

export function profileView(u: {
  id: string; username: string; displayName: string | null; avatarDataUrl: string | null;
  role: string; nameChangedAt: Date | null; showOnlineStatus: boolean; showActivityStatus: boolean;
}): ProfileView {
  const elapsed = u.nameChangedAt ? Date.now() - u.nameChangedAt.getTime() : Infinity;
  const cooldownMs = NAME_CHANGE_COOLDOWN_DAYS * 86_400_000;
  const remaining = Math.max(0, cooldownMs - elapsed);
  const canChangeName = remaining === 0;

  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarDataUrl: u.avatarDataUrl,
    role: u.role,
    canChangeName,
    nameChangeAvailableInDays: canChangeName ? 0 : Math.ceil(remaining / 86_400_000),
    nameChangedAt: u.nameChangedAt?.toISOString() ?? null,
    showOnlineStatus: u.showOnlineStatus,
    showActivityStatus: u.showActivityStatus,
  };
}

const select = {
  id: true, username: true, displayName: true, avatarDataUrl: true, role: true, nameChangedAt: true,
  showOnlineStatus: true, showActivityStatus: true,
} as const;

export async function getProfile(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select });
  return profileView(u);
}

/** Avatar: data URL com o mime validado pelos bytes reais, nunca pelo cabeçalho enviado. */
export async function setAvatar(req: Request, userId: string, dataUrl: string) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) throw new AppError(400, 'Arquivo de imagem inválido');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new AppError(400, 'Arquivo de imagem vazio');
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new AppError(413, 'Imagem muito grande — use até 400 KB');
  }

  const mime = sniffImage(buffer);
  if (!mime || !ALLOWED_MIME.has(mime)) {
    throw new AppError(400, 'Formato não suportado — use PNG, JPEG, WEBP ou GIF');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarDataUrl: `data:${mime};base64,${buffer.toString('base64')}` },
    select,
  });
  await logAudit(req, 'AVATAR_UPDATED', userId);
  return profileView(user);
}

export async function clearAvatar(req: Request, userId: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarDataUrl: null }, select });
  await logAudit(req, 'AVATAR_REMOVED', userId);
  return profileView(user);
}

/**
 * Troca do nome de exibição, limitada a uma vez por `NAME_CHANGE_COOLDOWN_DAYS`.
 * O nome de login (`username`) é intocado: é o que o admin controla.
 */
export async function setDisplayName(req: Request, userId: string, displayName: string) {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select });

  if (current.nameChangedAt) {
    const remaining = NAME_CHANGE_COOLDOWN_DAYS * 86_400_000 - (Date.now() - current.nameChangedAt.getTime());
    if (remaining > 0) {
      throw new AppError(429, `Você pode trocar o nome em ${Math.ceil(remaining / 86_400_000)} dias`);
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { displayName, nameChangedAt: new Date() },
    select,
  });
  await logAudit(req, 'DISPLAY_NAME_CHANGED', userId, { displayName });
  return profileView(user);
}

export async function setPrivacy(
  req: Request,
  userId: string,
  preferences: { showOnlineStatus: boolean; showActivityStatus: boolean },
) {
  const user = await prisma.user.update({ where: { id: userId }, data: preferences, select });
  await logAudit(req, 'PRIVACY_SETTINGS_UPDATED', userId, preferences);
  return profileView(user);
}