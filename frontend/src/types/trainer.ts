export type ExerciseUnit = 'reps' | 'segundos' | 'minutos';
export type Goal = 'HYPERTROPHY' | 'STRENGTH' | 'WEIGHT_LOSS' | 'CONDITIONING' | 'HEALTH';
export type Somatotype = 'ECTOMORPH' | 'MESOMORPH' | 'ENDOMORPH';

export interface ExerciseDetail {
  key: string;
  name: string;
  group: string;
  muscles: string;
  howTo: string;
  commonMistake: string;
  benefits: string;
  workSeconds: number;
  restSeconds: number;
  progression?: string;
  regression?: string;
  suggestedSets?: number;
  repsMin?: number;
  repsMax?: number;
  unit?: 'reps' | 'segundos' | 'minutos';
}

export interface DietNumbers {
  tdee: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  waterTarget: number;
  rationale: string[];
}
export type Equipment = 'academia' | 'peso-corporal' | 'elastico' | 'barra-fixa' | 'halteres' | 'nenhum';
export type Injury = 'joelho' | 'lombar' | 'ombro' | 'cotovelo' | 'quadril' | 'pescoco';

export interface TrainingProfile {
  id: string;
  weightKg: number;
  heightCm: number;
  birthYear: number;
  sex: 'M' | 'F' | 'OTHER';
  goal: Goal;
  equipment: Equipment[];
  injuries: Injury[];
  minutesPerDay: number;
  restrictionNotes: string | null;
  somatotype: Somatotype | null;
  experience: string;
  trainingDays: number;
  trainingWeekdays: number[];
  trainingLocation: 'GYM' | 'CALISTHENICS';
  targetWeightKg: number | null;
  pregnancy: boolean | null;
  heartCondition: boolean | null;
  medicationUse: boolean | null;
  parqAnswers: Record<string, boolean> | null;
  sleepHours: number;
  waterLiters: number;
  mealsPerDay: number;
  dietQuality: string;
  dietNotes: string | null;
  dietRestrictions: string[];
}

/** Opções do cadastro, servidas por GET /trainer/meta. */
export interface TrainerMeta {
  goals: { key: Goal; label: string; summary: string; focus: string[] }[];
  equipment: Record<Equipment, string>;
  injuries: Record<Injury, string>;
}

export interface TrainerDashboard {
  onboarded: boolean;
  profile?: TrainingProfile;
  aiEnabled?: boolean;
}

export interface LibraryResponse {
  allowed: {
    key: string; name: string; group: string; difficulty: number; equipment: Equipment[];
    muscles: string; howTo: string; benefits: string; progression: string; regression: string;
    suggestedSets?: number; repsMin?: number; repsMax?: number; restSeconds?: number;
    unit: ExerciseUnit; primaryMuscles: number[]; secondaryMuscles: number[];
  }[];
  blocked: { key: string; name: string; reason: string }[];
  filters: { query: string; group: string; equipment: string };
}

export interface PlannedExercise {
  key: string;
  name: string;
  muscle: string;
  muscleLabel: string;
  sets: number;
  reps: string;
  restSeconds: number;
  rir: string;
  minutes: number;
  order: number;
  type: 'warmup' | 'normal';
  unit: ExerciseUnit;
  repsMin: number;
  repsMax: number;
  equipment: string[];
  primaryMuscles: number[];
  secondaryMuscles: number[];
  lowerBody: boolean;
  swappedFrom?: string;
}

export interface WeeklyWorkout {
  weekday: number;
  label: string;
  shortLabel: string;
  title: string;
  muscles: string[];
  muscleLabels: string[];
  exercises: PlannedExercise[];
  plannedMinutes: number;
  warnings: string[];
  isTrainingDay: boolean;
  muscleIds: { primary: number[]; secondary: number[] };
}

export interface WeeklyPlan {
  split: string;
  goal: string;
  prescription: { sets: number; reps: string; restSeconds: number; rir: string };
  days: WeeklyWorkout[];
  matrix: {
    key: string;
    label: string;
    weeklySets: number;
    targetMin: number;
    targetMax: number;
    days: { weekday: number; state: 'TRAIN' | 'RECOVERY' | 'RECOVERED' }[];
  }[];
  disclaimer: string;
}

export interface TrainerData {
  profile: TrainingProfile;
  metrics: {
    age: number; weightKg: number; bmi: number; bmiCategory: string;
    bodyFatPercent: number | null; bodyFatMethod: string | null;
    fatMassKg: number | null; leanMassKg: number | null; ffmi: number | null;
    waistToHeight: number | null; waistToHip: number | null; bsaM2: number;
    referenceWeightKg: number; targetWeightKg: number | null; weightTrendKg: number | null;
    bmr: number; tdee: number; waterLiters: number;
    restingHeartRate: number | null; sleepHours: number | null; fatigue: number | null;
    muscleSoreness: number | null; nutritionAdherence: number | null; readinessScore: number | null;
    assessmentCount: number; assessmentDue: boolean;
    daysSinceAssessment: number; safetyWarnings: string[];
    estimated1Rm: { name: string; estimated1RmKg: number; day: string }[];
  };
  history: { day: string; weightKg: number; bodyFatPercent: number | null; waistCm: number | null; sleepHours: number | null; fatigue: number | null }[];
  adherence: { completedSessions: number; plannedSessions: number; percent: number };
  weeklyVolume: { key: string; label: string; weeklySets: number; targetMin: number; targetMax: number }[];
  strengthHistory: { day: string; exercise: string; loadKg: number | null; sets: number; reps: number }[];
  recentSessions: {
    id: string; day: string; title: string; status: string; notes: string | null;
    startedAt: string; completedAt: string | null;
    exercises: { exercise: string; sets: number; reps: number; loadKg: number | null; averageRir: number | null }[];
  }[];
  disclaimer: string;
}

export interface BodyAssessmentPayload {
  weightKg: number;
  bodyFatPercent?: number;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  calfCm?: number;
  wristCm?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  fatigue?: number;
  muscleSoreness?: number;
  nutritionAdherence?: number;
  notes?: string;
}

/* ── Sessões, progresso e conquistas ───────────────────────────────────── */

export interface SetEntry { reps: number; loadKg: number | null; rir: number | null }

export interface Suggestion { loadKg: number | null; reps: number; note: string; trend: 'up' | 'hold' | 'down' | 'new' }

export interface DayExercise extends PlannedExercise {
  previous: { day: string; sets: SetEntry[] } | null;
  suggestion: Suggestion;
}

export interface WorkoutDay extends Omit<WeeklyWorkout, 'exercises'> {
  exercises: DayExercise[];
}

export interface LevelInfo { current: number; title: string; xp: number; xpNeeded: number; totalXp: number }

export interface Achievement { key: string; title: string; description: string; unlocked: boolean; progress: number; icon: string }

export interface SessionSummary {
  id: string; day: string; title: string; notes: string | null; startedAt: string;
  durationMinutes: number; sets: number; volumeKg: number; records: number;
  exercises: { key: string | null; name: string; sets: SetEntry[] }[];
}

export interface TrainerOverview {
  goalLabel: string;
  split: string;
  today: {
    day: string;
    workout: WeeklyWorkout;
    doneToday: boolean;
    next: { inDays: number; title: string; label: string; weekday: number } | null;
  };
  week: { day: string; weekday: number; shortLabel: string; title: string; isTrainingDay: boolean; done: boolean; isToday: boolean; isPast: boolean }[];
  weekGoal: { done: number; target: number; streakWeeks: number };
  streak: number;
  level: LevelInfo;
  totals: { sessions: number; volumeKg: number; sets: number; minutes: number };
  heatmap: { day: string; sessions: number; volumeKg: number; future: boolean }[];
  weekly: { weekStart: string; sessions: number; volumeKg: number; sets: number; minutes: number }[];
  recovery: { id: number; hoursSince: number }[];
  recentSessions: SessionSummary[];
  records: { key: string; name: string; loadKg: number; e1rm: number; reps: number; day: string }[];
  achievements: Achievement[];
}

export interface PersonalRecord { kind: 'load' | 'e1rm' | 'reps'; value: number; previous: number; exercise: string }

export interface SessionResult {
  sessionId: string;
  day: string;
  durationSeconds: number;
  totals: { exercises: number; sets: number; reps: number; volumeKg: number };
  records: PersonalRecord[];
  xpEarned: number;
  level: LevelInfo;
  leveledUp: boolean;
}

export interface SwapOption extends PlannedExercise { difficulty: number }

export interface ExerciseStats {
  key: string; name: string; group: string; equipment: string[]; difficulty: number; unit: ExerciseUnit;
  primaryMuscles: number[]; secondaryMuscles: number[];
  muscles: string; howTo: string; commonMistake: string; benefits: string;
  workSeconds: number; restSeconds: number; progression: string; regression: string;
  suggestedSets?: number; repsMin?: number; repsMax?: number;
  history: { day: string; sets: SetEntry[]; loadKg: number; e1rm: number; reps: number; volumeKg: number; topSet: SetEntry | null; records: number }[];
  best: { loadKg: number; e1rm: number; reps: number; volume: number } | null;
  estimated1Rm: number | null;
  suggestion: Suggestion;
  sessions: number;
}
