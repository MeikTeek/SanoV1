import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { verifyToken, type TokenPurpose } from '../utils/jwt';
import { COOKIE_PRE_AUTH, COOKIE_SESSION } from '../utils/cookies';

async function loadUser(req: Request, cookie: string, purpose: TokenPurpose) {
  const token = req.cookies?.[cookie];
  if (!token) throw new AppError(401, 'Não autenticado');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(401, 'Sessão inválida ou expirada');
  }
  if (payload.purpose !== purpose) throw new AppError(401, 'Token inválido');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active || user.tokenVersion !== payload.tv) {
    throw new AppError(401, 'Sessão inválida ou expirada');
  }
  return user;
}

/** Etapa intermediária: senha correta, falta trocar senha / configurar ou validar 2FA. */
export async function requirePreAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = await loadUser(req, COOKIE_PRE_AUTH, 'pre_auth');
  next();
}

/** Sessão completa (senha + 2FA). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await loadUser(req, COOKIE_SESSION, 'session');
  if (user.mustChangePassword || !user.twoFactorEnabled) throw new AppError(403, 'Cadastro incompleto');
  req.user = user;
  next();
}

export const requireRole =
  (role: 'ADMIN' | 'USER') => (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) throw new AppError(403, 'Acesso negado');
    next();
  };
