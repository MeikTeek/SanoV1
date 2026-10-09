import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isAllowedOrigin, normalizeOrigin } from '../config/env';
import { AppError } from '../utils/errors';

/** Proteção CSRF extra: métodos que alteram dados só aceitos se a Origin for a do frontend. */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();

  const originHeader = req.get('origin') ?? req.get('referer');
  const requestOrigin = (() => {
    const host = req.get('host');
    if (!host) return null;
    const protoHeader = req.get('x-forwarded-proto');
    const proto = (protoHeader ?? (req.secure ? 'https' : 'http')).split(',')[0].trim();
    return normalizeOrigin(`${proto}://${host}`);
  })();

  if (originHeader) {
    const normalized = normalizeOrigin(originHeader);
    if (normalized && (isAllowedOrigin(normalized) || normalized === requestOrigin)) return next();
  } else if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    return next();
  }

  return next(new AppError(403, 'Origem não permitida para esta operação. Revise FRONTEND_URL e FRONTEND_URLS no ambiente do deploy.'));
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
