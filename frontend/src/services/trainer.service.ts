import { api } from './api';
import type {
  TrainerDashboard, LibraryResponse, TrainingProfile, TrainerMeta,
  Equipment, Injury, Goal, Somatotype, ExerciseDetail, DietNumbers,
  WeeklyPlan, TrainerData, BodyAssessmentPayload,
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
  api.post<{ profile: TrainingProfile; mission: unknown; intro: string }>('/trainer/onboarding', data);

export const getExerciseDetail = (key: string) =>
  api.get<ExerciseDetail>(`/trainer/exercises/${key}`);

export const getDiet = () =>
  api.get<{ numbers: DietNumbers; meals: string; aiEnabled: boolean }>('/trainer/diet');

export const getReview = () =>
  api.get<{ review: string; aiEnabled: boolean }>('/trainer/review');

export const completeBlock = (missionId: string, blockKey: string) =>
  api.post<{ ok: true; done: string[]; completed: boolean; leveledUp?: boolean; level?: number }>(
    `/trainer/missions/${missionId}/complete`,
    { blockKey },
  );

export const getLibrary = () => api.get<LibraryResponse>('/trainer/library');

export const getReport = () => api.get<{ report: string; aiEnabled: boolean; raw: { completedDays: number; totalMinutes: number } }>('/trainer/report');

export const askCoach = (question: string) => api.post<{ answer: string; aiEnabled: boolean }>('/trainer/ask', { question });

export const getWeeklyPlan = () => api.get<WeeklyPlan>('/trainer/weekly-plan');
export const getTrainerData = () => api.get<TrainerData>('/trainer/data');
export const saveAssessment = (data: BodyAssessmentPayload) =>
  api.post('/trainer/assessments', data);
export const logWorkout = (entries: { exerciseKey: string; sets: number; reps: number; loadKg?: number }[]) =>
  api.post<{ saved: number; day: string }>('/trainer/workout-logs', { entries });