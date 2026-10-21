import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { handleCommand } from '../sano/router';
import { agendaDeps } from '../agenda/deps';
import { extendSeries } from '../agenda/service';
import type { SanoResponse } from '../sano/types';

/**
 * Ponte Sano ↔ SanoBot (Discord).
 *
 * Vínculo: o usuário gera um código em Ajustes (logado no Sano) e digita
 * `/vincular` no Discord. Só depois disso o bot age por ele — o Discord sozinho
 * não dá acesso a nada, já que o Sano é fechado (sem cadastro público).
 */

const CODE_TTL_MS = 10 * 60_000;
// Sem 0/O/1/I: o código é digitado à mão.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function createLinkCode(userId: string) {
  await prisma.discordLinkCode.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.discordLinkCode.create({ data: { code, userId, expiresAt } });
  return { code, expiresAt };
}

export async function linkStatus(userId: string) {
  const link = await prisma.discordLink.findUnique({ where: { userId } });
  return link ? { linked: true, discordUsername: link.discordUsername, linkedAt: link.linkedAt } : { linked: false };
}

export async function unlinkUser(userId: string) {
  await prisma.discordLink.deleteMany({ where: { userId } });
}

/** `/vincular CODIGO` no Discord. O código é de uso único. */
export async function linkWithCode(code: string, discordId: string, discordUsername?: string) {
  const row = await prisma.discordLinkCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!row || row.expiresAt < new Date()) {
    throw new AppError(400, 'Código inválido ou expirado. Gere um novo em Ajustes → Discord, no Sano.');
  }
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user?.active) throw new AppError(403, 'Esta conta do Sano está desativada.');
  try {
    await prisma.$transaction([
      // Uma conta Discord ↔ um usuário: relinkar move o vínculo.
      prisma.discordLink.deleteMany({ where: { OR: [{ discordId }, { userId: user.id }] } }),
      prisma.discordLink.create({ data: { userId: user.id, discordId, discordUsername: discordUsername?.slice(0, 100) } }),
      prisma.discordLinkCode.delete({ where: { code: row.code } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) throw new AppError(409, 'Não foi possível vincular agora. Tente de novo.');
    throw error;
  }
  return { name: user.displayName || user.username };
}

export async function unlinkDiscord(discordId: string) {
  const { count } = await prisma.discordLink.deleteMany({ where: { discordId } });
  return { unlinked: count > 0 };
}

async function userByDiscord(discordId: string) {
  const link = await prisma.discordLink.findUnique({ where: { discordId }, include: { user: true } });
  if (!link || !link.user.active) return null;
  return link.user;
}

// O bot é só da agenda: estas intenções passam; o resto recebe um aviso.
const ALLOWED = new Set(['agenda', 'greeting', 'help', 'time', 'unknown']);

/** Executa uma frase no Sano em nome do usuário vinculado (só a agenda). */
export async function runCommand(discordId: string, message: string): Promise<SanoResponse & { linked: boolean; name?: string }> {
  const user = await userByDiscord(discordId);
  if (!user) {
    return {
      linked: false,
      intent: 'unlinked',
      reply: 'Sua conta do Discord ainda não está ligada ao Sano. No Sano, abra **Ajustes → Discord**, gere um código e use `/vincular` aqui.',
    };
  }
  // Só a agenda é injetada: mesmo que outra intenção case, ela não tem com o que agir.
  const result = await handleCommand(user, message, { pingDb: async () => 0, agenda: agendaDeps });
  const name = user.displayName || user.username;
  if (!ALLOWED.has(result.intent)) {
    return {
      linked: true, name, intent: result.intent,
      reply: 'Por aqui eu cuido só da sua agenda. Tente "o que tenho hoje?", "marca dentista sexta às 15h" ou "qual meu próximo compromisso?". O resto continua no site do Sano.',
    };
  }
  // Ações de navegação são do site; no Discord não fazem sentido.
  const { actions: _actions, ...rest } = result;
  return { ...rest, linked: true, name };
}

/**
 * Lembretes vencidos de quem vinculou o Discord. Marca como entregue antes de
 * responder (só o que esta chamada marcou volta), então o bot nunca repete
 * um aviso, mesmo se duas instâncias consultarem ao mesmo tempo.
 */
export async function dueDiscordReminders(now = new Date()) {
  const links = await prisma.discordLink.findMany({ include: { user: { select: { active: true } } } });
  const active = links.filter((l) => l.user.active);
  if (!active.length) return [];
  await Promise.all(active.map((l) => extendSeries(l.userId, now)));

  const horizon = new Date(now.getTime() + 7 * 86_400_000 + 60_000);
  const candidates = await prisma.appointment.findMany({
    where: {
      userId: { in: active.map((l) => l.userId) },
      status: 'PENDING', remindBefore: { not: null }, discordRemindedAt: null,
      startsAt: { gt: new Date(now.getTime() - 5 * 60_000), lte: horizon },
    },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
  const due = candidates.filter((a) => a.startsAt.getTime() - (a.remindBefore ?? 0) * 60_000 <= now.getTime());

  const out = [];
  for (const a of due) {
    const { count } = await prisma.appointment.updateMany({ where: { id: a.id, discordRemindedAt: null }, data: { discordRemindedAt: now } });
    if (!count) continue;
    const link = active.find((l) => l.userId === a.userId)!;
    out.push({
      discordId: link.discordId,
      appointment: {
        id: a.id, title: a.title, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt?.toISOString() ?? null,
        allDay: a.allDay, location: a.location, participants: a.participants, remindBefore: a.remindBefore,
      },
    });
  }
  return out;
}
