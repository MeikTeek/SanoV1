import type { Request } from 'express';
import { prisma } from '../config/prisma';

export async function logAudit(
  req: Request,
  action: string,
  userId?: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: userId ?? req.user?.id ?? null,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
        metadata: (metadata ?? undefined) as any,
      },
    });
  } catch (err) {
    console.error('Falha ao gravar audit log:', err);
  }
}
