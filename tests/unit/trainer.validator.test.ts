import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyAssessmentSchema, onboardingSchema, swapSchema, workoutSessionSchema } from '../../backend/src/validators/trainer.validator';

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

test('sessão de treino aceita só séries reais, com limites de reps, carga e RIR', () => {
  const set = { reps: 10, loadKg: 20, rir: 2 };
  assert.equal(workoutSessionSchema.safeParse({ title: 'Corpo inteiro A', entries: [{ exerciseKey: 'flexao', sets: [{ reps: 12 }] }] }).success, true);
  assert.equal(workoutSessionSchema.safeParse({
    title: 'Superior', startedAt: new Date().toISOString(),
    entries: [{ exerciseKey: 'supino_reto_barra', sets: [set, { ...set, reps: 8, rir: null }] }],
  }).success, true);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [] }).success, false);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [{ exerciseKey: '', sets: [set] }] }).success, false);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [{ exerciseKey: 'flexao', sets: [] }] }).success, false);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [{ exerciseKey: 'flexao', sets: [{ reps: 0 }] }] }).success, false);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [{ exerciseKey: 'flexao', sets: [{ ...set, rir: 11 }] }] }).success, false);
  assert.equal(workoutSessionSchema.safeParse({ title: 'A', entries: [{ exerciseKey: 'flexao', sets: [{ ...set, loadKg: 1200 }] }] }).success, false);
});

test('troca de exercício exige dia válido e aceita desfazer com null', () => {
  assert.equal(swapSchema.safeParse({ weekday: 1, exerciseKey: 'flexao', replacementKey: 'supino_reto_barra' }).success, true);
  assert.equal(swapSchema.safeParse({ weekday: 1, exerciseKey: 'flexao', replacementKey: null }).success, true);
  assert.equal(swapSchema.safeParse({ weekday: 7, exerciseKey: 'flexao', replacementKey: null }).success, false);
});
