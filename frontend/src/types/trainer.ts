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

export interface PlayerStats {
  strength: number;
  agility: number;
  stamina: number;
  vitality: number;
  streak: number;
  debuffed: boolean;
}

export interface MissionBlock {
  key: string;
  name: string;
  group: string;
  target: string;
  minutes: number;
  xp: number;
}

export interface DailyMission {
  id: string;
  day: string;
  title: string;
  blocks: MissionBlock[];
  plannedMinutes: number;
  completedAt: string | null;
  xpAwarded: number;
  progress: { blockKey: string; doneCount: number }[];
}

export interface TrainerDashboard {
  onboarded: boolean;
  profile?: TrainingProfile;
  stats?: PlayerStats;
  level?: { current: number; title: string; xp: number; xpNeeded: number };
  mission?: DailyMission | null;
  history?: { day: string; completedAt: string | null; plannedMinutes: number; xpAwarded: number }[];
  penalty?: { daysMissed: number; percent: number } | null;
  aiEnabled?: boolean;
}

export interface LibraryResponse {
  allowed: { key: string; name: string; group: string; difficulty: number; equipment: Equipment[] }[];
  blocked: { name: string; reason: string }[];
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