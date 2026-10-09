import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyAssessmentSchema, onboardingSchema, workoutLogSchema } from '../../backend/src/validators/trainer.validator';

const onboarding = {
  weightKg: 70, heightCm: 175, birthYear: 1995, sex: 'M', goal: 'STRENGTH',
  trainingDays: 2, trainingWeekdays: [1, 4], equipment: ['academia'],
  injuries: [], minutesPerDay: 60,
};

test('onboarding aceita 2–6 dias da semana sem duplicações', () => {
  assert.equal(onboardingSchema.safeParse(onboarding).success, true);
  assert.equal(onboardingSchema.safeParse({ ...onboarding, trainingDays: 1 }).success, false);
  assert.equal(onboardingSchema.safeParse({ ...onboarding, trainingWeekdays: [1, 1] }).success, false);
  assert.equal(onboardingSchema.safeParse({ ...onboarding, trainingWeekdays: [1, 2, 4] }).success, false);
});

test('avaliação valida limites e escalas subjetivas', () => {
  assert.equal(bodyAssessmentSchema.safeParse({ weightKg: 70, fatigue: 4, muscleSoreness: 3, nutritionAdherence: 4 }).success, true);
  assert.equal(bodyAssessmentSchema.safeParse({ weightKg: 20 }).success, false);
  assert.equal(bodyAssessmentSchema.safeParse({ weightKg: 70, fatigue: 11 }).success, false);
});

test('registro de treino limita quantidade e valores de séries, repetições e carga', () => {
  assert.equal(workoutLogSchema.safeParse({ entries: [{ exerciseKey: 'flexao', sets: 3, reps: 10, loadKg: 0 }] }).success, true);
  assert.equal(workoutLogSchema.safeParse({ entries: [{ exerciseKey: '', sets: 3, reps: 10 }] }).success, false);
  assert.equal(workoutLogSchema.safeParse({ entries: [{ exerciseKey: 'flexao', sets: 0, reps: 10 }] }).success, false);
});
