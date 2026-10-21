/**
 * Casos de uso do trainer, fora da camada HTTP.
 *
 * O controller só valida entrada e formata resposta; a lógica fica aqui. Isso
 * deixa o módulo testável sem subir servidor e sem simular cookies.
 */
import { createHash } from 'node:crypto';
import { prisma } from '../../config/prisma';
import { getProfile, getStats, weeklyRawData, toRuleProfile, todayKey } from './service';
import { screenOut } from './rules';
import { narrateMission, weeklyReport, biomechanicsAnswer, mealPlan, reviewTraining, aiEnabled } from './ai';
import { computeDiet, isPlantBased, type DietProfile } from './diet';
import { fullDetail } from './exerciseDetails';
import { EXERCISES, GOALS, GOAL_LABELS, EQUIPMENT_LABELS, INJURY_LABELS } from './exercises';
import { musclesFor } from './muscles';
import { planForProfile, todayForChat, quickLog } from './workouts';
import { AppError } from '../../utils/errors';
import { generateWeeklyPlan } from './weeklyPlan';
import type { BodyAssessmentInput } from '../../validators/trainer.validator';

/* ── Constantes e helpers compartilhados ────────────────────────────────── */

const ONBOARDING_REQUIRED = 'Faça o cadastro do treino primeiro.';
const DAY_MS = 86_400_000;
/** Cada 100 XP equivalem a 1 ponto de Disciplina no relatório semanal. */
const XP_PER_DISCIPLINE_POINT = 100;
/** Fator de atividade por nº de dias de treino na semana (índice = dias). */
const ACTIVITY_FACTORS = [1.2, 1.35, 1.45, 1.55, 1.65, 1.72, 1.8];

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

interface LatestAssessment {
  weightKg: number; bodyFatPercent: number | null; waistCm: number | null; neckCm: number | null;
  hipCm: number | null; restingHeartRate: number | null; sleepHours: number | null;
  fatigue: number | null; muscleSoreness: number | null; nutritionAdherence: number | null;
}

/** Índice por chave: evita varrer EXERCISES com .find a cada consulta. */
const EXERCISE_BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]));

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const goalLabel = (goal: string) => GOAL_LABELS[goal as never] ?? 'Treino';

/**
 * Chave de dia (YYYY-MM-DD) de N dias atrás.
 * ATENÇÃO: deve usar o mesmo critério de fuso que `todayKey()`. O ideal é
 * mover este helper para ./service, ao lado dele.
 */
const daysAgoKey = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

/** Busca o perfil ou falha com a mesma mensagem em todos os casos de uso. */
async function requireProfile(userId: string): Promise<Profile> {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, ONBOARDING_REQUIRED);
  return profile;
}

/** Perfil + stats em paralelo, já convertidos para o formato do motor de regras. */
async function loadRuleContext(userId: string) {
  const [profile, stats] = await Promise.all([getProfile(userId), getStats(userId)]);
  if (!profile) throw new AppError(400, ONBOARDING_REQUIRED);
  return { profile, stats, rule: toRuleProfile(profile, stats.level) };
}

/** Perfil do banco → entrada do motor de dieta. */
function toDietProfile(p: {
  weightKg: number; heightCm: number; birthYear: number; sex: string; goal: string;
  somatotype: string | null; experience: string; trainingDays: number;
  sleepHours: number; waterLiters: number; dietQuality: string;
  dietRestrictions: string[];
}): DietProfile {
  return {
    weightKg: p.weightKg, heightCm: p.heightCm, birthYear: p.birthYear,
    sex: p.sex as DietProfile['sex'], goal: p.goal,
    somatotype: p.somatotype as DietProfile['somatotype'],
    experience: p.experience, trainingDays: p.trainingDays,
    sleepHours: p.sleepHours, waterLiters: p.waterLiters,
    dietQuality: p.dietQuality as DietProfile['dietQuality'],
    dietRestrictions: p.dietRestrictions,
  };
}

/* ── Onboarding ─────────────────────────────────────────────────────────── */

export interface OnboardingInput {
  weightKg: number; heightCm: number; birthYear: number;
  sex: 'M' | 'F' | 'OTHER'; goal: string;
  equipment: string[]; injuries: string[]; minutesPerDay: number;
  somatotype?: string;
  experience?: string;
  trainingDays?: number;
  trainingWeekdays?: number[];
  trainingLocation?: string;
  targetWeightKg?: number;
  pregnancy?: boolean;
  heartCondition?: boolean;
  medicationUse?: boolean;
  parqAnswers?: Record<string, boolean> | null;
  sleepHours?: number;
  waterLiters?: number;
  mealsPerDay?: number;
  dietQuality?: string;
  dietNotes?: string;
  dietRestrictions?: string[];
  restrictionNotes?: string;
}

export async function onboardCall(userId: string, username: string, data: OnboardingInput) {
  const day = todayKey(); // uma única leitura: não muda de dia no meio da função
  const sleepHours = data.sleepHours ?? 7;

  // Transação: ou grava perfil, stats e avaliação inicial, ou não grava nada.
  const [profile] = await prisma.$transaction([
    prisma.trainingProfile.upsert({
      where: { userId },
      create: { userId, ...data } as never,
      update: { ...data } as never,
    }),
    prisma.playerStats.upsert({ where: { userId }, create: { userId }, update: {} }),
    prisma.bodyAssessment.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, weightKg: data.weightKg, sleepHours },
      update: { weightKg: data.weightKg, sleepHours },
    }),
  ]);

  const plan = await planForProfile(profile);
  const first = plan.days.find((day) => day.isTrainingDay);
  const rule = toRuleProfile(profile, 1);
  const blocked = EXERCISES
    .map((e) => ({ name: e.name, reason: screenOut(e, rule) }))
    .filter((e): e is { name: string; reason: string } => e.reason !== null);

  const intro = await narrateMission({
    username,
    goalLabel: goalLabel(profile.goal),
    plan: {
      title: first ? `${first.label}: ${first.title}` : plan.split,
      blocks: (first?.exercises ?? []).map((e) => ({
        key: e.key, name: e.name, group: e.muscle, target: `${e.sets}×${e.reps}`, minutes: e.minutes, xp: 0,
      })),
      plannedMinutes: first?.plannedMinutes ?? 0,
    },
    exclusions: blocked.slice(0, 6),
  });

  return { profile, intro };
}

/* ── Métricas corporais ─────────────────────────────────────────────────── */

function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

const clampBodyFat = (n: number) => Math.max(2, Math.min(70, n));

/** % de gordura: valor informado → Navy (com medidas) → Deurenberg (só IMC/idade). */
function estimateBodyFat(profile: Profile, latest: LatestAssessment | null, bmi: number, age: number) {
  if (latest?.bodyFatPercent != null) {
    return { percent: clampBodyFat(latest.bodyFatPercent), method: 'informado' as string | null };
  }
  if (age < 18) return { percent: null, method: null };

  const inches = (cm: number) => cm / 2.54;
  const waist = latest?.waistCm;
  const neck = latest?.neckCm;
  const hip = latest?.hipCm;

  if (profile.sex === 'M' && waist && neck && waist > neck) {
    const pct = 86.010 * Math.log10(inches(waist - neck)) - 70.041 * Math.log10(inches(profile.heightCm)) + 36.76;
    return { percent: clampBodyFat(pct), method: 'estimativa Navy' };
  }
  if (profile.sex === 'F' && waist && neck && hip && waist + hip > neck) {
    const pct = 163.205 * Math.log10(inches(waist + hip - neck)) - 97.684 * Math.log10(inches(profile.heightCm)) - 78.387;
    return { percent: clampBodyFat(pct), method: 'estimativa Navy' };
  }
  if (profile.sex !== 'OTHER') {
    const pct = 1.2 * bmi + 0.23 * age - (profile.sex === 'M' ? 10.8 : 0) - 5.4;
    return { percent: clampBodyFat(pct), method: 'estimativa Deurenberg' };
  }
  return { percent: null, method: null };
}

/** Prontidão 0-100: sono (40%), fadiga (30%) e dor muscular (30%). Null se faltar dado. */
function readinessScore(latest: LatestAssessment | null): number | null {
  if (!latest) return null;
  const { sleepHours, fatigue, muscleSoreness } = latest;
  if (sleepHours == null || fatigue == null || muscleSoreness == null) return null;
  return Math.round(
    Math.min(100, (sleepHours / 8) * 100) * 0.4
    + (10 - fatigue) * 10 * 0.3
    + (10 - muscleSoreness) * 10 * 0.3,
  );
}

/** Melhor 1RM estimado (Epley) POR exercício — antes o top 5 podia repetir o mesmo exercício. */
function bestEstimated1Rm(
  logged: { exercise: string; reps: number; loadKg: number | null; createdAt: Date }[],
) {
  const best = new Map<string, { name: string; estimated1RmKg: number; day: string }>();
  for (const entry of logged) {
    if (entry.loadKg === null || entry.loadKg <= 0 || entry.reps <= 0) continue;
    const estimated1RmKg = round1(entry.loadKg * (1 + entry.reps / 30));
    const current = best.get(entry.exercise);
    if (!current || estimated1RmKg > current.estimated1RmKg) {
      best.set(entry.exercise, { name: entry.exercise, estimated1RmKg, day: entry.createdAt.toISOString().slice(0, 10) });
    }
  }
  return [...best.values()].sort((a, b) => b.estimated1RmKg - a.estimated1RmKg).slice(0, 5);
}

function safetyWarningsFor(profile: Profile, age: number): string[] {
  const warnings: (string | null)[] = [
    age < 18 ? 'Menor de 18 anos: procure supervisão de um responsável e de profissional qualificado antes de treinar.' : null,
    profile.pregnancy ? 'Gestação informada: procure orientação individualizada de um profissional de saúde.' : null,
    profile.heartCondition ? 'Condição cardíaca informada: obtenha liberação e orientação médica antes de iniciar exercícios.' : null,
    profile.medicationUse ? 'Uso de medicação informado: confirme com um profissional de saúde se há cuidados específicos para o exercício.' : null,
    profile.parqAnswers && Object.values(profile.parqAnswers as Record<string, boolean>).some(Boolean)
      ? 'A triagem PAR-Q teve resposta positiva. Procure orientação de um profissional de saúde antes de iniciar ou intensificar os exercícios.'
      : null,
  ];
  return warnings.filter((w): w is string => w !== null);
}

function bodyMetrics(
  profile: Profile,
  latest: LatestAssessment | null,
  loggedExercises: { exercise: string; reps: number; loadKg: number | null; createdAt: Date }[],
  assessmentCount: number,
  daysSinceAssessment: number,
) {
  const weightKg = latest?.weightKg ?? profile.weightKg;
  const heightM = profile.heightCm / 100;
  const age = ageFromBirthYear(profile.birthYear);
  const bmi = weightKg / (heightM * heightM);

  const { percent: bodyFatPercent, method: bodyFatMethod } = estimateBodyFat(profile, latest, bmi, age);
  const leanMassKg = bodyFatPercent === null ? null : weightKg * (1 - bodyFatPercent / 100);

  const sexOffset = profile.sex === 'M' ? 5 : profile.sex === 'F' ? -161 : -78;
  const bmr = Math.round(10 * weightKg + 6.25 * profile.heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * (ACTIVITY_FACTORS[Math.min(6, profile.trainingDays)] ?? 1.45));

  // Faixas de IMC valem para adultos; para menores o correto é percentil de crescimento.
  const bmiCategory = age < 18
    ? 'Para menores de 18 anos, avalie o IMC por percentil (curvas de crescimento)'
    : bmi < 18.5 ? 'Abaixo da faixa de referência'
    : bmi < 25 ? 'Faixa de referência'
    : bmi < 30 ? 'Acima da faixa de referência'
    : 'Faixa elevada';

  const waist = latest?.waistCm;
  const hip = latest?.hipCm;

  return {
    age, weightKg, bmi: round1(bmi), bmiCategory,
    bodyFatPercent: bodyFatPercent === null ? null : round1(bodyFatPercent),
    bodyFatMethod,
    fatMassKg: bodyFatPercent === null ? null : round1(weightKg * bodyFatPercent / 100),
    leanMassKg: leanMassKg === null ? null : round1(leanMassKg),
    ffmi: leanMassKg === null ? null : round1(leanMassKg / (heightM * heightM)),
    waistToHeight: waist ? round2(waist / profile.heightCm) : null,
    waistToHip: waist && hip ? round2(waist / hip) : null,
    bsaM2: round2(Math.sqrt(profile.heightCm * weightKg / 3600)),
    referenceWeightKg: round1(22 * heightM * heightM),
    targetWeightKg: profile.targetWeightKg,
    bmr, tdee,
    waterLiters: Math.max(1.5, round1(weightKg * 0.035 + profile.trainingDays * 0.15)),
    restingHeartRate: latest?.restingHeartRate ?? null,
    sleepHours: latest?.sleepHours ?? null,
    fatigue: latest?.fatigue ?? null,
    muscleSoreness: latest?.muscleSoreness ?? null,
    nutritionAdherence: latest?.nutritionAdherence ?? null,
    readinessScore: readinessScore(latest),
    estimated1Rm: bestEstimated1Rm(loggedExercises),
    assessmentCount,
    assessmentDue: assessmentCount === 0 || daysSinceAssessment >= 14,
    daysSinceAssessment,
    adherenceNote: 'Aderência e tendências ficam mais representativas após registrar treinos e avaliações ao longo do tempo.',
    safetyWarnings: safetyWarningsFor(profile, age),
  };
}

/* ── Plano semanal e painel de dados ────────────────────────────────────── */

/** Gera o plano a partir de um perfil já carregado (evita nova ida ao banco). */
function buildWeeklyPlan(profile: Profile) {
  return generateWeeklyPlan({
    goal: profile.goal, equipment: profile.equipment, injuries: profile.injuries,
    birthYear: profile.birthYear, experience: profile.experience,
    trainingDays: profile.trainingDays, trainingWeekdays: profile.trainingWeekdays,
    trainingLocation: profile.trainingLocation, sleepHours: profile.sleepHours,
    minutesPerDay: profile.minutesPerDay,
  });
}

export async function weeklyPlanCall(userId: string) {
  return planForProfile(await requireProfile(userId));
}

export async function dataCall(userId: string) {
  const found = await prisma.trainingProfile.findUnique({
    where: { userId },
    include: { assessments: { orderBy: { day: 'desc' }, take: 24 } },
  });
  if (!found) throw new AppError(400, ONBOARDING_REQUIRED);
  // `assessments` sai do objeto de perfil para não ir duplicado na resposta.
  const { assessments: assessmentsDesc, ...profile } = found;

  const logs = await prisma.workoutLog.findMany({
    where: { userId, day: { gte: daysAgoKey(90) } },
    orderBy: { createdAt: 'asc' },
  });
  const sessions = await prisma.workoutSession.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 12,
    include: {
      logs: {
        select: {
          exercise: true, sets: true, reps: true, loadKg: true,
          setDetails: { select: { rir: true } },
        },
      },
    },
  });

  const assessments = assessmentsDesc.slice().reverse();
  const latest = assessments[assessments.length - 1] ?? null;
  const daysSinceAssessment = latest
    ? Math.floor((Date.now() - new Date(`${latest.day}T12:00:00`).getTime()) / DAY_MS)
    : 0;

  // Aderência dos últimos 30 dias: sessões previstas x dias com treino registrado.
  const plannedWeekdays = new Set(profile.trainingWeekdays);
  const plannedSessions = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return plannedWeekdays.has(date.getDay());
  }).filter(Boolean).length;
  const cutoff = daysAgoKey(30);
  const completedSessions = new Set(logs.map((log) => log.day).filter((day) => day >= cutoff)).size;

  const plan = buildWeeklyPlan(profile as Profile);

  return {
    profile,
    metrics: {
      ...bodyMetrics(profile as Profile, latest, logs, assessments.length, daysSinceAssessment),
      weightTrendKg: assessments.length > 1
        ? round1(assessments[assessments.length - 1].weightKg - assessments[0].weightKg)
        : null,
    },
    assessments,
    history: assessments.map((a) => ({
      day: a.day, weightKg: a.weightKg, bodyFatPercent: a.bodyFatPercent,
      waistCm: a.waistCm, sleepHours: a.sleepHours, fatigue: a.fatigue,
    })),
    adherence: {
      completedSessions,
      plannedSessions,
      percent: plannedSessions ? Math.min(100, Math.round((completedSessions / plannedSessions) * 100)) : 0,
    },
    weeklyVolume: plan.matrix.map(({ key, label, weeklySets, targetMin, targetMax }) => ({ key, label, weeklySets, targetMin, targetMax })),
    strengthHistory: logs
      .filter((entry) => entry.loadKg !== null)
      .map((entry) => ({ day: entry.day, exercise: entry.exercise, loadKg: entry.loadKg, sets: entry.sets, reps: entry.reps })),
    recentSessions: sessions.map((session) => ({
      id: session.id,
      day: session.day,
      title: session.title,
      status: session.status,
      notes: session.notes,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      exercises: session.logs.map((log) => ({
        exercise: log.exercise,
        sets: log.sets,
        reps: log.reps,
        loadKg: log.loadKg,
        averageRir: log.setDetails.length
          ? round1(log.setDetails.reduce((sum, set) => sum + (set.rir ?? 0), 0) / log.setDetails.length)
          : null,
      })),
    })),
    disclaimer: plan.disclaimer,
  };
}

export async function saveAssessmentCall(userId: string, data: BodyAssessmentInput) {
  await requireProfile(userId);
  const day = todayKey();
  // Transação: a avaliação e o peso do perfil andam juntos.
  const [assessment] = await prisma.$transaction([
    prisma.bodyAssessment.upsert({
      where: { userId_day: { userId, day } },
      create: { ...data, userId, day },
      update: data,
    }),
    prisma.trainingProfile.update({ where: { userId }, data: { weightKg: data.weightKg } }),
  ]);
  return assessment;
}

/** Opções do cadastro, servidas pelo servidor para o frontend não duplicar rótulos. */
export function meta() {
  return { goals: GOALS, equipment: EQUIPMENT_LABELS, injuries: INJURY_LABELS };
}

/* ── Missão diária, biblioteca, relatório e IA ──────────────────────────── */

export async function dashboardCall(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) return { onboarded: false as const, aiEnabled: aiEnabled() };
  return { onboarded: true as const, profile, aiEnabled: aiEnabled() };
}

export async function libraryCall(userId: string, filters: { query?: string; group?: string; equipment?: string } = {}) {
  const { rule } = await loadRuleContext(userId);
  const query = normalize(filters.query ?? '');

  // Uma única passada: antes screenOut rodava duas vezes por exercício.
  const allowed: {
    key: string; name: string; group: string; difficulty: unknown; equipment: unknown;
    muscles: string; howTo: string; benefits: string; progression: string; regression: string;
    suggestedSets?: number; repsMin?: number; repsMax?: number; restSeconds?: number;
    unit: string; primaryMuscles: number[]; secondaryMuscles: number[];
  }[] = [];
  const blocked: { key: string; name: string; reason: string }[] = [];
  for (const e of EXERCISES) {
    const reason = screenOut(e, rule);
    const matchesQuery = !query || normalize(`${e.name} ${e.group} ${e.muscles ?? ''}`).includes(query);
    const matchesGroup = !filters.group || e.group === filters.group;
    const matchesEquipment = !filters.equipment || e.equipment.includes(filters.equipment as never);
    if (reason === null && matchesQuery && matchesGroup && matchesEquipment) {
      allowed.push({
        key: e.key, name: e.name, group: e.group, difficulty: e.difficulty, equipment: e.equipment,
        muscles: e.muscles ?? '', howTo: e.howTo ?? '', benefits: e.benefits ?? '',
        progression: e.progression ?? '', regression: e.regression ?? '',
        suggestedSets: e.suggestedSets, repsMin: e.repsMin, repsMax: e.repsMax,
        restSeconds: e.restSeconds,
        unit: e.unit ?? 'reps',
        primaryMuscles: musclesFor(e).primary,
        secondaryMuscles: musclesFor(e).secondary,
      });
    } else if (reason !== null) {
      blocked.push({ key: e.key, name: e.name, reason });
    }
  }
  return { allowed, blocked, filters: { query: filters.query ?? '', group: filters.group ?? '', equipment: filters.equipment ?? '' } };
}

export async function reportCall(userId: string, username: string) {
  const [state, raw] = await Promise.all([todayForChat(userId), weeklyRawData(userId)]);
  if (!state) throw new AppError(400, ONBOARDING_REQUIRED);
  const { profile, level, streak } = state;

  const totalXp = raw.missions.reduce((sum, m) => sum + m.xpAwarded, 0);
  const report = await weeklyReport({
    username,
    goalLabel: goalLabel(profile.goal),
    level: level.current,
    levelTitle: level.title,
    streak,
    completedDays: new Set(raw.logs.map((log) => log.day)).size,
    totalMinutes: raw.totalMinutes,
    statGains: [{ attr: 'Disciplina', gain: totalXp / XP_PER_DISCIPLINE_POINT }],
  });

  return {
    report,
    aiEnabled: aiEnabled(),
    raw: { completedDays: raw.completedDays, totalMinutes: raw.totalMinutes },
  };
}

/** Só recebe exercícios liberados ao perfil — a IA não pode citar o que está bloqueado. */
export async function askCall(userId: string, question: string) {
  const { profile, rule } = await loadRuleContext(userId);
  const answer = await biomechanicsAnswer(question, {
    injuries: profile.injuries,
    equipment: profile.equipment,
    exerciseList: EXERCISES.filter((e) => screenOut(e, rule) === null).map((e) => e.name).join(', '),
  });
  return { answer, aiEnabled: aiEnabled() };
}

/* ── Atalhos para o chat do Sano ────────────────────────────────────────── */

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Resumo do treino de hoje para o Sano — o mesmo plano que a tela mostra. */
export async function statusForChat(userId: string) {
  const state = await todayForChat(userId);
  if (!state) return { onboarded: false as const };
  const { workout, doneKeys, level, streak, profile } = state;
  const done = workout.exercises.filter((e) => doneKeys.has(e.key));
  return {
    onboarded: true as const,
    goalLabel: goalLabel(profile.goal),
    level: level.current,
    levelTitle: level.title,
    streak,
    debuffed: false,
    restDay: !workout.isTrainingDay,
    mission: workout.isTrainingDay ? {
      title: workout.title,
      plannedMinutes: workout.plannedMinutes,
      done: done.length,
      total: workout.exercises.length,
      doneMinutes: done.reduce((sum, e) => sum + e.minutes, 0),
    } : null,
  };
}

/** Palavras de comando que não identificam exercício ("completei flexão"). */
const COMMAND_WORDS = new Set([
  'completei', 'conclui', 'concluido', 'terminei', 'finalizei', 'acabei', 'fiz', 'feito',
  'marcar', 'marca', 'treino', 'exercicio', 'exercicios', 'hoje',
]);

/** Plural simples → singular ("flexões" → "flexao", "agachamentos" → "agachamento"). */
const stem = (word: string) => word.replace(/(oes|aes)$/, 'ao').replace(/s$/, '');

const keywords = (text: string) =>
  normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !COMMAND_WORDS.has(w))
    .map(stem);

/**
 * Marca um bloco pelo NOME do exercício ("completei flexão").
 * Normaliza acento, plural e palavras de comando; pede esclarecimento se o
 * nome casar com mais de um exercício, em vez de escolher o primeiro.
 */
export async function completeByName(userId: string, nameWanted: string) {
  const wanted = keywords(nameWanted);
  if (!wanted.length) return { ok: false, message: 'Diga qual exercício você concluiu.' };

  const state = await todayForChat(userId);
  if (!state) return { ok: false, message: 'Faça o cadastro no módulo Treino antes de registrar exercícios.' };
  if (!state.workout.isTrainingDay) return { ok: false, message: 'Hoje é dia de descanso no seu plano. Para registrar um treino extra, use a tela de Treino.' };

  const exercises = state.workout.exercises;
  const scored = exercises
    .map((exercise) => {
      const words = keywords(exercise.name);
      return { exercise, score: wanted.filter((w) => words.some((t) => t.includes(w))).length };
    })
    .filter((x) => x.score > 0);

  if (!scored.length) {
    return { ok: false, message: `Não achei "${nameWanted}" no treino de hoje.\nExercícios do dia: ${exercises.map((e) => e.name).join(', ')}` };
  }
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score === top);
  if (best.length > 1) {
    return { ok: false, message: `"${nameWanted}" combina com mais de um exercício: ${best.map((x) => x.exercise.name).join(', ')}. Diga o nome completo.` };
  }

  const { exercise } = best[0];
  if (state.doneKeys.has(exercise.key)) return { ok: false, message: `${exercise.name} já estava anotado hoje.` };

  const { remaining } = await quickLog(userId, exercise.key);
  return {
    ok: true,
    message: remaining.length
      ? `Anotado: ${exercise.name} (${exercise.sets}×${exercise.repsMin}). Faltam ${remaining.length}: ${remaining.map((e) => e.name).join(', ')}.\nPara registrar carga e repetições reais, use a tela de Treino.`
      : `Treino de hoje concluído! ${exercise.name} era o último.`,
  };
}

/* ── Dieta ──────────────────────────────────────────────────────────────── */

/** Números + refeições do dia. Calculado pelo código; a IA só escreve os pratos. */
export async function dietCall(userId: string, username: string) {
  const profile = await requireProfile(userId);
  const day = todayKey();
  const n = computeDiet(toDietProfile(profile));

  // O cache só vale se as entradas do cardápio não mudaram desde que ele foi gerado.
  // Sem isso, trocar peso, refeições/dia ou restrições mostrava números novos
  // com pratos antigos.
  const inputHash = createHash('sha1')
    .update(JSON.stringify([n.kcal, n.proteinG, n.carbG, n.fatG, profile.mealsPerDay, profile.dietRestrictions, profile.dietNotes ?? '']))
    .digest('hex')
    .slice(0, 16);

  const existing = await prisma.dietPlan.findUnique({
    where: { userId_day: { userId, day } },
    select: { meals: true, rationale: true },
  });
  const existingHash = (existing?.rationale as { inputHash?: string } | null)?.inputHash;
  if (existing?.meals && existingHash === inputHash) {
    return { numbers: n, meals: existing.meals, aiEnabled: aiEnabled(), cached: true };
  }

  const meals = await mealPlan({
    kcal: n.kcal, proteinG: n.proteinG, carbG: n.carbG, fatG: n.fatG,
    mealsPerDay: profile.mealsPerDay,
    restrictions: profile.dietRestrictions,
    plantBased: isPlantBased(profile.dietRestrictions),
    dietNotes: profile.dietNotes ?? undefined,
  });

  // Um único upsert com números + cardápio (antes eram upsert + update).
  const fields = {
    kcal: n.kcal, proteinG: n.proteinG, carbG: n.carbG, fatG: n.fatG,
    rationale: { why: n.rationale, inputHash },
    meals,
  };
  await prisma.dietPlan.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...fields },
    update: fields,
  });

  return { numbers: n, meals, aiEnabled: aiEnabled(), cached: false };
}

/** Detalhe de um exercício: como fazer, músculo, erro comum e tempos do cronômetro. */
export function exerciseDetailCall(key: string) {
  const ex = EXERCISE_BY_KEY.get(key);
  if (!ex) throw new AppError(404, 'Exercício não encontrado');
  return { key: ex.key, name: ex.name, group: ex.group, ...fullDetail(ex) };
}

/**
 * Revisão crítica do treino pela IA.
 *
 * É aqui que a IA corrige o que regra fixa não alcança. Ela recebe os
 * bloqueados explicitamente para não sugerir nada proibido.
 */
export async function reviewCall(userId: string) {
  const { profile, rule } = await loadRuleContext(userId);
  const plan = await planForProfile(profile);
  const exercises = plan.days.flatMap((day) => day.exercises);
  const blockedCount = EXERCISES.filter((e) => screenOut(e, rule) !== null).length;

  const review = await reviewTraining({
    profile: `objetivo ${goalLabel(profile.goal)}, ${profile.experience}, ${profile.trainingDays}x/semana, lesões: ${profile.injuries.join(', ') || 'nenhuma'}`,
    blocks: exercises.map((e) => ({ name: e.name, target: `${e.sets}×${e.reps}`, minutes: e.minutes })),
    blocked: [`${blockedCount} exercícios bloqueados por segurança/equipamento`],
  });

  return { review, aiEnabled: aiEnabled() };
}