import { EXERCISES, type Goal, type Injury, type Equipment } from './exercises';
import { screenOut, type RuleProfile } from './rules';

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

const MUSCLE_EXERCISES: Record<MuscleKey, (exercise: Exercise) => boolean> = {
  chest: (exercise) => exercise.group === 'peito',
  back: (exercise) => exercise.group === 'costas',
  shoulders: (exercise) => exercise.group === 'ombros',
  biceps: (exercise) => exercise.key.startsWith('rosca_'),
  triceps: (exercise) => exercise.key.startsWith('triceps_') || exercise.key === 'extensao_triceps',
  quadriceps: (exercise) => exercise.group === 'pernas' && !['ponte_gluteo', 'elevacao_calf', 'stiff_romeno', 'mesa_flexora'].includes(exercise.key),
  posterior: (exercise) => ['ponte_gluteo', 'stiff_romeno', 'mesa_flexora'].includes(exercise.key),
  calves: (exercise) => exercise.key === 'elevacao_calf',
  abs: (exercise) => exercise.group === 'core',
};

const muscles = (...keys: MuscleKey[]): MuscleKey[] => keys;
const FULL_BODY: SessionTemplate[] = [
  { title: 'Corpo inteiro A', muscles: muscles('chest', 'back', 'quadriceps', 'posterior', 'shoulders', 'triceps', 'biceps', 'abs') },
  { title: 'Corpo inteiro B', muscles: muscles('chest', 'back', 'quadriceps', 'posterior', 'calves', 'shoulders', 'biceps', 'abs') },
  { title: 'Corpo inteiro C', muscles: muscles('chest', 'back', 'quadriceps', 'posterior', 'calves', 'shoulders', 'triceps', 'abs') },
];
const UPPER: SessionTemplate = {
  title: 'Superior',
  muscles: muscles('chest', 'back', 'shoulders', 'biceps', 'triceps'),
};
const LOWER: SessionTemplate = {
  title: 'Inferior',
  muscles: muscles('quadriceps', 'posterior', 'calves', 'abs'),
};

function getSplit(trainingDays: number): { label: string; templates: SessionTemplate[] } {
  if (trainingDays <= 3) {
    return { label: 'Corpo inteiro (A/B/C)', templates: FULL_BODY.slice(0, trainingDays) };
  }
  if (trainingDays === 4) {
    return { label: 'Superior/Inferior ×2', templates: [UPPER, LOWER, UPPER, LOWER] };
  }
  if (trainingDays === 5) {
    return {
      label: 'Divisão em 5 dias',
      templates: [
        { title: 'Peito + tríceps', muscles: muscles('chest', 'triceps') },
        { title: 'Costas + bíceps', muscles: muscles('back', 'biceps') },
        { title: 'Pernas', muscles: muscles('quadriceps', 'posterior', 'calves') },
        { title: 'Ombros + abdômen', muscles: muscles('shoulders', 'abs') },
        { title: 'Posterior + panturrilha', muscles: muscles('posterior', 'calves') },
      ],
    };
  }
  return {
    label: 'Empurrar/Puxar/Pernas ×2',
    templates: [
      { title: 'Empurrar A', muscles: muscles('chest', 'shoulders', 'triceps') },
      { title: 'Puxar A', muscles: muscles('back', 'biceps') },
      { title: 'Pernas A', muscles: muscles('quadriceps', 'posterior', 'calves', 'abs') },
      { title: 'Empurrar B', muscles: muscles('chest', 'shoulders', 'triceps') },
      { title: 'Puxar B', muscles: muscles('back', 'biceps') },
      { title: 'Pernas B', muscles: muscles('quadriceps', 'posterior', 'calves', 'abs') },
    ],
  };
}

const repsFor = (goal: string) => goal === 'STRENGTH' ? '4–6' : goal === 'WEIGHT_LOSS' ? '12–15' : '8–12';
const restFor = (goal: string) => goal === 'STRENGTH' ? 150 : goal === 'WEIGHT_LOSS' ? 40 : 75;
const setsFor = (goal: string, experience: string) =>
  (goal === 'STRENGTH' ? (experience === 'BEGINNER' ? 3 : 4) : experience === 'ADVANCED' ? 4 : 3);

const exerciseMinutes = (sets: number, reps: string, restSeconds: number) => {
  const [min, max] = reps.split('–').map(Number);
  const avgReps = (min + max) / 2;
  return Math.ceil(sets * avgReps * 4 / 60 + Math.max(0, sets - 1) * restSeconds / 60 + 1);
};

const chooseExerciseCount = (experience: string, sessionsPerWeek: number) => {
  if (sessionsPerWeek === 1) return experience === 'BEGINNER' ? 2 : 3;
  if (experience === 'BEGINNER') return 1;
  return experience === 'ADVANCED' && sessionsPerWeek >= 3 ? 1 : 2;
};

export function defaultTrainingWeekdays(trainingDays: number): number[] {
  const byCount: Record<number, number[]> = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
  };
  return byCount[Math.min(6, Math.max(2, Math.round(trainingDays)))] ?? [1, 3, 5];
}

export function generateWeeklyPlan(profile: WeeklyPlanProfile, now = new Date()): WeeklyPlan {
  const selected = new Set(
    (profile.trainingWeekdays.length ? profile.trainingWeekdays : defaultTrainingWeekdays(profile.trainingDays))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  const orderedDays = WEEKDAYS.filter((day) => selected.has(day.index));
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
  const age = now.getFullYear() - profile.birthYear;
  const rule: RuleProfile = {
    goal: profile.goal as Goal,
    equipment: (profile.trainingLocation === 'CALISTHENICS'
      ? profile.equipment.filter((item) => !['academia', 'halteres'].includes(item))
      : profile.equipment) as Equipment[],
    injuries: profile.injuries as Injury[],
    age,
    level: 1,
    minutesAvailable: profile.minutesPerDay,
  };
  const safe = EXERCISES.filter((exercise) => screenOut(exercise, rule) === null);

  const trainingWorkouts: WeeklyWorkout[] = orderedDays.map((day, sessionIndex) => {
    const template = templates[sessionIndex];
    const sessionExercises: PlannedExercise[] = [];
    const missing: string[] = [];

    for (const muscle of template.muscles) {
      const options = safe.filter(MUSCLE_EXERCISES[muscle]);
      if (!options.length) {
        missing.push(WEEKLY_MUSCLES.find((item) => item.key === muscle)!.label);
        continue;
      }
      const sessionsPerWeek = frequency.get(muscle) ?? 1;
      const targetWeeklySets = profile.experience === 'BEGINNER' ? 6 : 10;
      const neededExercises = Math.ceil(targetWeeklySets / (sets * sessionsPerWeek));
      const count = Math.min(options.length, Math.max(chooseExerciseCount(profile.experience, sessionsPerWeek), neededExercises));
      const rotation = templates.slice(0, sessionIndex).filter((previous) => previous.muscles.includes(muscle)).length;
      for (let index = 0; index < count; index += 1) {
        const exercise = options[(rotation * count + index) % options.length];
        const muscleLabel = WEEKLY_MUSCLES.find((item) => item.key === muscle)!.label;
        sessionExercises.push({
          key: exercise.key,
          name: exercise.name,
          muscle,
          muscleLabel,
          sets,
          reps,
          restSeconds,
          rir: '1–3',
          minutes: exerciseMinutes(sets, reps, restSeconds),
        });
      }
    }

    const warnings: string[] = [];
    const previousWorkout = trainingWorkoutsForDayBefore(day.index, orderedDays, sessionMuscles);
    const repeated = previousWorkout && previousWorkout.daysSince < 2
      ? template.muscles.filter((muscle) => previousWorkout.muscles.has(muscle))
      : [];
    if (repeated.length) {
      warnings.push(`Há menos de 48h desde a última sessão de ${repeated.map((key) => WEEKLY_MUSCLES.find((item) => item.key === key)!.label.toLowerCase()).join(', ')}. Se possível, escolha dias mais espaçados.`);
    }
    if (missing.length) {
      warnings.push(`Não há exercícios seguros disponíveis para: ${missing.join(', ')}. Revise equipamentos e restrições com um profissional.`);
    }

    const plannedMinutes = 9 + sessionExercises.reduce((total, exercise) => total + exercise.minutes, 0);
    if (plannedMinutes > profile.minutesPerDay) {
      warnings.push(`A sessão foi estimada em cerca de ${plannedMinutes} min, acima dos ${profile.minutesPerDay} min escolhidos. Aumente o tempo disponível ou converse com um educador físico para ajustar o volume.`);
    }

    return {
      weekday: day.index,
      label: day.label,
      shortLabel: day.short,
      title: template.title,
      muscles: template.muscles,
      muscleLabels: template.muscles.map((key) => WEEKLY_MUSCLES.find((item) => item.key === key)!.label),
      exercises: sessionExercises,
      plannedMinutes,
      warnings,
      isTrainingDay: true,
    };
  });

  const days = WEEKDAYS.map((day) =>
    trainingWorkouts.find((workout) => workout.weekday === day.index) ?? {
      weekday: day.index,
      label: day.label,
      shortLabel: day.short,
      title: 'Descanso',
      muscles: [],
      muscleLabels: [],
      exercises: [],
      plannedMinutes: 0,
      warnings: [],
      isTrainingDay: false,
    },
  );

  const matrix = WEEKLY_MUSCLES.map(({ key, label }) => {
    const workoutDays: number[] = orderedDays.filter((day) => sessionMuscles.get(day.index)?.has(key)).map((day) => day.index);
    const totalSets = trainingWorkouts
      .filter((workout) => workout.muscles.includes(key))
      .flatMap((workout) => workout.exercises)
      .filter((exercise) => exercise.muscle === key)
      .reduce((total, exercise) => total + exercise.sets, 0);

    return {
      key,
      label,
      weeklySets: totalSets,
      targetMin: profile.experience === 'BEGINNER' ? 6 : 10,
      targetMax: profile.experience === 'BEGINNER' ? 10 : 20,
      days: WEEKDAYS.map((day) => {
        if (workoutDays.includes(day.index)) return { weekday: day.index, state: 'TRAIN' as const };
        const daysSinceLast = Array.from({ length: 7 }, (_, offset) => offset + 1)
          .find((offset) => workoutDays.includes((day.index - offset + 7) % 7));
        return {
          weekday: day.index,
          state: daysSinceLast !== undefined && daysSinceLast < 2 ? 'RECOVERY' as const : 'RECOVERED' as const,
        };
      }),
    };
  });

  return {
    split,
    goal: profile.goal,
    prescription: { sets, reps, restSeconds, rir: '1–3' },
    days,
    matrix,
    disclaimer: 'Este plano é uma estimativa baseada nas respostas informadas. Não substitui avaliação ou orientação de um educador físico ou profissional de saúde.',
  };
}

function trainingWorkoutsForDayBefore(
  weekday: number,
  orderedDays: readonly typeof WEEKDAYS[number][],
  sessionMuscles: Map<number, Set<MuscleKey>>,
): { muscles: Set<MuscleKey>; daysSince: number } | undefined {
  for (let offset = 1; offset <= 7; offset += 1) {
    const previousDay = (weekday - offset + 7) % 7;
    const found = orderedDays.find((day) => day.index === previousDay);
    if (found) {
      const previousMuscles = sessionMuscles.get(found.index);
      if (previousMuscles) return { muscles: previousMuscles, daysSince: offset };
    }
  }
  return undefined;
}
