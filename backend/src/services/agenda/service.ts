import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma';
import { localDayBounds } from '../assistant/dateTime';
import { alignStart, expandSeries, HORIZON_DAYS, nextOccurrence, type Recurrence } from './recurrence';
import { localParts } from '../assistant/dateTime';

export type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';

export interface AppointmentInput {
  title: string;
  description?: string | null;
  participants?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  remindBefore?: number | null;
  recurrence?: Recurrence | null;
  recurrenceUntil?: Date | null;
}

const select = {
  id: true, title: true, description: true, participants: true, location: true,
  startsAt: true, endsAt: true, allDay: true, remindBefore: true, reminderSentAt: true,
  status: true, seriesId: true, recurrence: true, recurrenceUntil: true, createdAt: true,
} as const;

const DAY = 86_400_000;

/**
 * Mantém as séries recorrentes geradas até o horizonte. Barato: só olha
 * séries cuja última ocorrência já está perto de acabar.
 */
export async function extendSeries(userId: string, now = new Date(), until?: Date) {
  // Gera até onde a tela/consulta está olhando (no mínimo 120 dias), com teto de
  // 3 anos para uma navegação muito distante não criar milhares de linhas.
  const cap = now.getTime() + 3 * 365 * DAY;
  const horizon = new Date(Math.min(cap, Math.max(now.getTime() + HORIZON_DAYS * DAY, until?.getTime() ?? 0)));
  const tails = await prisma.appointment.groupBy({
    by: ['seriesId'],
    where: { userId, seriesId: { not: null } },
    _max: { startsAt: true },
  });
  for (const tail of tails) {
    const last = tail._max.startsAt;
    // Já gerado até perto do horizonte: nada a fazer (evita extensões de 1 linha).
    if (!tail.seriesId || !last || last.getTime() >= horizon.getTime() - 7 * DAY) continue;
    const model = await prisma.appointment.findFirst({ where: { userId, seriesId: tail.seriesId, startsAt: last } });
    // O fim da série vem de `recurrenceUntil` (pedido pelo usuário ou gravado ao
    // cancelar/excluir "daqui em diante") — não do status da última linha.
    if (!model?.recurrence || (model.recurrenceUntil && last >= model.recurrenceUntil)) continue;
    const rule = model.recurrence as Recurrence;
    const anchor = await prisma.appointment.findFirst({ where: { seriesId: tail.seriesId }, orderBy: { startsAt: 'asc' }, select: { startsAt: true } });
    const next = nextOccurrence(last, rule, localParts(anchor?.startsAt ?? last).day);
    const dates = expandSeries(next, rule, horizon, model.recurrenceUntil);
    const duration = model.endsAt ? model.endsAt.getTime() - model.startsAt.getTime() : null;
    if (!dates.length) continue;
    await prisma.appointment.createMany({
      data: dates.map((startsAt) => ({
        userId, title: model.title, description: model.description, participants: model.participants,
        location: model.location, allDay: model.allDay, remindBefore: model.remindBefore,
        seriesId: model.seriesId, recurrence: model.recurrence, recurrenceUntil: model.recurrenceUntil,
        startsAt, endsAt: duration !== null ? new Date(startsAt.getTime() + duration) : null,
      })),
    });
  }
}

/** Compromissos do usuário (sem os cancelados). `from`/`to` filtram por janela. */
export async function listAppointments(userId: string, from?: Date, to?: Date) {
  await extendSeries(userId, new Date(), to);
  return prisma.appointment.findMany({
    where: {
      userId,
      status: { not: 'CANCELED' },
      ...(from || to ? { startsAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
    },
    select,
    orderBy: { startsAt: 'asc' },
    take: 500,
  });
}

/** Cria um compromisso — ou a série inteira, quando há recorrência. Devolve o primeiro. */
export async function createAppointment(userId: string, data: AppointmentInput) {
  const base = {
    userId,
    title: data.title,
    description: data.description ?? null,
    participants: data.participants ?? null,
    location: data.location ?? null,
    allDay: data.allDay ?? false,
    remindBefore: data.remindBefore ?? null,
  };
  if (!data.recurrence) {
    return prisma.appointment.create({
      data: { ...base, startsAt: data.startsAt, endsAt: data.endsAt ?? null },
      select,
    });
  }

  const seriesId = randomUUID();
  const first = alignStart(data.startsAt, data.recurrence);
  const dates = expandSeries(first, data.recurrence, new Date(Date.now() + HORIZON_DAYS * DAY), data.recurrenceUntil);
  const duration = data.endsAt ? data.endsAt.getTime() - data.startsAt.getTime() : null;
  await prisma.appointment.createMany({
    data: dates.map((startsAt) => ({
      ...base, seriesId, recurrence: data.recurrence, recurrenceUntil: data.recurrenceUntil ?? null,
      startsAt, endsAt: duration !== null ? new Date(startsAt.getTime() + duration) : null,
    })),
  });
  return prisma.appointment.findFirstOrThrow({ where: { seriesId }, orderBy: { startsAt: 'asc' }, select });
}

/**
 * Busca por trecho do título (sem acento e sem caixa). Prioriza o que ainda
 * vai acontecer; ocorrências de séries aparecem só a próxima de cada uma.
 */
export async function findByTitle(userId: string, term: string, now = new Date()) {
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = fold(term).trim().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  // Comparação sem acento em memória: "reuniao" precisa achar "Reunião", e o
  // Postgres sem a extensão unaccent não faz isso. O volume por usuário é pequeno.
  const candidates = await prisma.appointment.findMany({
    where: { userId, status: 'PENDING', startsAt: { gte: new Date(now.getTime() - 6 * 3_600_000) } },
    select,
    orderBy: { startsAt: 'asc' },
    take: 800,
  });
  const rows = candidates.filter((row) => {
    const haystack = fold(`${row.title} ${row.participants ?? ''} ${row.location ?? ''}`);
    return words.every((w) => haystack.includes(w));
  });
  const seenSeries = new Set<string>();
  return rows.filter((row) => {
    if (!row.seriesId) return true;
    if (seenSeries.has(row.seriesId)) return false;
    seenSeries.add(row.seriesId);
    return true;
  }).slice(0, 6);
}

export async function getAppointment(userId: string, id: string) {
  return prisma.appointment.findFirst({ where: { id, userId }, select });
}

/** Próximos compromissos pendentes a partir de agora. */
export async function nextAppointments(userId: string, limit = 3, now = new Date()) {
  await extendSeries(userId, now);
  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', OR: [{ startsAt: { gte: now } }, { endsAt: { gt: now } }] },
    select,
    orderBy: { startsAt: 'asc' },
    take: limit,
  });
}

export async function updateAppointment(
  userId: string,
  id: string,
  data: Partial<Omit<AppointmentInput, 'recurrence' | 'recurrenceUntil'>> & { status?: AppointmentStatus },
) {
  return prisma.appointment.update({
    where: { id, userId }, // userId no where impede acessar compromisso de outro usuário
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.participants !== undefined && { participants: data.participants }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.allDay !== undefined && { allDay: data.allDay }),
      ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
      ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      ...(data.remindBefore !== undefined && { remindBefore: data.remindBefore }),
      ...(data.status !== undefined && { status: data.status }),
      // Ao reagendar ou trocar o lembrete, o aviso precisa disparar de novo.
      ...((data.startsAt !== undefined || data.remindBefore !== undefined) && { reminderSentAt: null }),
    },
    select,
  });
}

/** Cancela esta e as próximas ocorrências da série (as passadas ficam no histórico). */
export async function cancelSeries(userId: string, seriesId: string, from: Date) {
  const [canceled] = await prisma.$transaction([
    prisma.appointment.updateMany({
      where: { userId, seriesId, status: 'PENDING', startsAt: { gte: from } },
      data: { status: 'CANCELED' },
    }),
    // Marca o fim: sem isso, a extensão automática geraria as próximas de novo.
    prisma.appointment.updateMany({ where: { userId, seriesId }, data: { recurrenceUntil: new Date(from.getTime() - 1) } }),
  ]);
  return canceled;
}

/** Desfaz um cancelamento de série (usado pelo "desfazer" do chat): a série volta a não ter fim. */
export async function restoreSeries(userId: string, seriesId: string, from: Date) {
  const [restored] = await prisma.$transaction([
    prisma.appointment.updateMany({
      where: { userId, seriesId, status: 'CANCELED', startsAt: { gte: from } },
      data: { status: 'PENDING' },
    }),
    prisma.appointment.updateMany({ where: { userId, seriesId }, data: { recurrenceUntil: null } }),
  ]);
  return restored;
}

/** Apaga de vez uma série recém-criada (desfazer criação). */
export async function deleteSeries(userId: string, seriesId: string) {
  return prisma.appointment.deleteMany({ where: { userId, seriesId } });
}

export async function deleteAppointment(userId: string, id: string) {
  return prisma.appointment.delete({ where: { id, userId } });
}

/** Compromissos de um intervalo [from, to) — usado para listar, contar e achar horário livre. */
export async function listByDay(userId: string, from: Date, to: Date) {
  await extendSeries(userId, new Date(), to);
  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', startsAt: { gte: from, lt: to } },
    select,
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Cancela todos os compromissos pendentes do intervalo [from, to).
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
  const { start, end } = localDayBounds(now);
  await extendSeries(userId, now);
  return prisma.appointment.findMany({
    where: { userId, status: 'PENDING', startsAt: { gte: start, lt: end } },
    select,
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Compromissos cujo momento de lembrete chegou e que ainda não foram avisados.
 * A busca é ampla (até 7 dias, o maior lembrete permitido) e o filtro fino fica em memória.
 */
export async function findDueReminders(userId: string, now = new Date()) {
  const horizon = new Date(now.getTime() + 7 * DAY + 60_000);
  const candidates = await prisma.appointment.findMany({
    where: { userId, status: 'PENDING', reminderSentAt: null, remindBefore: { not: null }, startsAt: { gt: now, lte: horizon } },
    select,
    orderBy: { startsAt: 'asc' },
  });

  return candidates.filter((a) => {
    const fireAt = a.startsAt.getTime() - (a.remindBefore ?? 0) * 60_000;
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

/** Edita esta e as próximas ocorrências da série; mudança de horário vira deslocamento. */
export async function updateFollowing(
  userId: string,
  id: string,
  data: Partial<Omit<AppointmentInput, 'recurrence' | 'recurrenceUntil'>>,
) {
  const current = await prisma.appointment.findFirst({ where: { id, userId } });
  if (!current?.seriesId) return updateAppointment(userId, id, data);
  const delta = data.startsAt ? data.startsAt.getTime() - current.startsAt.getTime() : 0;
  const duration = data.endsAt !== undefined
    ? (data.endsAt ? data.endsAt.getTime() - (data.startsAt ?? current.startsAt).getTime() : null)
    : current.endsAt ? current.endsAt.getTime() - current.startsAt.getTime() : null;
  const rows = await prisma.appointment.findMany({
    where: { userId, seriesId: current.seriesId, status: 'PENDING', startsAt: { gte: current.startsAt } },
  });
  await prisma.$transaction(rows.map((row) => {
    const startsAt = new Date(row.startsAt.getTime() + delta);
    return prisma.appointment.update({
      where: { id: row.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.participants !== undefined && { participants: data.participants }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.allDay !== undefined && { allDay: data.allDay }),
        ...(data.remindBefore !== undefined && { remindBefore: data.remindBefore, reminderSentAt: null }),
        ...(delta !== 0 && { startsAt, reminderSentAt: null }),
        endsAt: duration !== null ? new Date(startsAt.getTime() + duration) : null,
      },
    });
  }));
  return prisma.appointment.findFirstOrThrow({ where: { id }, select });
}

/** Apaga esta e as próximas ocorrências da série. */
export async function deleteFollowing(userId: string, id: string) {
  const current = await prisma.appointment.findFirst({ where: { id, userId } });
  if (!current) return { count: 0 };
  if (!current.seriesId) return prisma.appointment.deleteMany({ where: { id, userId } });
  const [deleted] = await prisma.$transaction([
    prisma.appointment.deleteMany({ where: { userId, seriesId: current.seriesId, startsAt: { gte: current.startsAt } } }),
    // As que sobraram passam a terminar antes desta, senão a extensão as recriaria.
    prisma.appointment.updateMany({
      where: { userId, seriesId: current.seriesId },
      data: { recurrenceUntil: new Date(current.startsAt.getTime() - 1) },
    }),
  ]);
  return deleted;
}
