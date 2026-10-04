import { prisma } from '../../config/prisma';

export type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';

export interface AppointmentInput {
  title: string;
  description?: string;
  participants?: string;
  startsAt: Date;
  endsAt?: Date;
  remindBefore?: number | null;
}

const select = {
  id: true, title: true, description: true, participants: true,
  startsAt: true, endsAt: true, remindBefore: true, reminderSentAt: true,
  status: true, createdAt: true,
} as const;

/** Compromissos do usuário. `from`/`to` filtram por janela; sem eles, traz os futuros e recentes. */
export async function listAppointments(userId: string, from?: Date, to?: Date) {
  return prisma.appointment.findMany({
    where: {
      userId,
      status: { not: 'CANCELED' },
      ...(from || to ? { startsAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
    },
    select,
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
}

export async function createAppointment(userId: string, data: AppointmentInput) {
  return prisma.appointment.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      participants: data.participants ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? null,
      remindBefore: data.remindBefore ?? null,
    },
    select,
  });
}

/** Busca por trecho no título — usado pelo cancelamento ("cancellar reunião do João"). */
export async function findByTitle(userId: string, term: string) {
  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', title: { contains: term, mode: 'insensitive' } },
    select,
    orderBy: { startsAt: 'asc' },
    take: 5,
  });
}

export async function updateAppointment(userId: string, id: string, data: Partial<AppointmentInput> & { status?: AppointmentStatus }) {
  return prisma.appointment.update({
    where: { id, userId }, // userId no where impede acessar compromisso de outro usuário
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.participants !== undefined && { participants: data.participants }),
      ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
      ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      ...(data.remindBefore !== undefined && { remindBefore: data.remindBefore }),
      ...(data.status !== undefined && { status: data.status }),
      // Ao reagendar, o lembrete antigo precisa disparar de novo.
      ...(data.startsAt !== undefined && { reminderSentAt: null }),
    },
    select,
  });
}

export async function deleteAppointment(userId: string, id: string) {
  return prisma.appointment.delete({ where: { id, userId } });
}

/**
 * Lista os compromissos de um dia [from, to) — usado para mostrar o que será
 * apagado antes de confirmar a limpeza.
 */
export async function listByDay(userId: string, from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', startsAt: { gte: from, lt: to } },
    select,
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Cancela todos os compromissos pendentes do dia [from, to).
 * O `userId` no where é o que impede de afetar a agenda de outra pessoa.
 */
export async function cancelDay(userId: string, from: Date, to: Date) {
  return prisma.appointment.updateMany({
    where: { userId, status: 'PENDING', startsAt: { gte: from, lt: to } },
    data: { status: 'CANCELED' },
  });
}

/** Compromissos de hoje (fuso local), usados na saudação inicial. */
export async function listToday(userId: string, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', startsAt: { gte: start, lt: end } },
    select,
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Compromissos cujo momento de lembrete chegou e que ainda não foram avisados.
 * A busca é ampla (janela de 1 dia) e o filtro fino fica em memória.
 */
export async function findDueReminders(userId: string, now = new Date()) {
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
  const candidates = await prisma.appointment.findMany({
    where: { userId, status: 'PENDING', reminderSentAt: null, startsAt: { gt: now, lte: horizon } },
    select,
    orderBy: { startsAt: 'asc' },
  });

  return candidates.filter((a) => {
    const before = a.remindBefore ?? 0;
    const fireAt = a.startsAt.getTime() - before * 60_000;
    return fireAt <= now.getTime();
  });
}

/** Marca como avisado para o cliente não receber o mesmo lembrete a cada polling. */
export async function markReminded(userId: string, id: string) {
  return prisma.appointment.updateMany({
    where: { id, userId, reminderSentAt: null },
    data: { reminderSentAt: new Date() },
  });
}