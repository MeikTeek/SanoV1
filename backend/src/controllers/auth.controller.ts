import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { hashPassword } from '../utils/password';
import { signToken, PRE_AUTH_TTL, SESSION_TTL } from '../utils/jwt';
import { setCookie, clearAuthCookies, COOKIE_PRE_AUTH, COOKIE_SESSION } from '../utils/cookies';
import { loginSchema, changePasswordSchema } from '../validators/auth.validator';
import { authenticate } from '../services/auth.service';
import { logAudit } from '../services/audit.service';

const publicUser = (u: User) => ({
  id: u.id,
  username: u.username,
  // Nome de exibição e avatar são opcionais; o username continua sendo a identidade de login.
  displayName: u.displayName ?? null,
  avatarDataUrl: u.avatarDataUrl ?? null,
  role: u.role,
  twoFactorEnabled: u.twoFactorEnabled,
  lastLoginAt: u.lastLoginAt,
});

async function issueSession(req: Request, res: Response, u: User) {
  const user = await prisma.user.update({
    where: { id: u.id },
    data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
  });
  res.clearCookie(COOKIE_PRE_AUTH);
  setCookie(res, COOKIE_SESSION, signToken({ sub: user.id, purpose: 'session', tv: user.tokenVersion }, SESSION_TTL), SESSION_TTL);
  await logAudit(req, 'LOGIN_SUCCESS', user.id);
  return user;
}

export async function login(req: Request, res: Response) {
  const { username, password } = loginSchema.parse(req.body);
  const user = await authenticate(username, password, req);
  if (user.mustChangePassword) {
    setCookie(res, COOKIE_PRE_AUTH, signToken({ sub: user.id, purpose: 'pre_auth', tv: user.tokenVersion }, PRE_AUTH_TTL), PRE_AUTH_TTL);
    return res.json({ step: 'CHANGE_PASSWORD' as const });
  }
  res.json({ user: publicUser(await issueSession(req, res, user)) });
}

export async function changePassword(req: Request, res: Response) {
  const { newPassword } = changePasswordSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });
  await logAudit(req, 'PASSWORD_CHANGED', user.id);
  res.json({ user: publicUser(await issueSession(req, res, user)) });
}

export async function logout(req: Request, res: Response) {
  await logAudit(req, 'LOGOUT', req.user?.id);
  clearAuthCookies(res);
  res.json({ ok: true });
}

export function me(req: Request, res: Response) {
  res.json({ user: publicUser(req.user!) });
}
