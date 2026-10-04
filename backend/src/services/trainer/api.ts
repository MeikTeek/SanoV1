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

  const intro = await narrateMission({
    username,
    goalLabel: GOAL_LABELS[profile.goal as never] ?? 'Treino',
    plan: { title: plan.title, blocks: plan.blocks, plannedMinutes: plan.plannedMinutes },
    exclusions: plan.excluded,
  });

  return { profile, mission, intro };
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