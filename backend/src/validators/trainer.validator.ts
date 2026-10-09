import { z } from 'zod';

const equipment = z.enum(['academia', 'peso-corporal', 'elastico', 'barra-fixa', 'halteres', 'nenhum']);
const injury = z.enum(['joelho', 'lombar', 'ombro', 'cotovelo', 'quadril', 'pescoco']);
const goal = z.enum(['HYPERTROPHY', 'STRENGTH', 'WEIGHT_LOSS', 'CONDITIONING', 'HEALTH']);
const parqAnswers = z.object({
  heartDiagnosis: z.boolean(),
  chestPain: z.boolean(),
  dizziness: z.boolean(),
  jointCondition: z.boolean(),
  prescribedMedication: z.boolean(),
  supervisedExercise: z.boolean(),
  otherReason: z.boolean(),
});

export const onboardingSchema = z.object({
  weightKg: z.coerce.number().min(30, 'Peso mínimo 30 kg').max(300, 'Peso máximo 300 kg'),
  heightCm: z.coerce.number().min(120, 'Altura mínima 1,20 m').max(230, 'Altura máxima 2,30 m'),
  birthYear: z.coerce.number().int().min(1920).max(new Date().getFullYear() - 10, 'Idade mínima de 10 anos'),
  sex: z.enum(['M', 'F', 'OTHER']),
  goal,
  somatotype: z.enum(['ECTOMORPH', 'MESOMORPH', 'ENDOMORPH']).optional(),
  experience: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  trainingDays: z.coerce.number().int().min(2).max(6).default(3),
  trainingWeekdays: z.array(z.coerce.number().int().min(0).max(6)).min(2).max(6).optional(),
  trainingLocation: z.enum(['GYM', 'CALISTHENICS']).default('GYM'),
  targetWeightKg: z.coerce.number().min(30).max(300).optional(),
  pregnancy: z.boolean().optional(),
  heartCondition: z.boolean().optional(),
  medicationUse: z.boolean().optional(),
  parqAnswers: parqAnswers.optional().nullable(),
  sleepHours: z.coerce.number().min(3).max(14).default(7),
  waterLiters: z.coerce.number().min(0).max(8).default(2),
  mealsPerDay: z.coerce.number().int().min(1).max(8).default(3),
  dietQuality: z.enum(['POOR', 'FAIR', 'GOOD']).default('FAIR'),
  dietNotes: z.string().trim().max(500).optional(),
  dietRestrictions: z.array(z.string().trim().max(40)).max(12).default([]),
  equipment: z.array(equipment).min(1, 'Escolha ao menos uma opção'),
  injuries: z.array(injury).default([]),
  minutesPerDay: z.coerce.number().int().min(10, 'Mínimo de 10 minutos').max(240, 'Máximo de 240 minutos'),
  restrictionNotes: z.string().trim().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.trainingWeekdays && new Set(data.trainingWeekdays).size !== data.trainingWeekdays.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainingWeekdays'], message: 'Escolha dias da semana sem repetições.' });
  }
  if (data.trainingWeekdays && data.trainingWeekdays.length !== data.trainingDays) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainingWeekdays'], message: 'A quantidade de dias precisa corresponder aos dias selecionados.' });
  }
});

export const completeBlockSchema = z.object({
  blockKey: z.string().min(1).max(80),
});

export const askAiSchema = z.object({
  question: z.string().trim().min(3, 'Escreva sua pergunta').max(800),
});

export const bodyAssessmentSchema = z.object({
  weightKg: z.coerce.number().min(30).max(300),
  bodyFatPercent: z.coerce.number().min(3).max(70).optional(),
  waistCm: z.coerce.number().min(30).max(250).optional(),
  neckCm: z.coerce.number().min(20).max(100).optional(),
  hipCm: z.coerce.number().min(30).max(250).optional(),
  chestCm: z.coerce.number().min(30).max(250).optional(),
  armCm: z.coerce.number().min(10).max(100).optional(),
  thighCm: z.coerce.number().min(20).max(150).optional(),
  calfCm: z.coerce.number().min(15).max(100).optional(),
  wristCm: z.coerce.number().min(8).max(40).optional(),
  restingHeartRate: z.coerce.number().int().min(30).max(220).optional(),
  sleepHours: z.coerce.number().min(0).max(14).optional(),
  fatigue: z.coerce.number().int().min(0).max(10).optional(),
  muscleSoreness: z.coerce.number().int().min(0).max(10).optional(),
  nutritionAdherence: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type BodyAssessmentInput = z.infer<typeof bodyAssessmentSchema>;

export const workoutLogSchema = z.object({
  entries: z.array(z.object({
    exerciseKey: z.string().trim().min(1).max(80),
    sets: z.coerce.number().int().min(1).max(12),
    reps: z.coerce.number().int().min(1).max(100),
    loadKg: z.coerce.number().min(0).max(1000).optional(),
  })).min(1).max(30),
});
export type WorkoutLogInput = z.infer<typeof workoutLogSchema>['entries'];