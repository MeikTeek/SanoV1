import type { Request, Response } from 'express';
import { z } from 'zod';
import { claimShare, createShare, finalizeShare, getMusicStorageStatus, normalizeShareCode, uploadShare } from '../services/music-share.service';
import { createMusicTrack, getMusicDownload, listMusicTracks, removeMusicTrack, streamMusicTrack, toggleMusicFavorite, updateMusicTrack, uploadMusicTrack } from '../services/music-library.service';
import { Readable } from 'node:stream';
import { AppError } from '../utils/errors';

const createSchema = z.object({ size: z.number().int().positive() });
const idSchema = z.object({ id: z.string().uuid() });
const codeSchema = z.object({
  code: z.string().transform(normalizeShareCode).pipe(z.string().regex(/^[0-9A-F]{10}$/, 'Informe um código de 10 caracteres hexadecimais.')),
});
const trackSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200),
  album: z.string().trim().max(200),
  genre: z.string().trim().max(100),
  mood: z.string().trim().max(100),
  coverDataUrl: z.string().max(2_000_000).optional(),
  duration: z.number().finite().nonnegative().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(100).default('application/octet-stream'),
  size: z.number().int().positive(),
});

export async function create(req: Request, res: Response) {
  const { size } = createSchema.parse(req.body);
  res.status(201).json(await createShare(req.user!.id, size));
}

export async function finalize(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  await finalizeShare(req.user!.id, id);
  res.status(204).send();
}

export async function upload(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Envie um pacote ZIP.');
  await uploadShare(req.user!.id, id, req.body);
  res.status(204).send();
}

export async function claim(req: Request, res: Response) {
  const { code } = codeSchema.parse(req.body);
  res.json(await claimShare(code));
}

export function storageStatus(_req: Request, res: Response) {
  res.json(getMusicStorageStatus());
}

export async function library(req: Request, res: Response) {
  res.json(await listMusicTracks(req.user!.id));
}

export async function createTrack(req: Request, res: Response) {
  res.status(201).json(await createMusicTrack(req.user!.id, trackSchema.parse(req.body)));
}

export async function uploadTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Envie um arquivo de áudio.');
  res.json(await uploadMusicTrack(req.user!.id, id, req.body));
}

export async function downloadTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  res.json(await getMusicDownload(req.user!.id, id));
}

export async function streamTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  const { track, object } = await streamMusicTrack(req.user!.id, id);
  if (!object.Body) throw new AppError(404, 'Arquivo da música não está disponível.');
  res.setHeader('Content-Type', track.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', String(track.size));
  res.setHeader('Content-Disposition', `inline; filename="${track.fileName.replace(/["\\\r\n]/g, '_')}"`);
  Readable.from(object.Body as AsyncIterable<Uint8Array>).pipe(res);
}

export async function updateTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  const input = trackSchema.pick({ title: true, artist: true, album: true, genre: true, mood: true }).extend({ favorite: z.boolean().optional() }).parse(req.body);
  res.json(await updateMusicTrack(req.user!.id, id, input));
}

export async function favoriteTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  res.json(await toggleMusicFavorite(req.user!.id, id));
}

export async function deleteTrack(req: Request, res: Response) {
  const { id } = idSchema.parse(req.params);
  await removeMusicTrack(req.user!.id, id);
  res.status(204).send();
}
