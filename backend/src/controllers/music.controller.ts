import type { Request, Response } from 'express';
import { z } from 'zod';
import { claimShare, createShare, finalizeShare, getMusicStorageStatus, uploadShare } from '../services/music-share.service';
import { AppError } from '../utils/errors';

const createSchema = z.object({ size: z.number().int().positive() });
const idSchema = z.object({ id: z.string().uuid() });
const codeSchema = z.object({ code: z.string().trim().min(8).max(20) });

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
