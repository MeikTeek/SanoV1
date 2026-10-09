/**
 * Casos de uso do trainer, fora da camada HTTP.
 *
 * O controller só valida entrada e formata resposta; a lógica fica aqui. Isso
 * deixa o módulo testável sem subir servidor e sem simular cookies.
 */
import { prisma } from '../../config/prisma';
import { getProfile, getStats, getOrCreateMission, getDashboard, completeBlock, applyPenaltyIfMissed, weeklyRawData, toRuleProfile, todayKey } from './service';
import { generateMission, screenOut, type Block } from './rules';
import { narrateMission, weeklyReport, biomechanicsAnswer, mealPlan, reviewTraining, aiEnabled } from './ai';
import { computeDiet, isPlantBased, type DietProfile } from './diet';
import { fullDetail } from './exerciseDetails';
import { EXERCISES, GOALS, GOAL_LABELS, EQUIPMENT_LABELS, INJURY_LABELS } from './exercises';
import { levelTitle } from './progress';
import { AppError } from '../../utils/errors';
import { generateWeeklyPlan } from './weeklyPlan';
import type { BodyAssessmentInput, WorkoutLogInput } from '../../validators/trainer.validator';

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
  const profile = await prisma.trainingProfile.upsert({
    where: { userId },
    create: { userId, ...data } as never,
    update: { ...data } as never,
  });
  await prisma.playerStats.upsert({ where: { userId }, create: { userId }, update: {} });

  const stats = await getStats(userId);
  const plan = generateMission(toRuleProfile(profile, stats.level), 0);
  const mission = await getOrCreateMission(userId);
  await prisma.bodyAssessment.upsert({
    where: { userId_day: { userId, day: todayKey() } },
    create: { userId, day: todayKey(), weightKg: data.weightKg, sleepHours: data.sleepHours ?? 7 },
    update: { weightKg: data.weightKg, sleepHours: data.sleepHours ?? 7 },
  });

  const intro = await narrateMission({
    username,
    goalLabel: GOAL_LABELS[profile.goal as never] ?? 'Treino',
    plan: { title: plan.title, blocks: plan.blocks, plannedMinutes: plan.plannedMinutes },
    exclusions: plan.excluded,
  });

  return { profile, mission, intro };
}

function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

function bodyMetrics(
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>,
  latest: {
    weightKg: number; bodyFatPercent: number | null; waistCm: number | null; neckCm: number | null;
    hipCm: number | null; restingHeartRate: number | null; sleepHours: number | null;
    fatigue: number | null; muscleSoreness: number | null; nutritionAdherence: number | null;
  } | null,
  loggedExercises: { exercise: string; sets: number; reps: number; loadKg: number | null; muscleGroup: string | null; createdAt: Date }[],
  assessmentCount: number,
  daysSinceAssessment: number,
) {
  const weightKg = latest?.weightKg ?? profile.weightKg;
  const heightM = profile.heightCm / 100;
  const age = ageFromBirthYear(profile.birthYear);
  const bmi = weightKg / (heightM * heightM);
  const adult = age >= 18;
  const waist = latest?.waistCm;
  const neck = latest?.neckCm;
  const hip = latest?.hipCm;
  const inches = (cm: number) => cm / 2.54;
  let bodyFatPercent = latest?.bodyFatPercent ?? null;
  let bodyFatMethod: string | null = bodyFatPercent === null ? null : 'informado';
  if (bodyFatPercent === null && adult && profile.sex === 'M' && waist && neck && waist > neck) {
    bodyFatPercent = 86.010 * Math.log10(inches(waist - neck)) - 70.041 * Math.log10(inches(profile.heightCm)) + 36.76;
    bodyFatMethod = 'estimativa Navy';
  } else if (bodyFatPercent === null && adult && profile.sex === 'F' && waist && neck && hip && waist + hip > neck) {
    bodyFatPercent = 163.205 * Math.log10(inches(waist + hip - neck)) - 97.684 * Math.log10(inches(profile.heightCm)) - 78.387;
    bodyFatMethod = 'estimativa Navy';
  } else if (bodyFatPercent === null && adult && profile.sex !== 'OTHER') {
    bodyFatPercent = 1.2 * bmi + 0.23 * age - (profile.sex === 'M' ? 10.8 : 0) - 5.4;
    bodyFatMethod = 'estimativa Deurenberg';
  }
  if (bodyFatPercent !== null) bodyFatPercent = Math.max(2, Math.min(70, bodyFatPercent));
  const leanMassKg = bodyFatPercent === null ? null : weightKg * (1 - bodyFatPercent / 100);
  const bmrBase = 10 * weightKg + 6.25 * profile.heightCm - 5 * age;
  const bmr = Math.round(bmrBase + (profile.sex === 'M' ? 5 : profile.sex === 'F' ? -161 : -78));
  const readinessScore = latest?.sleepHours !== null && latest?.sleepHours !== undefined
    && latest.fatigue !== null && latest.fatigue !== undefined
    && latest.muscleSoreness !== null && latest.muscleSoreness !== undefined
    ? Math.round(Math.min(100, latest.sleepHours / 8 * 100) * 0.4 + (10 - latest.fatigue) * 10 * 0.3 + (10 - latest.muscleSoreness) * 10 * 0.3)
    : null;
  const activity: Record<number, number> = { 0: 1.2, 1: 1.35, 2: 1.45, 3: 1.55, 4: 1.65, 5: 1.72, 6: 1.8 };
  const tdee = Math.round(bmr * (activity[Math.min(6, profile.trainingDays)] ?? 1.45));
  const epley = loggedExercises
    .filter((entry) => entry.loadKg !== null && entry.loadKg > 0 && entry.reps > 0)
    .map((entry) => ({ name: entry.exercise, estimated1RmKg: Math.round(entry.loadKg! * (1 + entry.reps / 30) * 10) / 10, day: entry.createdAt.toISOString().slice(0, 10) }))
    .sort((a, b) => b.estimated1RmKg - a.estimated1RmKg)
    .slice(0, 5);
  const safetyWarnings = [
    age < 18 ? 'Menor de 18 anos: procure supervisão de um responsável e de profissional qualificado antes de treinar.' : null,
    profile.pregnancy ? 'Gestação informada: procure orientação individualizada de um profissional de saúde.' : null,
    profile.heartCondition ? 'Condição cardíaca informada: obtenha liberação e orientação médica antes de iniciar exercícios.' : null,
    profile.medicationUse ? 'Uso de medicação informado: confirme com um profissional de saúde se há cuidados específicos para o exercício.' : null,
    profile.parqAnswers && Object.values(profile.parqAnswers as Record<string, boolean>).some(Boolean)
      ? 'A triagem PAR-Q teve resposta positiva. Procure orientação de um profissional de saúde antes de iniciar ou intensificar os exercícios.'
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  return {
    age, weightKg, bmi: Math.round(bmi * 10) / 10,
    bmiCategory: bmi < 18.5 ? 'Abaixo da faixa de referência' : bmi < 25 ? 'Faixa de referência' : bmi < 30 ? 'Acima da faixa de referência' : 'Faixa elevada',
    bodyFatPercent: bodyFatPercent === null ? null : Math.round(bodyFatPercent * 10) / 10,
    bodyFatMethod,
    fatMassKg: bodyFatPercent === null ? null : Math.round(weightKg * bodyFatPercent / 100 * 10) / 10,
    leanMassKg: leanMassKg === null ? null : Math.round(leanMassKg * 10) / 10,
    ffmi: leanMassKg === null ? null : Math.round(leanMassKg / (heightM * heightM) * 10) / 10,
    waistToHeight: waist ? Math.round((waist / profile.heightCm) * 100) / 100 : null,
    waistToHip: waist && hip ? Math.round((waist / hip) * 100) / 100 : null,
    bsaM2: Math.round(Math.sqrt(profile.heightCm * weightKg / 3600) * 100) / 100,
    referenceWeightKg: Math.round(22 * heightM * heightM * 10) / 10,
    targetWeightKg: profile.targetWeightKg,
    bmr, tdee,
    waterLiters: Math.max(1.5, Math.round((weightKg * 0.035 + profile.trainingDays * 0.15) * 10) / 10),
    restingHeartRate: latest?.restingHeartRate ?? null,
    sleepHours: latest?.sleepHours ?? null,
    fatigue: latest?.fatigue ?? null,
    muscleSoreness: latest?.muscleSoreness ?? null,
    nutritionAdherence: latest?.nutritionAdherence ?? null,
    readinessScore,
    estimated1Rm: epley,
    assessmentCount,
    assessmentDue: assessmentCount === 0 || daysSinceAssessment >= 14,
    daysSinceAssessment,
    adherenceNote: 'Aderência e tendências ficam mais representativas após registrar treinos e avaliações ao longo do tempo.',
    safetyWarnings,
  };
}

export async function weeklyPlanCall(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o cadastro do treino primeiro.');
  return generateWeeklyPlan({
    goal: profile.goal, equipment: profile.equipment, injuries: profile.injuries,
    birthYear: profile.birthYear, experience: profile.experience,
    trainingDays: profile.trainingDays, trainingWeekdays: profile.trainingWeekdays,
    trainingLocation: profile.trainingLocation, sleepHours: profile.sleepHours,
    minutesPerDay: profile.minutesPerDay,
  });
}

export async function dataCall(userId: string) {
  const profile = await prisma.trainingProfile.findUnique({
    where: { userId },
    include: { assessments: { orderBy: { day: 'desc' }, take: 24 } },
  });
  if (!profile) throw new AppError(400, 'Faça o cadastro do treino primeiro.');
  const logs = await prisma.workoutLog.findMany({
    where: { userId, day: { gte: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10) } },
    orderBy: { createdAt: 'asc' },
  });
  const assessments = profile.assessments.slice().reverse();
  const planned = new Set(profile.trainingWeekdays);
  const today = new Date();
  const expectedSessions = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    return planned.has(date.getDay());
  }).filter(Boolean).length;
  const logDays = new Set(logs.map((log) => log.day));
  const recentDays = new Set(Array.from(logDays).filter((day) => day >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)));
  const plan = await weeklyPlanCall(userId);
  const latest = assessments[assessments.length - 1] ?? null;
  const daysSinceAssessment = latest
    ? Math.floor((Date.now() - new Date(`${latest.day}T12:00:00`).getTime()) / 86_400_000)
    : 0;
  return {
    profile,
    metrics: {
      ...bodyMetrics(profile, latest, logs, assessments.length, daysSinceAssessment),
      weightTrendKg: assessments.length > 1
        ? Math.round((assessments[assessments.length - 1].weightKg - assessments[0].weightKg) * 10) / 10
        : null,
    },
    assessments,
    history: assessments.map((entry) => ({ day: entry.day, weightKg: entry.weightKg, bodyFatPercent: entry.bodyFatPercent, waistCm: entry.waistCm, sleepHours: entry.sleepHours, fatigue: entry.fatigue })),
    adherence: { completedSessions: recentDays.size, plannedSessions: expectedSessions, percent: expectedSessions ? Math.min(100, Math.round(recentDays.size / expectedSessions * 100)) : 0 },
    weeklyVolume: plan.matrix.map(({ key, label, weeklySets, targetMin, targetMax }) => ({ key, label, weeklySets, targetMin, targetMax })),
    strengthHistory: logs.filter((entry) => entry.loadKg !== null).map((entry) => ({ day: entry.day, exercise: entry.exercise, loadKg: entry.loadKg, sets: entry.sets, reps: entry.reps })),
    disclaimer: plan.disclaimer,
  };
}

export async function saveAssessmentCall(userId: string, data: BodyAssessmentInput) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o cadastro do treino primeiro.');
  const day = todayKey();
  const assessment = await prisma.bodyAssessment.upsert({
    where: { userId_day: { userId, day } },
    create: { ...data, userId, day },
    update: data,
  });
  await prisma.trainingProfile.update({ where: { userId }, data: { weightKg: data.weightKg } });
  return assessment;
}

export async function logWorkoutCall(userId: string, entries: WorkoutLogInput) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o cadastro do treino primeiro.');
  const equipment = profile.trainingLocation === 'CALISTHENICS'
    ? profile.equipment.filter((item) => !['academia', 'halteres'].includes(item))
    : profile.equipment;
  const allowed = new Set(EXERCISES.filter((exercise) => screenOut(exercise, {
    goal: profile.goal as never, equipment: equipment as never, injuries: profile.injuries as never,
    age: ageFromBirthYear(profile.birthYear), level: 1, minutesAvailable: profile.minutesPerDay,
  }) === null).map((exercise) => exercise.key));
  const selected = entries.map((entry) => {
    const exercise = EXERCISES.find((item) => item.key === entry.exerciseKey);
    if (!exercise || !allowed.has(exercise.key)) throw new AppError(400, `Exercício não permitido para o perfil: ${entry.exerciseKey}.`);
    return { ...entry, exercise: exercise.name, muscleGroup: exercise.group };
  });
  const day = todayKey();
  await prisma.workoutLog.createMany({
    data: selected.map((entry) => ({
      userId, day, exercise: entry.exercise, exerciseKey: entry.exerciseKey,
      muscleGroup: entry.muscleGroup, sets: entry.sets, reps: entry.reps, loadKg: entry.loadKg,
    })),
  });
  return { saved: selected.length, day };
}

/** Opções do cadastro, servidas pelo servidor para o frontend não duplicar rótulos. */
export function meta() {
  return { goals: GOALS, equipment: EQUIPMENT_LABELS, injuries: INJURY_LABELS };
}

export async function dashboardCall(userId: string) {
  const penalty = await applyPenaltyIfMissed(userId);
  return { ...(await getDashboard(userId)), penalty, aiEnabled: aiEnabled() };
}

export async function completeCall(userId: string, missionId: string, blockKey: string) {
  const result = await completeBlock(userId, missionId, blockKey);
  if (!result.ok) throw new AppError(400, result.error);
  return result;
}

export async function libraryCall(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o onboarding primeiro');

  const rule = toRuleProfile(profile, (await getStats(userId)).level);
  return {
    allowed: EXERCISES.filter((e) => screenOut(e, rule) === null)
      .map((e) => ({ key: e.key, name: e.name, group: e.group, difficulty: e.difficulty, equipment: e.equipment })),
    blocked: EXERCISES.map((e) => ({ name: e.name, reason: screenOut(e, rule) }))
      .filter((x): x is { name: string; reason: string } => x.reason !== null),
  };
}

export async function reportCall(userId: string, username: string) {
  const [profile, stats, raw] = await Promise.all([getProfile(userId), getStats(userId), weeklyRawData(userId)]);
  if (!profile) throw new AppError(400, 'Faça o onboarding primeiro');

  const totalXp = raw.missions.reduce((s, m) => s + m.xpAwarded, 0);
  const report = await weeklyReport({
    username,
    goalLabel: GOAL_LABELS[profile.goal as never] ?? 'Treino',
    level: stats.level,
    levelTitle: levelTitle(stats.level),
    streak: stats.streak,
    completedDays: raw.completedDays,
    totalMinutes: raw.totalMinutes,
    statGains: [{ attr: 'Disciplina', gain: totalXp / 100 }],
  });

  return {
    report,
    aiEnabled: aiEnabled(),
    raw: { completedDays: raw.completedDays, totalMinutes: raw.totalMinutes },
  };
}

/** Só recebe exercícios liberados ao perfil — a IA não pode citar o que está bloqueado. */
export async function askCall(userId: string, question: string) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o onboarding primeiro');

  const rule = toRuleProfile(profile, (await getStats(userId)).level);
  const answer = await biomechanicsAnswer(question, {
    injuries: profile.injuries,
    equipment: profile.equipment,
    exerciseList: EXERCISES.filter((e) => screenOut(e, rule) === null).map((e) => e.name).join(', '),
  });

  return { answer, aiEnabled: aiEnabled() };
}

/* ── Atalhos para o chat do Sano ────────────────────────────────────────── */

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Resumo do estado do jogador para o Sano falar sobre o treino. */
export async function statusForChat(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) return { onboarded: false as const };

  const stats = await getStats(userId);
  const debuffUntil = await prisma.playerStats.findUnique({ where: { userId }, select: { debuffUntil: true } }).then((s) => s?.debuffUntil ?? null);
  const mission = await getOrCreateMission(userId);
  const goalLabel = GOAL_LABELS[profile.goal as never] ?? 'Treino';

  if (!mission) {
    return {
      onboarded: true as const, goalLabel,
      level: stats.level, levelTitle: levelTitle(stats.level),
      streak: stats.streak, debuffed: Boolean(debuffUntil), mission: null,
    };
  }

  const blocks = mission.blocks as unknown as Block[];
  const done = new Set(mission.progress.map((p) => p.blockKey));
  const doneMinutes = blocks.filter((b) => done.has(b.key)).reduce((s, b) => s + b.minutes, 0);

  return {
    onboarded: true as const,
    goalLabel,
    level: stats.level,
    levelTitle: levelTitle(stats.level),
    streak: stats.streak,
    debuffed: Boolean(debuffUntil),
    mission: {
      title: mission.title,
      plannedMinutes: mission.plannedMinutes,
      done: done.size,
      total: blocks.length,
      doneMinutes,
    },
  };
}

/**
 * Marca um bloco pelo NOME do exercício ("completei flexão").
 * Casa por semelhança para tolerar "flexão", "flexao" e "flexões".
 */
export async function completeByName(userId: string, nameWanted: string) {
  const wanted = normalize(nameWanted).trim();
  if (!wanted) return { ok: false, message: 'Diga qual exercício você concluiu.' };

  const mission = await getOrCreateMission(userId);
  if (!mission) return { ok: false, message: 'Crie seu personagem no módulo Treino antes de concluir exercícios.' };
  if (mission.completedAt) return { ok: false, message: 'O treino de hoje já foi concluído.' };

  const blocks = mission.blocks as unknown as Block[];
  const key = wanted
    .split(/[\s,]+/)
    .filter((w) => w.length > 2)
    .find((w) => blocks.some((b) => normalize(b.name).includes(w)));

  if (!key) {
    const disponiveis = blocks.map((b) => b.name).join(', ');
    return { ok: false, message: `Não achei "${nameWanted}" no treino de hoje.\nExercícios do dia: ${disponiveis}` };
  }

  const block = blocks.find((b) => normalize(b.name).includes(key))!;
  const result = await completeBlock(userId, mission.id, block.key);
  if (!result.ok) return { ok: false, message: result.error };

  const { done, completed } = result;
  return {
    ok: true,
    message: completed
      ? `Treino do dia concluído! Você fechou os ${done.length} exercícios.`
      : `Anotado: ${block.name}. Faltam ${blocks.length - done.length} exercícios.`,
  };
}

/** Números + refeições do dia. Calculado pelo código; a IA só escreve os pratos. */
export async function dietCall(userId: string, username: string) {
  const profile = await getProfile(userId);
  if (!profile) throw new AppError(400, 'Faça o onboarding primeiro');

  const day = todayKey();
  const n = computeDiet(toDietProfile(profile));

  const saved = await prisma.dietPlan.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, kcal: n.kcal, proteinG: n.proteinG, carbG: n.carbG, fatG: n.fatG, rationale: { why: n.rationale } },
    update: { kcal: n.kcal, proteinG: n.proteinG, carbG: n.carbG, fatG: n.fatG, rationale: { why: n.rationale } },
  });

  // Cache: o cardápio do dia não muda. Regerar a cada abertura da aba custava
  // uma chamada de IA (2-5 s) sem nenhum ganho para o usuário.
  if (saved.meals) {
    return { numbers: n, meals: saved.meals, aiEnabled: aiEnabled(), cached: true };
  }

  const meals = await mealPlan({
    kcal: n.kcal, proteinG: n.proteinG, carbG: n.carbG, fatG: n.fatG,
    mealsPerDay: profile.mealsPerDay,
    restrictions: profile.dietRestrictions,
    plantBased: isPlantBased(profile.dietRestrictions),
    dietNotes: profile.dietNotes ?? undefined,
  });

  await prisma.dietPlan.update({ where: { id: saved.id }, data: { meals } });
  return { numbers: n, meals, aiEnabled: aiEnabled() };
}

/** Detalhe de um exercício: como fazer, músculo, erro comum e tempos do cronômetro. */
export function exerciseDetailCall(key: string) {
  const ex = EXERCISES.find((e) => e.key === key);
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
  const [profile, mission] = await Promise.all([getProfile(userId), getOrCreateMission(userId)]);
  if (!profile) throw new AppError(400, 'Faça o onboarding primeiro');

  const blocks = (mission?.blocks ?? []) as unknown as Block[];
  const rule = toRuleProfile(profile, (await getStats(userId)).level);
  const blocked = EXERCISES.map((e) => screenOut(e, rule)).filter(Boolean).length;

  const review = await reviewTraining({
    profile: `objetivo ${profile.goal}, ${profile.experience}, ${profile.trainingDays}x/semana, lesões: ${profile.injuries.join(', ') || 'nenhuma'}`,
    blocks: blocks.map((b) => ({ name: b.name, target: b.target, minutes: b.minutes })),
    blocked: [`${blocked} exercícios bloqueados por segurança/equipamento`],
  });

  return { review, aiEnabled: aiEnabled() };
}