import { EXERCISES, type Goal, type Injury, type Equipment } from './exercises';
import { availableEquipment, screenOut, type RuleProfile } from './rules';
import { musclesFor } from './muscles';

export const WEEKDAYS = [
  { index: 1, label: 'Segunda', short: 'Seg' },
  { index: 2, label: 'Terça', short: 'Ter' },
  { index: 3, label: 'Quarta', short: 'Qua' },
  { index: 4, label: 'Quinta', short: 'Qui' },
  { index: 5, label: 'Sexta', short: 'Sex' },
  { index: 6, label: 'Sábado', short: 'Sáb' },
  { index: 0, label: 'Domingo', short: 'Dom' },
] as const;

export const WEEKLY_MUSCLES = [
  { key: 'chest', label: 'Peito' },
  { key: 'back', label: 'Costas' },
  { key: 'shoulders', label: 'Ombros' },
  { key: 'biceps', label: 'Bíceps' },
  { key: 'triceps', label: 'Tríceps' },
  { key: 'quadriceps', label: 'Quadríceps' },
  { key: 'posterior', label: 'Posterior e glúteo' },
  { key: 'calves', label: 'Panturrilha' },
  { key: 'abs', label: 'Abdômen' },
] as const;

export type MuscleKey = typeof WEEKLY_MUSCLES[number]['key'];
type Exercise = typeof EXERCISES[number];
type Weekday = typeof WEEKDAYS[number];

export interface WeeklyPlanProfile {
  goal: string;
  equipment: string[];
  injuries: string[];
  birthYear: number;
  experience: string;
  trainingDays: number;
  trainingWeekdays: number[];
  trainingLocation: string;
  sleepHours: number;
  minutesPerDay: number;
}

/** Trocas feitas pelo usuário: `"<dia da semana>:<chave original>"` → chave nova. */
export type PlanSwaps = Record<string, string>;
export const swapKey = (weekday: number, originalKey: string) => `${weekday}:${originalKey}`;

export interface PlannedExercise {
  key: string;
  name: string;
  muscle: MuscleKey;
  muscleLabel: string;
  sets: number;
  reps: string;
  restSeconds: number;
  rir: string;
  minutes: number;
  order: number;
  type: 'warmup' | 'normal';
  unit: 'reps' | 'segundos' | 'minutos';
  repsMin: number;
  repsMax: number;
  equipment: string[];
  primaryMuscles: number[];
  secondaryMuscles: number[];
  /** Pernas e quadril: progridem com incrementos de carga maiores. */
  lowerBody: boolean;
  /** Chave do exercício que o gerador escolheu, quando o usuário trocou o slot. */
  swappedFrom?: string;
}

export interface WeeklyWorkout {
  weekday: number;
  label: string;
  shortLabel: string;
  title: string;
  muscles: MuscleKey[];
  muscleLabels: string[];
  exercises: PlannedExercise[];
  plannedMinutes: number;
  warnings: string[];
  isTrainingDay: boolean;
  /** Músculos (ids do wger) do dia inteiro, para o mapa corporal. */
  muscleIds: { primary: number[]; secondary: number[] };
}

export interface WeeklyPlan {
  split: string;
  goal: string;
  prescription: { sets: number; reps: string; restSeconds: number; rir: string };
  days: WeeklyWorkout[];
  matrix: {
    key: MuscleKey;
    label: string;
    weeklySets: number;
    targetMin: number;
    targetMax: number;
    days: { weekday: number; state: 'TRAIN' | 'RECOVERY' | 'RECOVERED' }[];
  }[];
  disclaimer: string;
}

type SessionTemplate = { title: string; muscles: MuscleKey[] };

/* ── Constantes ─────────────────────────────────────────────────────────── */

const DEFAULT_RIR = '1–3';
/** Aquecimento + transições somados a toda sessão. */
const WARMUP_MINUTES = 9;
/** Tempo de preparação (ajustar carga/posição) por exercício. */
const SETUP_MINUTES_PER_EXERCISE = 1;
/** Duração média de uma repetição, em segundos. */
const SECONDS_PER_REP = 4;
/** Intervalo mínimo entre sessões do mesmo músculo (dias). */
const MIN_RECOVERY_DAYS = 2;
/** Os splits cobrem até 6 dias; o 7º dia da semana fica sempre de descanso. */
const MAX_TRAINING_DAYS = 6;
const CALISTHENICS_EXCLUDED_EQUIPMENT = ['academia', 'halteres'];
const LOWER_BODY_MUSCLES: MuscleKey[] = ['quadriceps', 'posterior', 'calves'];

/** Faixa de séries semanais por músculo, por nível de experiência. */
const weeklySetRange = (experience: string) =>
  experience === 'BEGINNER' ? { min: 6, max: 10 } : { min: 10, max: 20 };

const MUSCLE_LABEL = Object.fromEntries(
  WEEKLY_MUSCLES.map(({ key, label }) => [key, label]),
) as Record<MuscleKey, string>;

/**
 * Equipamento realmente disponível: em calistenia, academia e halteres não
 * contam. Exportado para o api.ts reaproveitar (a mesma regra existia lá).
 */
export const effectiveEquipment = (location: string, equipment: string[]) =>
  location === 'CALISTHENICS'
    ? equipment.filter((item) => !CALISTHENICS_EXCLUDED_EQUIPMENT.includes(item))
    : equipment;

/* ── Seleção de exercícios por músculo ──────────────────────────────────── */

const POSTERIOR_KEYS = ['ponte_gluteo', 'stiff_romeno', 'mesa_flexora'];

/**
 * Só o músculo PRINCIPAL conta: antes qualquer músculo envolvido servia, e
 * Superman/remada curvada (costas) entravam como "posterior" no dia de pernas.
 */
const hasSourceMuscle = (exercise: Exercise, ...sources: string[]) =>
  sources.includes(exercise.sourceMuscles?.[0] ?? '');

/** Usa `sourceMuscles` quando o exercício tem; senão cai na regra legada. */
const byMuscle = (sources: string[], fallback: (exercise: Exercise) => boolean) =>
  (exercise: Exercise) => exercise.sourceMuscles ? hasSourceMuscle(exercise, ...sources) : fallback(exercise);

const MUSCLE_EXERCISES: Record<MuscleKey, (exercise: Exercise) => boolean> = {
  chest: byMuscle(['peito'], (e) => e.group === 'peito'),
  back: byMuscle(['costas'], (e) => e.group === 'costas'),
  shoulders: byMuscle(['ombros'], (e) => e.group === 'ombros'),
  biceps: byMuscle(['biceps'], (e) => e.key.startsWith('rosca_')),
  triceps: byMuscle(['triceps'], (e) => e.key.startsWith('triceps_') || e.key === 'extensao_triceps'),
  quadriceps: byMuscle(['quadriceps'], (e) =>
    e.group === 'pernas' && e.key !== 'elevacao_calf' && !POSTERIOR_KEYS.includes(e.key)),
  posterior: byMuscle(['posterior', 'gluteo'], (e) => POSTERIOR_KEYS.includes(e.key)),
  calves: byMuscle(['panturrilha'], (e) => e.key === 'elevacao_calf'),
  abs: byMuscle(['abdomen'], (e) => e.group === 'core'),
};

/* ── Divisões de treino ─────────────────────────────────────────────────── */

const muscleList = (...keys: MuscleKey[]): MuscleKey[] => keys;

const FULL_BODY: SessionTemplate[] = [
  { title: 'Corpo inteiro A', muscles: muscleList('chest', 'back', 'quadriceps', 'posterior', 'shoulders', 'triceps', 'biceps', 'abs') },
  { title: 'Corpo inteiro B', muscles: muscleList('chest', 'back', 'quadriceps', 'posterior', 'calves', 'shoulders', 'biceps', 'abs') },
  { title: 'Corpo inteiro C', muscles: muscleList('chest', 'back', 'quadriceps', 'posterior', 'calves', 'shoulders', 'triceps', 'abs') },
];
const UPPER: SessionTemplate = {
  title: 'Superior',
  muscles: muscleList('chest', 'back', 'shoulders', 'biceps', 'triceps'),
};
const LOWER: SessionTemplate = {
  title: 'Inferior',
  muscles: muscleList('quadriceps', 'posterior', 'calves', 'abs'),
};
const FIVE_DAY_SPLIT: SessionTemplate[] = [
  { title: 'Peito + tríceps', muscles: muscleList('chest', 'triceps') },
  { title: 'Costas + bíceps', muscles: muscleList('back', 'biceps') },
  { title: 'Pernas', muscles: muscleList('quadriceps', 'posterior', 'calves') },
  { title: 'Ombros + abdômen', muscles: muscleList('shoulders', 'abs') },
  { title: 'Posterior + panturrilha', muscles: muscleList('posterior', 'calves') },
];
const PUSH_PULL_LEGS: SessionTemplate[] = [
  { title: 'Empurrar A', muscles: muscleList('chest', 'shoulders', 'triceps') },
  { title: 'Puxar A', muscles: muscleList('back', 'biceps') },
  { title: 'Pernas A', muscles: muscleList('quadriceps', 'posterior', 'calves', 'abs') },
  { title: 'Empurrar B', muscles: muscleList('chest', 'shoulders', 'triceps') },
  { title: 'Puxar B', muscles: muscleList('back', 'biceps') },
  { title: 'Pernas B', muscles: muscleList('quadriceps', 'posterior', 'calves', 'abs') },
];

function getSplit(trainingDays: number): { label: string; templates: SessionTemplate[] } {
  if (trainingDays <= 3) return { label: 'Corpo inteiro (A/B/C)', templates: FULL_BODY.slice(0, trainingDays) };
  if (trainingDays === 4) return { label: 'Superior/Inferior ×2', templates: [UPPER, LOWER, UPPER, LOWER] };
  if (trainingDays === 5) return { label: 'Divisão em 5 dias', templates: FIVE_DAY_SPLIT };
  return { label: 'Empurrar/Puxar/Pernas ×2', templates: PUSH_PULL_LEGS };
}

/* ── Prescrição ─────────────────────────────────────────────────────────── */

const repsFor = (goal: string) => goal === 'STRENGTH' ? '4–6' : goal === 'WEIGHT_LOSS' ? '12–15' : '8–12';
const restFor = (goal: string) => goal === 'STRENGTH' ? 150 : goal === 'WEIGHT_LOSS' ? 40 : 75;
const setsFor = (goal: string, experience: string) =>
  goal === 'STRENGTH'
    ? (experience === 'BEGINNER' ? 3 : 4)
    : (experience === 'ADVANCED' ? 4 : 3);

/** Estimativa de duração de um exercício: trabalho + descansos + preparação. */
const exerciseMinutes = (sets: number, reps: string, restSeconds: number, exercise: Exercise) => {
  const [low, high] = exercise.repsMin !== undefined && exercise.repsMax !== undefined
    ? [exercise.repsMin, exercise.repsMax]
    : reps.split(/[–-]/).map(Number);
  const average = Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : 10;
  const workMinutes = exercise.unit === 'minutos'
    ? average
    : exercise.unit === 'segundos'
      ? average / 60
      : (average * SECONDS_PER_REP) / 60;
  return Math.ceil(sets * workMinutes + (Math.max(0, sets - 1) * restSeconds) / 60 + SETUP_MINUTES_PER_EXERCISE);
};

const chooseExerciseCount = (experience: string, sessionsPerWeek: number) => {
  if (sessionsPerWeek === 1) return experience === 'BEGINNER' ? 2 : 3;
  if (experience === 'BEGINNER') return 1;
  return experience === 'ADVANCED' && sessionsPerWeek >= 3 ? 1 : 2;
};

/** Dias padrão da semana quando o usuário não escolheu quais treina. */
const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
};

export function defaultTrainingWeekdays(trainingDays: number): number[] {
  const days = Math.min(MAX_TRAINING_DAYS, Math.max(1, Math.round(trainingDays) || 3));
  return DEFAULT_WEEKDAYS[days];
}

/* ── Recuperação ────────────────────────────────────────────────────────── */

/** Última sessão anterior ao dia dado (inclui a virada de semana) e há quantos dias. */
function previousTrainingSession(weekday: number, sessionMuscles: Map<number, Set<MuscleKey>>) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const muscles = sessionMuscles.get((weekday - offset + 7) % 7);
    if (muscles) return { muscles, daysSince: offset };
  }
  return undefined;
}

function restDay(day: Weekday): WeeklyWorkout {
  return {
    weekday: day.index, label: day.label, shortLabel: day.short,
    title: 'Descanso', muscles: [], muscleLabels: [], exercises: [],
    plannedMinutes: 0, warnings: [], isTrainingDay: false,
    muscleIds: { primary: [], secondary: [] },
  };
}

/* ── Contexto comum: triagem de segurança feita uma vez ─────────────────── */

function planContext(profile: WeeklyPlanProfile, now: Date) {
  const baseSets = setsFor(profile.goal, profile.experience);
  const sets = profile.sleepHours < 6 ? Math.max(1, baseSets - 1) : baseSets;
  const reps = repsFor(profile.goal);
  const restSeconds = restFor(profile.goal);

  const rule: RuleProfile = {
    goal: profile.goal as Goal,
    equipment: availableEquipment(effectiveEquipment(profile.trainingLocation, profile.equipment) as Equipment[]),
    injuries: profile.injuries as Injury[],
    age: now.getFullYear() - profile.birthYear,
    level: 1,
    minutesAvailable: profile.minutesPerDay,
  };

  // Preferência dentro de cada músculo: equipamento do local escolhido,
  // compostos antes de isolados, dificuldade perto da experiência e menos impacto.
  const idealDifficulty = profile.experience === 'BEGINNER' ? 1 : profile.experience === 'ADVANCED' ? 3 : 2;
  const preference = (exercise: Exercise) => {
    const usesGear = exercise.equipment.some((item) => item === 'academia' || item === 'halteres');
    let score = (profile.trainingLocation === 'GYM') === usesGear ? 2 : 0;
    if (exercise.xp >= 15) score += 1;
    score -= Math.abs(exercise.difficulty - idealDifficulty) * 0.5;
    if (exercise.impact === 'alto') score -= 1;
    return score;
  };
  const safe = EXERCISES.filter((exercise) => screenOut(exercise, rule) === null);
  const safeByMuscle = Object.fromEntries(
    WEEKLY_MUSCLES.map(({ key }) => [key, safe.filter(MUSCLE_EXERCISES[key]).sort((a, b) => preference(b) - preference(a))]),
  ) as Record<MuscleKey, Exercise[]>;

  /** Séries, faixa e descanso de um exercício neste perfil. */
  const prescribe = (exercise: Exercise, muscle: MuscleKey, order: number): PlannedExercise => {
    const exerciseSets = Math.min(sets, exercise.suggestedSets ?? sets);
    const unit = exercise.unit ?? 'reps';
    const hasRange = exercise.repsMin !== undefined && exercise.repsMax !== undefined;
    const exerciseReps = hasRange
      ? `${exercise.repsMin}–${exercise.repsMax}${unit === 'reps' ? '' : ` ${unit}`}`
      : reps;
    const [goalMin, goalMax] = reps.split('–').map(Number);
    const exerciseRest = profile.goal === 'STRENGTH'
      ? Math.max(restSeconds, exercise.restSeconds ?? 0)
      : exercise.restSeconds ?? restSeconds;
    const { primary, secondary } = musclesFor(exercise);
    return {
      key: exercise.key,
      name: exercise.name,
      muscle,
      muscleLabel: MUSCLE_LABEL[muscle],
      sets: exerciseSets,
      reps: exerciseReps,
      restSeconds: exerciseRest,
      rir: DEFAULT_RIR,
      minutes: exerciseMinutes(exerciseSets, exerciseReps, exerciseRest, exercise),
      order,
      type: 'normal',
      unit,
      repsMin: hasRange ? exercise.repsMin! : goalMin,
      repsMax: hasRange ? exercise.repsMax! : goalMax,
      equipment: exercise.equipment,
      primaryMuscles: primary,
      secondaryMuscles: secondary,
      lowerBody: LOWER_BODY_MUSCLES.includes(muscle),
    };
  };

  return { sets, reps, restSeconds, safe, safeByMuscle, prescribe };
}

/* ── Geração do plano ───────────────────────────────────────────────────── */

export function generateWeeklyPlan(profile: WeeklyPlanProfile, now = new Date(), swaps: PlanSwaps = {}): WeeklyPlan {
  // Dias inválidos são descartados; se nada sobrar, usa os dias padrão
  // (antes o plano saía vazio). O nº de dias efetivo define o split.
  const validWeekdays = profile.trainingWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const requested = new Set(validWeekdays.length ? validWeekdays : defaultTrainingWeekdays(profile.trainingDays));
  // Limite de 6: com 7 dias o split não tinha template para o último e quebrava.
  const orderedDays = WEEKDAYS.filter((day) => requested.has(day.index)).slice(0, MAX_TRAINING_DAYS);

  const { label: split, templates } = getSplit(orderedDays.length);
  const sessionMuscles = new Map<number, Set<MuscleKey>>();
  orderedDays.forEach((day, index) => sessionMuscles.set(day.index, new Set(templates[index].muscles)));

  const frequency = new Map<MuscleKey, number>(
    WEEKLY_MUSCLES.map(({ key }) => [key, templates.filter((template) => template.muscles.includes(key)).length]),
  );

  const { min: targetMin, max: targetMax } = weeklySetRange(profile.experience);
  const { sets, reps, restSeconds, safeByMuscle, safe, prescribe } = planContext(profile, now);
  const safeByKey = new Map(safe.map((exercise) => [exercise.key, exercise]));

  const trainingWorkouts: WeeklyWorkout[] = orderedDays.map((day, sessionIndex) => {
    const template = templates[sessionIndex];
    const sessionExercises: PlannedExercise[] = [];
    const usedKeys = new Set<string>();
    const missing: string[] = [];

    for (const muscle of template.muscles) {
      const options = safeByMuscle[muscle].filter((exercise) => !usedKeys.has(exercise.key));
      if (!options.length) {
        missing.push(MUSCLE_LABEL[muscle]);
        continue;
      }

      const sessionsPerWeek = frequency.get(muscle) ?? 1;
      // Em grupos treinados uma vez, usamos dois slots de movimento como no
      // wger. Quando o grupo se repete na semana, a frequência distribui o
      // mesmo volume entre as sessões.
      const minimumExercises = sessionsPerWeek === 1 ? 2 : 1;
      const neededExercises = Math.max(minimumExercises, Math.ceil(targetMin / (sets * sessionsPerWeek)));
      const count = Math.min(options.length, Math.max(chooseExerciseCount(profile.experience, sessionsPerWeek), neededExercises));
      // Em sessões seguintes do mesmo músculo, gira a lista para variar os exercícios.
      const rotation = templates.slice(0, sessionIndex).filter((previous) => previous.muscles.includes(muscle)).length;

      for (let index = 0; index < count; index += 1) {
        const chosen = options[(rotation * count + index) % options.length];
        // A troca só vale se o substituto continua seguro e não repete o dia.
        const replacementKey = swaps[swapKey(day.index, chosen.key)];
        const replacement = replacementKey ? safeByKey.get(replacementKey) : undefined;
        const exercise = replacement && !usedKeys.has(replacement.key) ? replacement : chosen;
        usedKeys.add(chosen.key);
        usedKeys.add(exercise.key);
        const planned = prescribe(exercise, muscle, sessionExercises.length + 1);
        if (exercise !== chosen) planned.swappedFrom = chosen.key;
        sessionExercises.push(planned);
      }
    }

    const warnings: string[] = [];
    const previous = previousTrainingSession(day.index, sessionMuscles);
    const repeated = previous && previous.daysSince < MIN_RECOVERY_DAYS
      ? template.muscles.filter((muscle) => previous.muscles.has(muscle))
      : [];
    if (repeated.length) {
      warnings.push(`Há menos de 48h desde a última sessão de ${repeated.map((key) => MUSCLE_LABEL[key].toLowerCase()).join(', ')}. Se possível, escolha dias mais espaçados.`);
    }
    if (missing.length) {
      warnings.push(`Não há exercícios seguros disponíveis para: ${missing.join(', ')}. Revise equipamentos e restrições com um profissional.`);
    }

    const plannedMinutes = WARMUP_MINUTES + sessionExercises.reduce((total, exercise) => total + exercise.minutes, 0);
    if (plannedMinutes > profile.minutesPerDay) {
      warnings.push(`A sessão foi estimada em cerca de ${plannedMinutes} min, acima dos ${profile.minutesPerDay} min escolhidos. Aumente o tempo disponível ou converse com um educador físico para ajustar o volume.`);
    }

    const primary = new Set(sessionExercises.flatMap((exercise) => exercise.primaryMuscles));
    const secondary = new Set(sessionExercises.flatMap((exercise) => exercise.secondaryMuscles).filter((id) => !primary.has(id)));

    return {
      weekday: day.index,
      label: day.label,
      shortLabel: day.short,
      title: template.title,
      muscles: template.muscles,
      muscleLabels: template.muscles.map((key) => MUSCLE_LABEL[key]),
      exercises: sessionExercises,
      plannedMinutes,
      warnings,
      isTrainingDay: true,
      muscleIds: { primary: [...primary], secondary: [...secondary] },
    };
  });

  const workoutByWeekday = new Map(trainingWorkouts.map((workout) => [workout.weekday, workout]));
  const days: WeeklyWorkout[] = WEEKDAYS.map((day) => workoutByWeekday.get(day.index) ?? restDay(day));

  const matrix: WeeklyPlan['matrix'] = WEEKLY_MUSCLES.map(({ key, label }) => {
    const trainedWeekdays = new Set<number>(
      orderedDays.filter((day) => sessionMuscles.get(day.index)?.has(key)).map((day) => day.index),
    );
    const weeklySets = trainingWorkouts
      .flatMap((workout) => workout.exercises)
      .filter((exercise) => exercise.muscle === key)
      .reduce((total, exercise) => total + exercise.sets, 0);

    return {
      key,
      label,
      weeklySets,
      targetMin,
      targetMax,
      days: WEEKDAYS.map((day) => {
        if (trainedWeekdays.has(day.index)) return { weekday: day.index, state: 'TRAIN' as const };
        // Dias desde o último treino deste músculo (1 = ontem).
        let daysSinceLast: number | undefined;
        for (let offset = 1; offset <= 7 && daysSinceLast === undefined; offset += 1) {
          if (trainedWeekdays.has((day.index - offset + 7) % 7)) daysSinceLast = offset;
        }
        const state = daysSinceLast !== undefined && daysSinceLast < MIN_RECOVERY_DAYS ? 'RECOVERY' : 'RECOVERED';
        return { weekday: day.index, state } as const;
      }),
    };
  });

  return {
    split,
    goal: profile.goal,
    prescription: { sets, reps, restSeconds, rir: DEFAULT_RIR },
    days,
    matrix,
    disclaimer: 'Este plano é uma estimativa baseada nas respostas informadas. Não substitui avaliação ou orientação de um educador físico ou profissional de saúde.',
  };
}

/**
 * Exercícios que podem substituir um slot do plano: mesmo músculo-alvo,
 * liberados pelo filtro de segurança e que ainda não estão no dia.
 */
export function swapOptions(profile: WeeklyPlanProfile, plan: WeeklyPlan, weekday: number, exerciseKey: string, now = new Date()) {
  const day = plan.days.find((item) => item.weekday === weekday);
  const slot = day?.exercises.find((exercise) => exercise.key === exerciseKey);
  if (!day || !slot) return null;
  const { safeByMuscle, prescribe } = planContext(profile, now);
  const inDay = new Set(day.exercises.map((exercise) => exercise.key));
  const original = slot.swappedFrom ?? slot.key;
  return {
    original,
    current: slot.key,
    options: safeByMuscle[slot.muscle]
      .filter((exercise) => !inDay.has(exercise.key) || exercise.key === original)
      .map((exercise) => ({ ...prescribe(exercise, slot.muscle, slot.order), difficulty: exercise.difficulty })),
  };
}
