import type { Request, Response } from 'express';
import { avatarSchema, displayNameSchema, privacySchema } from '../validators/profile.validator';
import { clearAvatar, getProfile, setAvatar, setDisplayName, setPrivacy } from '../services/profile.service';

export async function show(req: Request, res: Response) {
  res.json({ profile: await getProfile(req.user!.id) });
}

export async function avatar(req: Request, res: Response) {
  const { dataUrl } = avatarSchema.parse(req.body);
  res.json({ profile: await setAvatar(req, req.user!.id, dataUrl) });
}

export async function avatarRemove(req: Request, res: Response) {
  res.json({ profile: await clearAvatar(req, req.user!.id) });
}

export async function displayName(req: Request, res: Response) {
  const parsed = displayNameSchema.parse(req.body);
  res.json({ profile: await setDisplayName(req, req.user!.id, parsed.displayName) });
}

export async function privacy(req: Request, res: Response) {
  const parsed = privacySchema.parse(req.body);
  res.json({ profile: await setPrivacy(req, req.user!.id, parsed) });
}