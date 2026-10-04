export type Goal = 'HYPERTROPHY' | 'WEIGHT_LOSS' | 'CONDITIONING' | 'HEALTH';
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