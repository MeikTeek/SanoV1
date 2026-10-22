/**
 * Sessões de treino, no modelo do wger: plano → sessão → séries reais.
 *
 * Tudo usa as tabelas que já existem (WorkoutSession/WorkoutLog/WorkoutSet);
 * as trocas de exercício do usuário ficam em ToolData, sem migração. XP, nível,
 * ofensiva e recordes são DERIVADOS do histórico — apagar uma sessão errada
 * corrige tudo sozinho, sem contador para dessincronizar.
 */
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { EXERCISES, GOAL_LABELS } from './exercises';
import { fullDetail } from './exerciseDetails';
import { musclesFor } from './muscles';
import { prescribeSet, type Athlete } from './prescription';
import { availableEquipment, screenOut } from './rules';
import { todayKey } from './service';
import {
  effectiveEquipment, generateWeeklyPlan, swapKey, swapOptions,
  type PlanSwaps, type WeeklyPlan, type WeeklyPlanProfile,
} from './weeklyPlan';
import {
  achievements, addDaysKey, bestOf, detectRecords, levelFromXp, parseRange, sessionXp,
  setVolume, suggestNext, trainingStreak, weekStartKey, weekdayOf, weeklyGoalStreak,
  type Best, type PersonalRecord, type SetEntry,
} from './progression';
import type { WorkoutSessionInput } from '../../validators/trainer.validator';
import type { Equipment, Injury, Goal } from './exercises';

const TOOL = 'trainer';
const SWAPS_KEY = 'plan-swaps';
const ONBOARDING_REQUIRED = 'Faça o cadastro do treino primeiro.';
const TZ = 'America/Sao_Paulo';
const EXERCISE_BY_KEY = new Map(EXERCISES.map((exercise) => [exercise.key, exercise]));
const round1 = (n: number) => Math.round(n * 10) / 10;

type Profile = NonNullable<Awaited<ReturnType<typeof prisma.trainingProfile.findUnique>>>;

async function requireProfile(userId: string): Promise<Profile> {
  const profile = await prisma.trainingProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError(400, ONBOARDING_REQUIRED);
  return profile;
}

const planProfile = (profile: Profile): WeeklyPlanProfile => ({
  goal: profile.goal, equipment: profile.equipment, injuries: profile.injuries,
  birthYear: profile.birthYear, experience: profile.experience,
  trainingDays: profile.trainingDays, trainingWeekdays: profile.trainingWeekdays,
  trainingLocation: profile.trainingLocation, sleepHours: profile.sleepHours,
  minutesPerDay: profile.minutesPerDay,
});

/* ── Trocas de exercício ────────────────────────────────────────────────── */

async function loadSwaps(userId: string): Promise<PlanSwaps> {
  const row = await prisma.toolData.findUnique({ where: { userId_tool_key: { userId, tool: TOOL, key: SWAPS_KEY } } });
  const data = row?.data as { swaps?: PlanSwaps } | null;
  return data?.swaps ?? {};
}

async function saveSwaps(userId: string, swaps: PlanSwaps) {
  await prisma.toolData.upsert({
    where: { userId_tool_key: { userId, tool: TOOL, key: SWAPS_KEY } },
    create: { userId, tool: TOOL, key: SWAPS_KEY, data: { swaps } },
    update: { data: { swaps } },
  });
}

export async function planForProfile(profile: Profile): Promise<WeeklyPlan> {
  return generateWeeklyPlan(planProfile(profile), new Date(), await loadSwaps(profile.userId));
}

export async function weeklyPlanFor(userId: string) {
  return planForProfile(await requireProfile(userId));
}

export async function swapOptionsFor(userId: string, weekday: number, exerciseKey: string) {
  const profile = await requireProfile(userId);
  const plan = await planForProfile(profile);
  const result = swapOptions(planProfile(profile), plan, weekday, exerciseKey);
  if (!result) throw new AppError(404, 'Exercício não está no treino deste dia.');
  return result;
}

/** `replacementKey` nulo (ou igual ao original) desfaz a troca. */
export async function swapExercise(userId: string, weekday: number, exerciseKey: string, replacementKey: string | null) {
  const { original, options } = await swapOptionsFor(userId, weekday, exerciseKey);
  const swaps = await loadSwaps(userId);
  const slot = swapKey(weekday, original);
  if (!replacementKey || replacementKey === original) {
    delete swaps[slot];
  } else {
    if (!options.some((option) => option.key === replacementKey)) {
      throw new AppError(400, 'Esse exercício não pode substituir este (músculo diferente, já está no dia ou bloqueado no seu perfil).');
    }
    swaps[slot] = replacementKey;
  }
  await saveSwaps(userId, swaps);
  return weeklyPlanFor(userId);
}

/* ── Histórico de séries ────────────────────────────────────────────────── */

type LogWithSets = {
  id: string; day: string; exercise: string; exerciseKey: string | null; sets: number; reps: number;
  loadKg: number | null; minutes: number; createdAt: Date; sessionId: string | null;
  setDetails: { setNumber: number; reps: number; loadKg: number | null; rir: number | null }[];
};

/** Séries de um registro. Registros antigos sem detalhe viram N séries iguais. */
function setsOfLog(log: LogWithSets): SetEntry[] {
  if (log.setDetails.length) {
    return [...log.setDetails].sort((a, b) => a.setNumber - b.setNumber).map((set) => ({ reps: set.reps, loadKg: set.loadKg, rir: set.rir }));
  }
  if (log.reps <= 0) return [];
  return Array.from({ length: Math.max(1, log.sets) }, () => ({ reps: log.reps, loadKg: log.loadKg, rir: null }));
}

const mergeBest = (a: Best | undefined, b: Best): Best => a
  ? { loadKg: Math.max(a.loadKg, b.loadKg), e1rm: Math.max(a.e1rm, b.e1rm), reps: Math.max(a.reps, b.reps), volume: Math.max(a.volume, b.volume) }
  : b;

const logInclude = { setDetails: { select: { setNumber: true, reps: true, loadKg: true, rir: true } } } as const;

/** Último registro de cada exercício + sugestão para hoje (progressão dupla). */
export async function workoutForDay(userId: string, weekday: number) {
  const profile = await requireProfile(userId);
  const plan = await planForProfile(profile);
  const day = plan.days.find((item) => item.weekday === weekday);
  if (!day) throw new AppError(404, 'Dia inválido.');

  const [previous, latest] = await Promise.all([
    Promise.all(day.exercises.map((exercise) => prisma.workoutLog.findFirst({
      where: { userId, exerciseKey: exercise.key },
      orderBy: { createdAt: 'desc' },
      include: logInclude,
    }))),
    prisma.bodyAssessment.findFirst({ where: { userId }, orderBy: { day: 'desc' }, select: { weightKg: true } }),
  ]);
  const athlete = athleteOf(profile, latest?.weightKg);

  return {
    ...day,
    exercises: day.exercises.map((exercise, index) => {
      const last = previous[index];
      const sets = last ? setsOfLog(last as LogWithSets) : [];
      const definition = EXERCISE_BY_KEY.get(exercise.key)!;
      const { suggestion, prescription } = prescribeSet(
        definition, exercise,
        suggestNext(sets, { min: exercise.repsMin, max: exercise.repsMax }, exercise.lowerBody),
        athlete,
      );
      return {
        ...exercise,
        previous: last ? { day: last.day, sets } : null,
        suggestion,
        prescription,
      };
    }),
  };
}

/** Dados do corpo que a estimativa de carga usa (peso da avaliação mais recente, se houver). */
function athleteOf(profile: Profile, latestWeightKg?: number): Athlete {
  return {
    weightKg: latestWeightKg ?? profile.weightKg,
    heightCm: profile.heightCm,
    sex: profile.sex,
    age: new Date().getFullYear() - profile.birthYear,
    experience: profile.experience,
    goal: profile.goal,
    hasGym: effectiveEquipment(profile.trainingLocation, profile.equipment).includes('academia'),
  };
}

/* ── Registro da sessão ─────────────────────────────────────────────────── */

const MAX_SESSION_MS = 6 * 3_600_000;

async function totalXp(userId: string) {
  const [legacy, sessions] = await Promise.all([
    prisma.dailyMission.aggregate({ where: { userId }, _sum: { xpAwarded: true } }),
    prisma.workoutSession.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { logs: { select: { sets: true, setDetails: { select: { id: true } } } } },
    }),
  ]);
  const fromSessions = sessions.reduce((sum, session) =>
    sum + sessionXp(session.logs.reduce((sets, log) => sets + (log.setDetails.length || log.sets), 0)), 0);
  return (legacy._sum.xpAwarded ?? 0) + fromSessions;
}

export async function logSession(userId: string, input: WorkoutSessionInput) {
  const profile = await requireProfile(userId);
  const rule = {
    goal: profile.goal as Goal,
    equipment: availableEquipment(effectiveEquipment(profile.trainingLocation, profile.equipment) as Equipment[]),
    injuries: profile.injuries as Injury[],
    age: new Date().getFullYear() - profile.birthYear,
    level: 1,
    minutesAvailable: profile.minutesPerDay,
  };

  const invalid = input.entries.filter((entry) => {
    const exercise = EXERCISE_BY_KEY.get(entry.exerciseKey);
    return !exercise || screenOut(exercise, rule) !== null;
  }).map((entry) => entry.exerciseKey);
  if (invalid.length) throw new AppError(400, `Exercício não permitido para o perfil: ${[...new Set(invalid)].join(', ')}.`);

  // Recordes são comparados com tudo o que veio ANTES desta sessão.
  const keys = [...new Set(input.entries.map((entry) => entry.exerciseKey))];
  const history = await prisma.workoutLog.findMany({ where: { userId, exerciseKey: { in: keys } }, include: logInclude });
  const bestBefore = new Map<string, Best>();
  for (const log of history as LogWithSets[]) {
    const sets = setsOfLog(log);
    if (sets.length) bestBefore.set(log.exerciseKey!, mergeBest(bestBefore.get(log.exerciseKey!), bestOf(sets)));
  }

  const now = new Date();
  const started = input.startedAt ? new Date(input.startedAt) : now;
  const startedAt = started > now || now.getTime() - started.getTime() > MAX_SESSION_MS ? now : started;
  const durationSeconds = Math.round((now.getTime() - startedAt.getTime()) / 1000);
  const minutesPerEntry = Math.max(1, Math.round(durationSeconds / 60 / input.entries.length));
  const xpBefore = await totalXp(userId);

  const day = todayKey();
  const session = await prisma.workoutSession.create({
    data: {
      userId, day, title: input.title, notes: input.notes, status: 'COMPLETED',
      startedAt, completedAt: now,
      logs: {
        create: input.entries.map((entry) => {
          const exercise = EXERCISE_BY_KEY.get(entry.exerciseKey)!;
          const best = bestOf(entry.sets.map((set) => ({ reps: set.reps, loadKg: set.loadKg ?? null, rir: set.rir ?? null })));
          return {
            userId, day,
            exercise: exercise.name,
            exerciseKey: exercise.key,
            muscleGroup: exercise.group,
            sets: entry.sets.length,
            reps: best.reps,
            loadKg: best.loadKg > 0 ? best.loadKg : null,
            minutes: minutesPerEntry,
            setDetails: {
              create: entry.sets.map((set, index) => ({
                setNumber: index + 1, reps: set.reps, loadKg: set.loadKg ?? null, rir: set.rir ?? null,
              })),
            },
          };
        }),
      },
    },
  });

  const records: (PersonalRecord & { exercise: string })[] = input.entries.flatMap((entry) =>
    detectRecords(entry.sets.map((set) => ({ reps: set.reps, loadKg: set.loadKg ?? null, rir: set.rir ?? null })), bestBefore.get(entry.exerciseKey) ?? null)
      .map((record) => ({ ...record, exercise: EXERCISE_BY_KEY.get(entry.exerciseKey)!.name })));

  const allSets = input.entries.flatMap((entry) => entry.sets);
  const xpEarned = sessionXp(allSets.length);
  const before = levelFromXp(xpBefore);
  const after = levelFromXp(xpBefore + xpEarned);

  return {
    sessionId: session.id,
    day,
    durationSeconds,
    totals: {
      exercises: input.entries.length,
      sets: allSets.length,
      reps: allSets.reduce((sum, set) => sum + set.reps, 0),
      volumeKg: Math.round(allSets.reduce((sum, set) => sum + (set.loadKg ?? 0) * set.reps, 0)),
    },
    records,
    xpEarned,
    level: after,
    leveledUp: after.current > before.current,
  };
}

export async function deleteSession(userId: string, sessionId: string) {
  const session = await prisma.workoutSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) throw new AppError(404, 'Sessão não encontrada.');
  // Os registros são apagados junto: deixá-los soltos manteria recordes e XP de algo que não existiu.
  await prisma.$transaction([
    prisma.workoutLog.deleteMany({ where: { sessionId, userId } }),
    prisma.workoutSession.delete({ where: { id: sessionId } }),
  ]);
  return { ok: true };
}

/* ── Visão geral: hoje, semana, progresso e conquistas ──────────────────── */

const hourInTz = (date: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(date));

export async function overview(userId: string) {
  const profile = await requireProfile(userId);
  const today = todayKey();
  const since = addDaysKey(today, -400);

  const [plan, sessions, assessments, xp] = await Promise.all([
    planForProfile(profile),
    prisma.workoutSession.findMany({
      where: { userId, status: 'COMPLETED', day: { gte: since } },
      orderBy: { startedAt: 'asc' },
      include: { logs: { include: logInclude, orderBy: { createdAt: 'asc' } } },
    }),
    prisma.bodyAssessment.count({ where: { userId } }),
    totalXp(userId),
  ]);
  // Dias com treino também incluem registros antigos (missões/chat) sem sessão.
  const looseDays = await prisma.workoutLog.findMany({
    where: { userId, sessionId: null, day: { gte: since } }, select: { day: true }, distinct: ['day'],
  });

  // Reprocessa o histórico em ordem: cada sessão sabe quantos recordes bateu.
  const bestSoFar = new Map<string, Best>();
  const recordsByKey = new Map<string, { key: string; name: string; loadKg: number; e1rm: number; reps: number; day: string }>();
  let recordCount = 0;
  const summaries = sessions.map((session) => {
    let sessionRecords = 0;
    let volume = 0;
    let setCount = 0;
    const exercises = session.logs.map((log) => {
      const sets = setsOfLog(log as LogWithSets);
      const key = log.exerciseKey ?? log.exercise;
      const best = bestOf(sets);
      if (sets.length) {
        sessionRecords += detectRecords(sets, bestSoFar.get(key) ?? null).length;
        bestSoFar.set(key, mergeBest(bestSoFar.get(key), best));
        const current = recordsByKey.get(key);
        if (!current || best.e1rm > current.e1rm || (best.e1rm === 0 && best.reps > current.reps)) {
          recordsByKey.set(key, { key, name: log.exercise, loadKg: best.loadKg, e1rm: best.e1rm, reps: best.reps, day: session.day });
        }
      }
      volume += best.volume;
      setCount += sets.length;
      return { key: log.exerciseKey, name: log.exercise, sets };
    });
    recordCount += sessionRecords;
    const durationMinutes = session.completedAt
      ? Math.max(1, Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 60_000))
      : session.logs.reduce((sum, log) => sum + log.minutes, 0);
    return {
      id: session.id, day: session.day, title: session.title, notes: session.notes,
      startedAt: session.startedAt.toISOString(), durationMinutes,
      sets: setCount, volumeKg: Math.round(volume), records: sessionRecords, exercises,
      hour: hourInTz(session.startedAt),
    };
  });

  const trainedDays = new Set([...summaries.map((s) => s.day), ...looseDays.map((d) => d.day)]);
  const goalPerWeek = profile.trainingWeekdays.length || profile.trainingDays;
  const weekStart = weekStartKey(today);

  // Semana atual, de segunda a domingo, com o que foi feito em cada dia.
  const week = Array.from({ length: 7 }, (_, offset) => {
    const day = addDaysKey(weekStart, offset);
    const planned = plan.days.find((item) => item.weekday === weekdayOf(day))!;
    return {
      day, weekday: planned.weekday, shortLabel: planned.shortLabel, title: planned.title,
      isTrainingDay: planned.isTrainingDay, done: trainedDays.has(day), isToday: day === today, isPast: day < today,
    };
  });

  // Mapa de calor: 18 semanas completas terminando nesta.
  const heatStart = addDaysKey(weekStart, -17 * 7);
  const heatmap = Array.from({ length: 18 * 7 }, (_, offset) => {
    const day = addDaysKey(heatStart, offset);
    const daySessions = summaries.filter((s) => s.day === day);
    return { day, sessions: daySessions.length || (trainedDays.has(day) ? 1 : 0), volumeKg: daySessions.reduce((sum, s) => sum + s.volumeKg, 0), future: day > today };
  });

  const weekly = Array.from({ length: 8 }, (_, index) => {
    const start = addDaysKey(weekStart, -(7 - index) * 7);
    const end = addDaysKey(start, 7);
    const inWeek = summaries.filter((s) => s.day >= start && s.day < end);
    return {
      weekStart: start,
      sessions: inWeek.length,
      volumeKg: inWeek.reduce((sum, s) => sum + s.volumeKg, 0),
      sets: inWeek.reduce((sum, s) => sum + s.sets, 0),
      minutes: inWeek.reduce((sum, s) => sum + s.durationMinutes, 0),
    };
  });

  // Recuperação: horas desde o último treino de cada músculo (até 96h).
  const recovery = new Map<number, number>();
  const nowMs = Date.now();
  for (const session of summaries) {
    const hours = (nowMs - new Date(session.startedAt).getTime()) / 3_600_000;
    if (hours > 96) continue;
    for (const exercise of session.exercises) {
      const definition = exercise.key ? EXERCISE_BY_KEY.get(exercise.key) : undefined;
      if (!definition || !exercise.sets.length) continue;
      for (const id of musclesFor(definition).primary) recovery.set(id, Math.min(recovery.get(id) ?? Infinity, hours));
    }
  }

  let bestWeekly = 0;
  for (let index = 0; index < weekly.length; index += 1) {
    // Melhor sequência de semanas na meta dentro da janela exibida.
    let run = 0;
    for (let cursor = index; cursor < weekly.length && weekly[cursor].sessions >= goalPerWeek; cursor += 1) run += 1;
    bestWeekly = Math.max(bestWeekly, run);
  }

  const streak = trainingStreak(trainedDays, profile.trainingWeekdays, today);
  const totals = {
    sessions: summaries.length,
    volumeKg: summaries.reduce((sum, s) => sum + s.volumeKg, 0),
    sets: summaries.reduce((sum, s) => sum + s.sets, 0),
    minutes: summaries.reduce((sum, s) => sum + s.durationMinutes, 0),
  };
  const todayPlan = plan.days.find((item) => item.weekday === weekdayOf(today))!;
  const nextTraining = [1, 2, 3, 4, 5, 6, 7]
    .map((offset) => ({ offset, day: addDaysKey(today, offset) }))
    .map(({ offset, day }) => ({ offset, workout: plan.days.find((item) => item.weekday === weekdayOf(day))! }))
    .find(({ workout }) => workout.isTrainingDay);

  return {
    goalLabel: GOAL_LABELS[profile.goal as Goal] ?? 'Treino',
    split: plan.split,
    today: {
      day: today,
      workout: todayPlan,
      doneToday: trainedDays.has(today),
      next: nextTraining ? { inDays: nextTraining.offset, title: nextTraining.workout.title, label: nextTraining.workout.label, weekday: nextTraining.workout.weekday } : null,
    },
    week,
    weekGoal: { done: week.filter((d) => d.done).length, target: goalPerWeek, streakWeeks: weeklyGoalStreak(trainedDays, goalPerWeek, today) },
    streak,
    level: levelFromXp(xp),
    totals,
    heatmap,
    weekly,
    recovery: [...recovery.entries()].map(([id, hoursSince]) => ({ id, hoursSince: Math.round(hoursSince) })),
    recentSessions: summaries.slice(-20).reverse().map(({ hour: _hour, ...rest }) => rest),
    records: [...recordsByKey.values()].sort((a, b) => b.e1rm - a.e1rm || b.reps - a.reps).slice(0, 12),
    achievements: achievements({
      sessions: totals.sessions,
      streak,
      bestWeeklyStreak: bestWeekly,
      records: recordCount,
      totalVolumeKg: totals.volumeKg,
      assessments,
      earlySessions: summaries.filter((s) => s.hour < 7).length,
      lateSessions: summaries.filter((s) => s.hour >= 21).length,
    }),
  };
}

/* ── Histórico de um exercício ──────────────────────────────────────────── */

export async function exerciseStats(userId: string, key: string) {
  const exercise = EXERCISE_BY_KEY.get(key);
  if (!exercise) throw new AppError(404, 'Exercício não encontrado');
  const logs = await prisma.workoutLog.findMany({
    where: { userId, exerciseKey: key }, orderBy: { createdAt: 'asc' }, include: logInclude, take: 200,
  }) as LogWithSets[];

  let running: Best | undefined;
  const points = logs.map((log) => {
    const sets = setsOfLog(log);
    const best = bestOf(sets);
    const records = detectRecords(sets, running ?? null).length;
    if (sets.length) running = mergeBest(running, best);
    const top = sets.reduce<SetEntry | null>((acc, set) => !acc || (set.loadKg ?? 0) * 1000 + set.reps > (acc.loadKg ?? 0) * 1000 + acc.reps ? set : acc, null);
    return { day: log.day, sets, loadKg: best.loadKg, e1rm: best.e1rm, reps: best.reps, volumeKg: Math.round(sets.reduce((sum, set) => sum + setVolume(set), 0)), topSet: top, records };
  }).filter((point) => point.sets.length);

  const range = parseRange(`${exercise.repsMin ?? 8}–${exercise.repsMax ?? 12}`);
  const lowerBody = ['pernas'].includes(exercise.group);
  const last = points[points.length - 1];
  const { primary, secondary } = musclesFor(exercise);
  return {
    key: exercise.key, name: exercise.name, group: exercise.group, equipment: exercise.equipment,
    difficulty: exercise.difficulty,
    primaryMuscles: primary, secondaryMuscles: secondary,
    ...fullDetail(exercise),
    unit: exercise.unit ?? 'reps',
    progression: exercise.progression ?? '', regression: exercise.regression ?? '',
    history: points.slice(-30),
    best: running ?? null,
    estimated1Rm: running?.e1rm ? round1(running.e1rm) : null,
    suggestion: suggestNext(last?.sets ?? [], range, lowerBody),
    sessions: points.length,
  };
}

/* ── Atalhos do chat ────────────────────────────────────────────────────── */

/** Exercícios do plano de hoje e os que já têm registro hoje. */
export async function todayForChat(userId: string) {
  const profile = await prisma.trainingProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const today = todayKey();
  const [plan, logs, xp] = await Promise.all([
    planForProfile(profile),
    prisma.workoutLog.findMany({ where: { userId, day: today }, select: { exerciseKey: true, minutes: true } }),
    totalXp(userId),
  ]);
  const trained = await prisma.workoutSession.findMany({ where: { userId, status: 'COMPLETED' }, select: { day: true }, distinct: ['day'] });
  const workout = plan.days.find((item) => item.weekday === weekdayOf(today))!;
  const doneKeys = new Set(logs.map((log) => log.exerciseKey).filter(Boolean) as string[]);
  return {
    profile,
    workout,
    doneKeys,
    level: levelFromXp(xp),
    streak: trainingStreak(new Set(trained.map((row) => row.day)), profile.trainingWeekdays, today),
  };
}

/** Anota um exercício de hoje com a prescrição (o chat não sabe carga nem reps). */
export async function quickLog(userId: string, exerciseKey: string) {
  const state = await todayForChat(userId);
  if (!state) throw new AppError(400, ONBOARDING_REQUIRED);
  const planned = state.workout.exercises.find((exercise) => exercise.key === exerciseKey);
  if (!planned) throw new AppError(400, 'Exercício fora do treino de hoje.');
  const today = todayKey();
  const existing = await prisma.workoutSession.findFirst({ where: { userId, day: today, title: `${state.workout.title} (chat)` } });
  const session = existing ?? await prisma.workoutSession.create({
    data: { userId, day: today, title: `${state.workout.title} (chat)`, status: 'COMPLETED', completedAt: new Date() },
  });
  const exercise = EXERCISE_BY_KEY.get(exerciseKey)!;
  await prisma.workoutLog.create({
    data: {
      userId, day: today, sessionId: session.id, exercise: exercise.name, exerciseKey, muscleGroup: exercise.group,
      sets: planned.sets, reps: planned.repsMin, minutes: planned.minutes,
      setDetails: { create: Array.from({ length: planned.sets }, (_, index) => ({ setNumber: index + 1, reps: planned.repsMin })) },
    },
  });
  await prisma.workoutSession.update({ where: { id: session.id }, data: { completedAt: new Date() } });
  return { planned, remaining: state.workout.exercises.filter((item) => item.key !== exerciseKey && !state.doneKeys.has(item.key)) };
}

