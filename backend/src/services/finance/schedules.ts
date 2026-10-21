import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { insertTransaction } from './service';

export const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'YEARLY', 'ONCE'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface ScheduleInput {
  name: string;
  accountId: string;
  payee?: string | null;
  categoryId?: string | null;
  transferAccountId?: string | null;
  amount: number;
  frequency: Frequency;
  interval: number;
  nextDate: string;
  autoPost: boolean;
}

/** Hoje no fuso do Brasil (o servidor pode estar em UTC). */
export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/**
 * Próximo vencimento. Mensal/anual respeitam o dia original (`anchorDay`):
 * "todo dia 31" cai em 30/11, 31/12, 28/02 e volta a 31/03.
 */
export function advanceDate(date: string, frequency: Frequency, interval: number, anchorDay: number): string | null {
  const [year, month, day] = date.split('-').map(Number);
  if (frequency === 'ONCE') return null;
  if (frequency === 'WEEKLY') {
    const next = new Date(Date.UTC(year, month - 1, day + 7 * interval));
    return next.toISOString().slice(0, 10);
  }
  const months = frequency === 'MONTHLY' ? interval : 12 * interval;
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = index % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(anchorDay, lastDay)).padStart(2, '0')}`;
}

async function ownSchedule(userId: string, id: string) {
  const schedule = await prisma.financeSchedule.findFirst({ where: { id, userId } });
  if (!schedule) throw new AppError(404, 'Agendamento não encontrado.');
  return schedule;
}

async function validate(userId: string, input: ScheduleInput) {
  const ids = [input.accountId, input.transferAccountId].filter((id): id is string => !!id);
  const accounts = await prisma.financeAccount.count({ where: { userId, id: { in: ids } } });
  if (accounts !== new Set(ids).size) throw new AppError(404, 'Conta não encontrada.');
  if (input.transferAccountId === input.accountId) throw new AppError(400, 'Escolha contas diferentes para a transferência.');
  if (input.categoryId && !(await prisma.financeCategory.count({ where: { userId, id: input.categoryId } }))) {
    throw new AppError(404, 'Categoria não encontrada.');
  }
}

export async function listSchedules(userId: string) {
  const today = todayInBrazil();
  const [schedules, accounts] = await Promise.all([
    prisma.financeSchedule.findMany({ where: { userId }, orderBy: [{ active: 'desc' }, { nextDate: 'asc' }] }),
    prisma.financeAccount.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  return schedules.map((s) => ({
    id: s.id,
    name: s.name,
    accountId: s.accountId,
    accountName: accountName.get(s.accountId) ?? '',
    payee: s.payee,
    categoryId: s.categoryId,
    transferAccountId: s.transferAccountId,
    transferAccountName: s.transferAccountId ? accountName.get(s.transferAccountId) ?? null : null,
    amount: s.amount,
    frequency: s.frequency as Frequency,
    interval: s.interval,
    nextDate: s.nextDate,
    autoPost: s.autoPost,
    active: s.active,
    status: !s.active ? 'done' : s.nextDate < today ? 'overdue' : s.nextDate === today ? 'due' : 'upcoming',
  }));
}

export async function createSchedule(userId: string, input: ScheduleInput) {
  await validate(userId, input);
  return prisma.financeSchedule.create({
    data: { userId, ...input, anchorDay: Number(input.nextDate.slice(8, 10)) },
  });
}

export async function updateSchedule(userId: string, id: string, input: ScheduleInput & { active?: boolean }) {
  await ownSchedule(userId, id);
  await validate(userId, input);
  return prisma.financeSchedule.update({
    where: { id },
    data: { ...input, anchorDay: Number(input.nextDate.slice(8, 10)) },
  });
}

export async function deleteSchedule(userId: string, id: string) {
  await ownSchedule(userId, id);
  await prisma.financeSchedule.delete({ where: { id } });
}

/**
 * Lança a ocorrência atual e avança o vencimento. O avanço é condicional ao
 * `nextDate` lido (otimista): duas abas lançando ao mesmo tempo não geram
 * transação em dobro — a segunda não encontra a linha e desiste.
 */
async function postOccurrence(userId: string, id: string, skip: boolean) {
  return prisma.$transaction(async (db) => {
    const schedule = await db.financeSchedule.findFirst({ where: { id, userId, active: true } });
    if (!schedule) throw new AppError(404, 'Agendamento não encontrado ou encerrado.');
    const next = advanceDate(schedule.nextDate, schedule.frequency as Frequency, schedule.interval, schedule.anchorDay);
    const moved = await db.financeSchedule.updateMany({
      where: { id, nextDate: schedule.nextDate },
      data: next ? { nextDate: next } : { active: false },
    });
    if (moved.count === 0) return null;
    if (skip) return null;
    return insertTransaction(db, userId, {
      accountId: schedule.accountId,
      date: schedule.nextDate,
      amount: schedule.amount,
      payee: schedule.payee ?? schedule.name,
      categoryId: schedule.categoryId,
      transferAccountId: schedule.transferAccountId,
      notes: `Agendado: ${schedule.name}`,
    });
  });
}

export const postSchedule = (userId: string, id: string) => postOccurrence(userId, id, false);
export const skipSchedule = (userId: string, id: string) => postOccurrence(userId, id, true);

/** Lança o que venceu e está marcado como automático (até 24 atrasos por vez). */
export async function runAutoPost(userId: string) {
  const today = todayInBrazil();
  const due = await prisma.financeSchedule.findMany({
    where: { userId, active: true, autoPost: true, nextDate: { lte: today } },
    select: { id: true },
  });
  for (const { id } of due) {
    for (let i = 0; i < 24; i += 1) {
      const current = await prisma.financeSchedule.findUnique({ where: { id }, select: { nextDate: true, active: true } });
      if (!current?.active || current.nextDate > today) break;
      try {
        await postOccurrence(userId, id, false);
      } catch {
        break; // conta fechada, categoria removida…: deixa para o usuário resolver na tela
      }
    }
  }
}
