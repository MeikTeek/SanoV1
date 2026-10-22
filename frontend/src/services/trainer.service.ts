import { api } from './api';
import type {
  TrainerDashboard, LibraryResponse, TrainingProfile, TrainerMeta,
  Equipment, Injury, Goal, Somatotype, ExerciseDetail, DietResponse,
  WeeklyPlan, TrainerData, BodyAssessmentPayload, TrainerOverview, WorkoutDay,
  SessionResult, SwapOption, ExerciseStats,
} from '../types/trainer';

export const getMeta = () => api.get<TrainerMeta>('/trainer/meta');

export const getDashboard = () => api.get<TrainerDashboard>('/trainer/dashboard');

export interface OnboardingPayload {
  weightKg: number;
  heightCm: number;
  birthYear: number;
  sex: 'M' | 'F' | 'OTHER';
  goal: Goal;
  somatotype?: Somatotype;
  experience?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  trainingDays?: number;
  trainingWeekdays?: number[];
  trainingLocation?: 'GYM' | 'CALISTHENICS';
  targetWeightKg?: number;
  pregnancy?: boolean;
  heartCondition?: boolean;
  medicationUse?: boolean;
  parqAnswers?: Record<string, boolean>;
  sleepHours?: number;
  waterLiters?: number;
  mealsPerDay?: number;
  dietQuality?: 'POOR' | 'FAIR' | 'GOOD';
  dietNotes?: string;
  dietRestrictions?: string[];
  equipment: Equipment[];
  injuries: Injury[];
  minutesPerDay: number;
  restrictionNotes?: string;
}

export const onboard = (data: OnboardingPayload) =>
  api.post<{ profile: TrainingProfile; intro: string }>('/trainer/onboarding', data);

export const getExerciseDetail = (key: string) =>
  api.get<ExerciseDetail>(`/trainer/exercises/${key}`);

export const getDiet = () =>
  api.get<DietResponse>('/trainer/diet');

export const getReview = () =>
  api.get<{ review: string; aiEnabled: boolean }>('/trainer/review');

export const getLibrary = (filters: { q?: string; group?: string; equipment?: string } = {}) => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.group) params.set('group', filters.group);
  if (filters.equipment) params.set('equipment', filters.equipment);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return api.get<LibraryResponse>(`/trainer/library${suffix}`);
};

export const getReport = () => api.get<{ report: string; aiEnabled: boolean; raw: { completedDays: number; totalMinutes: number } }>('/trainer/report');

export const askCoach = (question: string) => api.post<{ answer: string; aiEnabled: boolean }>('/trainer/ask', { question });

export const getWeeklyPlan = () => api.get<WeeklyPlan>('/trainer/weekly-plan');
export const getTrainerData = () => api.get<TrainerData>('/trainer/data');
export const saveAssessment = (data: BodyAssessmentPayload) =>
  api.post('/trainer/assessments', data);
export const getOverview = () => api.get<TrainerOverview>('/trainer/overview');
export const getWorkoutDay = (weekday: number) => api.get<WorkoutDay>(`/trainer/workout/${weekday}`);
export const getExerciseStats = (key: string) => api.get<ExerciseStats>(`/trainer/exercises/${encodeURIComponent(key)}/stats`);

export interface SessionPayload {
  title: string;
  startedAt?: string;
  notes?: string;
  entries: { exerciseKey: string; sets: { reps: number; loadKg?: number | null; rir?: number | null }[] }[];
}
export const saveSession = (data: SessionPayload) => api.post<SessionResult>('/trainer/sessions', data);
export const deleteSession = (id: string) => api.delete<{ ok: true }>(`/trainer/sessions/${id}`);

export const getSwapOptions = (weekday: number, exerciseKey: string) =>
  api.get<{ original: string; current: string; options: SwapOption[] }>(
    `/trainer/swap-options?weekday=${weekday}&exerciseKey=${encodeURIComponent(exerciseKey)}`,
  );
export const swapExercise = (weekday: number, exerciseKey: string, replacementKey: string | null) =>
  api.put<WeeklyPlan>('/trainer/swaps', { weekday, exerciseKey, replacementKey });
