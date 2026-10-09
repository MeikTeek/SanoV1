import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { generateTempPassword, hashPassword } from '../utils/password';
import { createUserSchema, setActiveSchema, logsQuerySchema, idParamSchema } from '../validators/admin.validator';
import { logAudit } from '../services/audit.service';
import { myNumber } from '../services/chat/number.service';

const userSelect = {
  id: true, username: true, role: true, active: true, twoFactorEnabled: true,
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
} as const;

/** Cria o usuário com senha temporária (exibida UMA única vez). */
export async function createUser(req: Request, res: Response) {
  const { username, role } = createUserSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { username } })) throw new AppError(409, 'Usuário já existe');

  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: { username, role, passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    select: userSelect,
  });
  await logAudit(req, 'ADMIN_USER_CREATED', req.user!.id, { target: user.id, username, role });
  res.status(201).json({ user, tempPassword });
}

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } });
  const withCodes = await Promise.all(users.map(async (user) => {
    const number = user.active ? await myNumber(user.id) : null;
    return {
      ...user,
      contactCode: number?.formatted ?? null,
      contactCodeUntil: number?.expiresAt ?? null,
    };
  }));
  res.json({ users: withCodes });
}

/** Bloqueia/desbloqueia. Bloquear derruba as sessões ativas (tokenVersion++). */
export async function setActive(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const { active } = setActiveSchema.parse(req.body);
  if (id === req.user!.id) throw new AppError(400, 'Você não pode bloquear a si mesmo');

  const user = await prisma.user
    .update({
      where: { id },
      data: { active, tokenVersion: { increment: 1 }, failedAttempts: 0, lockedUntil: null },
      select: userSelect,
    })
    .catch(() => { throw new AppError(404, 'Usuário não encontrado'); });

  await logAudit(req, active ? 'ADMIN_USER_UNBLOCKED' : 'ADMIN_USER_BLOCKED', req.user!.id, { target: id });
  res.json({ user });
}

/** Reseta credenciais: nova senha temporária + 2FA zerado. */
export async function resetCredentials(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  if (id === req.user!.id) throw new AppError(400, 'Use a troca de senha para sua própria conta');

  const tempPassword = generateTempPassword();
  const user = await prisma.user
    .update({
      where: { id },
      data: {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        tokenVersion: { increment: 1 },
        failedAttempts: 0,
        lockedUntil: null,
      },
      select: userSelect,
    })
    .catch(() => { throw new AppError(404, 'Usuário não encontrado'); });

  await logAudit(req, 'ADMIN_USER_RESET', req.user!.id, { target: id });
  res.json({ user, tempPassword });
}

export async function listLogs(req: Request, res: Response) {
  const { page, limit, userId, action } = logsQuerySchema.parse(req.query);
  const where = { ...(userId && { userId }), ...(action && { action }) };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { user: { select: { username: true } } },
    }),
  ]);
  res.json({ total, page, limit, logs });
}
