import { prisma } from '../../config/prisma';
import type { Block, RuleProfile } from './rules';
import { generateMission } from './rules';
import { applyCompletion, applyDebuff, debuffPercent, levelTitle, xpForLevel, type Stats } from './progress';
import type { Equipment, Goal, Injury } from './exercises';

const TZ = 'America/Sao_Paulo';

export const todayKey = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Índice de rotação: dias desde uma época fixa, para variar as missões. */
const EPOCH = Date.UTC(2026, 0, 1);
const dayIndexOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
};

/** Perfil do banco → entrada do motor de regras. */
export function toRuleProfile(p: {
  goal: string; equipment: string[]; injuries: string[]; birthYear: number; minutesPerDay: number;
}, level: number, now = new Date()): RuleProfile {
  return {
    goal: p.goal as Goal,
    equipment: p.equipment as Equipment[],
    injuries: p.injuries as Injury[],
    age: now.getFullYear() - p.birthYear,
    level,
    minutesAvailable: p.minutesPerDay,
  };
}

export const getProfile = (userId: string) => prisma.trainingProfile.findUnique({ where: { userId } });

export const getStats = async (userId: string): Promise<Stats> => {
  const s = await prisma.playerStats.findUnique({ where: { userId } });
  return s ?? { strength: 10, agility: 10, stamina: 10, vitality: 10, xp: 0, level: 1, streak: 0 };
};

/**
 * Missão do dia, criada sob demanda.
 *
 * Não há cron: a missão nasce quando o usuário abre o trainer. Isso evita um
 * processo agendado sem perder a garantia de "uma missão por dia", que vem do
 * índice único (userId, day).
 */
export async function getOrCreateMission(userId: string, now = new Date()) {
  const day = todayKey(now);
  const existing = await prisma.dailyMission.findUnique({
    where: { userId_day: { userId, day } },
    include: { progress: true },
  });
  if (existing) return existing;

  const profile = await getProfile(userId);
  if (!profile) return null; // onboarding não concluído

  const stats = await getStats(userId);
  await prisma.playerStats.upsert({ where: { userId }, create: { userId }, update: {} });
  const plan = generateMission(toRuleProfile(profile, stats.level, now), dayIndexOf(day));

  return prisma.dailyMission.create({
    data: {
      userId, day, title: plan.title,
      blocks: plan.blocks as unknown as object,
      plannedMinutes: plan.plannedMinutes,
    },
    include: { progress: true },
  });
}
/** Resultado de marcar um bloco. `ok` discrimina sucesso de erro. */
export type CompleteResult =
  | { ok: false; error: string }
  | { ok: true; done: string[]; completed: boolean; leveledUp?: boolean; level?: number };

/**
 * Marca um bloco como concluído. Quando todos terminam, a missão fecha e o
 * ganho de XP/atributos — aplicado de uma vez.
 */
export async function completeBlock(userId: string, missionId: string, blockKey: string): Promise<CompleteResult> {
  const mission = await prisma.dailyMission.findFirst({
    where: { id: missionId, userId },
    include: { progress: true },
  });
  if (!mission) return { ok: false as const, error: 'Missão não encontrada' };
  if (mission.completedAt) return { ok: false as const, error: 'Missão já concluída' };

  const blocks = mission.blocks as unknown as Block[];
  if (!blocks.some((b) => b.key === blockKey)) return { ok: false as const, error: 'Bloco não encontrado' };

  await prisma.missionProgress.upsert({
    where: { missionId_blockKey: { missionId, blockKey } },
    create: { missionId, blockKey, doneCount: 1 },
    update: { doneCount: { increment: 1 } },
  });

  const done = new Set([...mission.progress.map((p) => p.blockKey), blockKey]);
  if (!blocks.every((b) => done.has(b.key))) {
    return { ok: true as const, done: Array.from(done), completed: false };
  }

  const before = await prisma.playerStats.findUnique({ where: { userId } });
  if (!before) return { ok: true as const, done: Array.from(done), completed: false };

  const prev: Stats = before;
  const gained = applyCompletion(prev, blocks, Array.from(done));

  // Ofensiva só continua se a conclusão anterior foi ontem ou hoje.
  const today = todayKey();
  const last = before.lastCompletedOn ? todayKey(before.lastCompletedOn) : null;
  const continues = last === today || last === todayKey(new Date(Date.now() - 86_400_000));
  const streak = continues ? prev.streak + 1 : 1;

  await prisma.playerStats.update({
    where: { userId },
    data: {
      strength: gained.strength, agility: gained.agility, stamina: gained.stamina, vitality: gained.vitality,
      xp: gained.xp, level: gained.level, streak,
      lastCompletedOn: new Date(),
      debuffUntil: null, // cumprir hoje limpa o debuff
    },
  });

  await prisma.dailyMission.update({
    where: { id: missionId },
    data: { completedAt: new Date(), xpAwarded: blocks.reduce((s, b) => s + b.xp, 0) },
  });

  await prisma.workoutLog.createMany({
    data: blocks.map((b) => ({ userId, day: today, exercise: b.name, sets: 3, reps: 0, minutes: b.minutes })),
  });

  return {
    ok: true, done: Array.from(done), completed: true,
    leveledUp: gained.level > prev.level, level: gained.level,
  };
}

/**
 * Penalidade: zera a ofensiva e aplica o debuff quando houve dias em branco
 * entre a última conclus—o e hoje.
 */
export async function applyPenaltyIfMissed(userId: string, now = new Date()) {
  const stats = await prisma.playerStats.findUnique({ where: { userId } });
  if (!stats?.lastCompletedOn) return null;

  const last = todayKey(stats.lastCompletedOn);
  const today = todayKey(now);
  if (last === today || last === todayKey(new Date(now.getTime() - 86_400_000))) return null;

  const daysMissed = Math.min(8, Math.max(1, dayIndexOf(today) - dayIndexOf(last) - 1));
  const until = new Date(now.getTime() + daysMissed * 86_400_000);

  await prisma.playerStats.update({ where: { userId }, data: { streak: 0, debuffUntil: until } });
  return { daysMissed, percent: debuffPercent(daysMissed), until };
}

const debuffUntilOf = async (userId: string) =>
  (await prisma.playerStats.findUnique({ where: { userId }, select: { debuffUntil: true } }))?.debuffUntil ?? null;

/** Estado completo do dashboard do trainer. */
export async function getDashboard(userId: string, now = new Date()) {
  const profile = await getProfile(userId);
  if (!profile) return { onboarded: false as const };

  const raw = await getStats(userId);
  const debuffUntil = await debuffUntilOf(userId);
  const [mission, history] = await Promise.all([
    getOrCreateMission(userId, now),
    prisma.dailyMission.findMany({
      where: { userId },
      orderBy: { day: 'desc' },
      take: 14,
      select: { day: true, completedAt: true, plannedMinutes: true, xpAwarded: true },
    }),
  ]);

  const visible = applyDebuff(raw, debuffUntil, now);

  return {
    onboarded: true as const,
    profile,
    // Atributos já com o debuff aplicado (é o que o radar mostra); streak e
    // flag vêm crus para não serem distorcidos na tela.
    stats: { ...visible, streak: raw.streak, debuffed: Boolean(debuffUntil) },
    level: { current: raw.level, title: levelTitle(raw.level), xp: raw.xp, xpNeeded: xpForLevel(raw.level) },
    mission,
    history,
  };
}

/** Dados brutos da semana — insumo do relatório da IA. */
export async function weeklyRawData(userId: string, now = new Date()) {
  const since = todayKey(new Date(now.getTime() - 7 * 86_400_000));
  const [logs, missions] = await Promise.all([
    prisma.workoutLog.findMany({ where: { userId, day: { gte: since } } }),
    prisma.dailyMission.findMany({ where: { userId, day: { gte: since } } }),
  ]);
  return {
    totalMinutes: logs.reduce((s, l) => s + l.minutes, 0),
    completedDays: missions.filter((m) => m.completedAt).length,
    xp: missions.reduce((s, m) => s + m.xpAwarded, 0),
    logs,
    missions,
  };
}
