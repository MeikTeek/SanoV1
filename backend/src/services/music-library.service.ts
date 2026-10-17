import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { deleteMusicObject, getMusicObject, putMusicObject, signMusicObject } from './music-share.service';

const MAX_AUDIO_SIZE = 500 * 1024 * 1024;

const selectTrack = {
  id: true,
  title: true,
  artist: true,
  album: true,
  genre: true,
  mood: true,
  duration: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

function validateSize(size: number) {
  if (!Number.isInteger(size) || size <= 0 || size > MAX_AUDIO_SIZE) {
    throw new AppError(400, 'A música deve ter entre 1 byte e 500 MB.');
  }
}

export async function listMusicTracks(ownerId: string) {
  const tracks = await prisma.musicTrack.findMany({
    where: { ownerId, status: 'READY' },
    orderBy: { createdAt: 'desc' },
    select: selectTrack,
  });
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = [track.title, track.artist, track.album, track.fileName].map((value) => String(value).trim().toLocaleLowerCase()).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function createMusicTrack(ownerId: string, input: {
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
  duration?: number;
  fileName: string;
  mimeType: string;
  size: number;
}) {
  validateSize(input.size);
  if (!input.fileName.trim() || input.fileName.length > 255) throw new AppError(400, 'Nome de arquivo inválido.');
  const track = await prisma.musicTrack.create({
    data: {
      ownerId,
      title: input.title.trim().slice(0, 200),
      artist: input.artist.trim().slice(0, 200),
      album: input.album.trim().slice(0, 200),
      genre: input.genre.trim().slice(0, 100),
      mood: input.mood.trim().slice(0, 100),
      duration: input.duration && Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0,
      fileName: input.fileName.trim(),
      mimeType: input.mimeType.trim() || 'application/octet-stream',
      size: input.size,
      objectKey: `music-library/${ownerId}/${randomUUID()}-${input.fileName.replace(/[^\w.-]+/g, '_')}`,
    },
    select: selectTrack,
  });
  return track;
}

export async function uploadMusicTrack(ownerId: string, id: string, body: Buffer) {
  if (!body.length || body.length > MAX_AUDIO_SIZE) throw new AppError(400, 'A música deve ter entre 1 byte e 500 MB.');
  const track = await prisma.musicTrack.findFirst({ where: { id, ownerId, status: 'PENDING' } });
  if (!track) throw new AppError(404, 'Música não encontrada ou já enviada.');
  if (body.length !== track.size) throw new AppError(400, 'O tamanho enviado não corresponde ao arquivo informado.');
  try {
    await putMusicObject(track.objectKey, body, track.mimeType);
    return prisma.musicTrack.update({ where: { id }, data: { status: 'READY' }, select: selectTrack });
  } catch (error) {
    await prisma.musicTrack.delete({ where: { id } }).catch(() => undefined);
    throw error;
  }
}

export async function getMusicDownload(ownerId: string, id: string) {
  const track = await prisma.musicTrack.findFirst({ where: { id, ownerId, status: 'READY' } });
  if (!track) throw new AppError(404, 'Música não encontrada.');
  return { downloadUrl: await signMusicObject(track.objectKey, track.fileName, track.mimeType), fileName: track.fileName };
}

export async function streamMusicTrack(ownerId: string, id: string) {
  const track = await prisma.musicTrack.findFirst({ where: { id, ownerId, status: 'READY' } });
  if (!track) throw new AppError(404, 'Música não encontrada.');
  return { track, object: await getMusicObject(track.objectKey) };
}

export async function updateMusicTrack(ownerId: string, id: string, input: {
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
}) {
  const track = await prisma.musicTrack.findFirst({ where: { id, ownerId, status: 'READY' } });
  if (!track) throw new AppError(404, 'Música não encontrada.');
  return prisma.musicTrack.update({
    where: { id },
    data: {
      title: input.title.trim().slice(0, 200),
      artist: input.artist.trim().slice(0, 200),
      album: input.album.trim().slice(0, 200),
      genre: input.genre.trim().slice(0, 100),
      mood: input.mood.trim().slice(0, 100),
    },
    select: selectTrack,
  });
}

export async function removeMusicTrack(ownerId: string, id: string) {
  const track = await prisma.musicTrack.findFirst({ where: { id, ownerId } });
  if (!track) throw new AppError(404, 'Música não encontrada.');
  await deleteMusicObject(track.objectKey);
  await prisma.musicTrack.delete({ where: { id } });
}
