import { z } from 'zod';

const equipment = z.enum(['academia', 'peso-corporal', 'elastico', 'barra-fixa', 'halteres', 'nenhum']);
const injury = z.enum(['joelho', 'lombar', 'ombro', 'cotovelo', 'quadril', 'pescoco']);
const goal = z.enum(['HYPERTROPHY', 'WEIGHT_LOSS', 'CONDITIONING', 'HEALTH']);

export const onboardingSchema = z.object({
  weightKg: z.coerce.number().min(30, 'Peso mínimo 30 kg').max(300, 'Peso máximo 300 kg'),
  heightCm: z.coerce.number().min(120, 'Altura mínima 1,20 m').max(230, 'Altura máxima 2,30 m'),
  birthYear: z.coerce.number().int().min(1920).max(new Date().getFullYear() - 10, 'Idade mínima de 10 anos'),
  sex: z.enum(['M', 'F', 'OTHER']),
  goal,
  somatotype: z.enum(['ECTOMORPH', 'MESOMORPH', 'ENDOMORPH']).optional(),
  experience: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  trainingDays: z.coerce.number().int().min(1).max(7).default(3),
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
});

export const completeBlockSchema = z.object({
  blockKey: z.string().min(1).max(80),
});

export const askAiSchema = z.object({
  question: z.string().trim().min(3, 'Escreva sua pergunta').max(800),
});