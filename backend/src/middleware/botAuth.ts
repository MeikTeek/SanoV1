import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/**
 * Autentica o SanoBot (servidor → servidor) pelo header
 * `Authorization: Bearer <DISCORD_BOT_SECRET>`. Comparação em tempo constante.
 *
 * Não há cookie aqui, então a checagem de Origin (anti-CSRF) não se aplica —
 * ela é pulada para estas rotas em `originCheck`.
 */
export function requireBot(req: Request, _res: Response, next: NextFunction) {
  const secret = env.DISCORD_BOT_SECRET;
  if (!secret) throw new AppError(503, 'Integração com o Discord desativada no servidor.');
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError(401, 'Bot não autorizado.');
  next();
}

/** Caminho das rotas do bot (autenticadas por token, não por cookie). */
export const BOT_PATH_PREFIX = '/api/integrations/discord/bot/';
