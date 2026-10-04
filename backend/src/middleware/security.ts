import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/** Proteção CSRF extra: métodos que alteram dados só aceitos se a Origin for a do frontend. */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || origin !== new URL(env.FRONTEND_URL).origin) {
    throw new AppError(403, 'Origem não permitida');
  }
  next();
}

// Em `NODE_ENV=test` os limites são desligados: a suíte de integração faz
// dezenas de chamadas por segundo e esbarraria no teto do rate limit, medindo
// o limiter em vez do módulo. A proteção real é exercitada por unidade.
const isTest = env.NODE_ENV === 'test';

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
  skip: () => isTest,
});

/** Comandos do Sano: mais tolerante que o login, mas ainda limitado a 30/min por IP. */
export const commandLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Calma! Muitos comandos em pouco tempo.' },
  skip: () => isTest,
});

/** Envio de mensagens e criação de grupos: 60/min por IP. */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Calma! Muitas mensagens em pouco tempo.' },
  skip: () => isTest,
});

/**
 * Busca pelo código de 8 caracteres: teto bem mais baixo (10/15 min). É a
 * porta que transforma um código em conversa, então precisa ser cara.
 */
export const numberLookupLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas buscas de código. Tente novamente em alguns minutos.' },
  skip: () => isTest,
});
