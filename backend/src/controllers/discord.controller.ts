import type { Request, Response } from 'express';
import { z } from 'zod';
import * as discord from '../services/integrations/discord.service';
import { logAudit } from '../services/audit.service';

const discordId = z.string().regex(/^\d{5,25}$/, 'ID do Discord inválido');

/* ── Usuário logado no Sano (Ajustes) ── */

export async function status(req: Request, res: Response) {
  res.json(await discord.linkStatus(req.user!.id));
}

export async function linkCode(req: Request, res: Response) {
  const result = await discord.createLinkCode(req.user!.id);
  await logAudit(req, 'DISCORD_LINK_CODE', req.user!.id);
  res.status(201).json(result);
}

export async function unlink(req: Request, res: Response) {
  await discord.unlinkUser(req.user!.id);
  await logAudit(req, 'DISCORD_UNLINKED', req.user!.id);
  res.json({ ok: true });
}

/* ── SanoBot (token Bearer) ── */

const linkSchema = z.object({
  code: z.string().trim().min(4).max(12),
  discordId,
  discordUsername: z.string().max(100).optional(),
});
const commandSchema = z.object({ discordId, message: z.string().trim().min(1).max(500) });
const unlinkSchema = z.object({ discordId });

export async function botLink(req: Request, res: Response) {
  const input = linkSchema.parse(req.body);
  res.json(await discord.linkWithCode(input.code, input.discordId, input.discordUsername));
}

export async function botUnlink(req: Request, res: Response) {
  res.json(await discord.unlinkDiscord(unlinkSchema.parse(req.body).discordId));
}

export async function botCommand(req: Request, res: Response) {
  const input = commandSchema.parse(req.body);
  res.json(await discord.runCommand(input.discordId, input.message));
}

export async function botReminders(_req: Request, res: Response) {
  res.json({ reminders: await discord.dueDiscordReminders() });
}
