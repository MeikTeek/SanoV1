import type { Request } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { hashPassword, verifyPassword } from '../utils/password';
import { logAudit } from './audit.service';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type AuthStep = 'CHANGE_PASSWORD' | 'SETUP_2FA' | 'VERIFY_2FA';

let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await hashPassword('dummy-password-for-timing'));

export const nextStep = (u: User): AuthStep =>
  u.mustChangePassword ? 'CHANGE_PASSWORD' : !u.twoFactorEnabled ? 'SETUP_2FA' : 'VERIFY_2FA';

/** Conta falha e bloqueia temporariamente após MAX_ATTEMPTS. */
export async function registerFailure(user: User, req: Request, reason: string) {
  const attempts = user.failedAttempts + 1;
  const lock = attempts >= MAX_ATTEMPTS;
  await prisma.user.update({
    where: { id: user.id },
    data: lock
      ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
      : { failedAttempts: attempts },
  });
  await logAudit(req, lock ? 'ACCOUNT_LOCKED' : reason, user.id);
}

export async function authenticate(username: string, password: string, req: Request): Promise<User> {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await verifyPassword(await getDummyHash(), password); // evita timing attack
    await logAudit(req, 'LOGIN_FAILED_UNKNOWN_USER', null, { username });
    throw new AppError(401, 'Credenciais inválidas');
  }
  if (!user.active) {
    await logAudit(req, 'LOGIN_BLOCKED_INACTIVE', user.id);
    throw new AppError(401, 'Credenciais inválidas');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'Conta temporariamente bloqueada. Tente novamente mais tarde.');
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await registerFailure(user, req, 'LOGIN_FAILED_BAD_PASSWORD');
    throw new AppError(401, 'Credenciais inválidas');
  }
  return user;
}
