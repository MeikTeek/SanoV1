import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { hashPassword } from '../utils/password';
import { signToken, PRE_AUTH_TTL, SESSION_TTL } from '../utils/jwt';
import { setCookie, clearAuthCookies, COOKIE_PRE_AUTH, COOKIE_SESSION } from '../utils/cookies';
import { loginSchema, changePasswordSchema, totpSchema } from '../validators/auth.validator';
import { authenticate, nextStep, registerFailure } from '../services/auth.service';
import { generateTwoFactorSetup, verifyTotp } from '../services/twofactor.service';
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

const issuePreAuth = (res: Response, u: User) =>
  setCookie(res, COOKIE_PRE_AUTH, signToken({ sub: u.id, purpose: 'pre_auth', tv: u.tokenVersion }, PRE_AUTH_TTL), PRE_AUTH_TTL);

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

/** Passo 1: usuário + senha. Devolve qual é o próximo passo. */
export async function login(req: Request, res: Response) {
  const { username, password } = loginSchema.parse(req.body);
  const user = await authenticate(username, password, req);
  issuePreAuth(res, user);
  res.json({ step: nextStep(user) });
}

/** Passo 2 (primeiro acesso): trocar a senha temporária. */
export async function changePassword(req: Request, res: Response) {
  const { newPassword } = changePasswordSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      tokenVersion: { increment: 1 }, // invalida tokens antigos
    },
  });
  issuePreAuth(res, user);
  await logAudit(req, 'PASSWORD_CHANGED', user.id);
  res.json({ step: nextStep(user) });
}

/** Passo 3 (primeiro acesso): gerar QR Code do 2FA. */
export async function setupTwoFactor(req: Request, res: Response) {
  const user = req.user!;
  if (user.mustChangePassword) throw new AppError(403, 'Troque a senha primeiro');
  if (user.twoFactorEnabled) throw new AppError(409, '2FA já ativado');
  res.json(await generateTwoFactorSetup(user));
}

/** Passo 4 (primeiro acesso): confirmar o primeiro código e ativar o 2FA. */
export async function confirmTwoFactor(req: Request, res: Response) {
  const { code } = totpSchema.parse(req.body);
  const user = req.user!;
  if (user.mustChangePassword || user.twoFactorEnabled) throw new AppError(409, 'Etapa inválida');

  if (!verifyTotp(user, code)) {
    await registerFailure(user, req, '2FA_SETUP_FAILED');
    throw new AppError(401, 'Código inválido');
  }
  const enabled = await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  await logAudit(req, '2FA_ENABLED', user.id);
  res.json({ user: publicUser(await issueSession(req, res, enabled)) });
}

/** Login normal: validar o código TOTP. */
export async function verifyTwoFactor(req: Request, res: Response) {
  const { code } = totpSchema.parse(req.body);
  const user = req.user!;
  if (nextStep(user) !== 'VERIFY_2FA') throw new AppError(409, 'Etapa inválida');

  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(423, 'Conta temporariamente bloqueada');
  if (!verifyTotp(user, code)) {
    await registerFailure(user, req, '2FA_FAILED');
    throw new AppError(401, 'Código inválido');
  }
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
