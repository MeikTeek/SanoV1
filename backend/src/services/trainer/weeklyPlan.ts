import { EXERCISES, type Goal, type Injury, type Equipment } from './exercises';
import { availableEquipment, screenOut, type RuleProfile } from './rules';

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

const hasSourceMuscle = (exercise: Exercise, ...sources: string[]) =>
  sources.some((source) => exercise.sourceMuscles?.includes(source));

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
  };
}

/* ── Geração do plano ───────────────────────────────────────────────────── */

export function generateWeeklyPlan(profile: WeeklyPlanProfile, now = new Date()): WeeklyPlan {
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

  const baseSets = setsFor(profile.goal, profile.experience);
  const sets = profile.sleepHours < 6 ? Math.max(1, baseSets - 1) : baseSets;
  const reps = repsFor(profile.goal);
  const restSeconds = restFor(profile.goal);
  const { min: targetMin, max: targetMax } = weeklySetRange(profile.experience);

  const rule: RuleProfile = {
    goal: profile.goal as Goal,
    equipment: availableEquipment(effectiveEquipment(profile.trainingLocation, profile.equipment) as Equipment[]),
    injuries: profile.injuries as Injury[],
    age: now.getFullYear() - profile.birthYear,
    level: 1,
    minutesAvailable: profile.minutesPerDay,
  };

  // Triagem de segurança e agrupamento por músculo feitos uma única vez.
  const safe = EXERCISES.filter((exercise) => screenOut(exercise, rule) === null);
  const safeByMuscle = Object.fromEntries(
    WEEKLY_MUSCLES.map(({ key }) => [key, safe.filter(MUSCLE_EXERCISES[key])]),
  ) as Record<MuscleKey, Exercise[]>;

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
        const exercise = options[(rotation * count + index) % options.length];
        usedKeys.add(exercise.key);
        const exerciseSets = Math.min(sets, exercise.suggestedSets ?? sets);
        const exerciseReps = exercise.repsMin !== undefined && exercise.repsMax !== undefined
          ? `${exercise.repsMin}–${exercise.repsMax}${exercise.unit === 'reps' ? '' : ` ${exercise.unit}`}`
          : reps;
        const exerciseRest = profile.goal === 'STRENGTH'
          ? Math.max(restSeconds, exercise.restSeconds ?? 0)
          : exercise.restSeconds ?? restSeconds;
        sessionExercises.push({
          key: exercise.key,
          name: exercise.name,
          muscle,
          muscleLabel: MUSCLE_LABEL[muscle],
          sets: exerciseSets,
          reps: exerciseReps,
          restSeconds: exerciseRest,
          rir: DEFAULT_RIR,
          minutes: exerciseMinutes(exerciseSets, exerciseReps, exerciseRest, exercise),
          order: sessionExercises.length + 1,
          type: 'normal',
        });
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