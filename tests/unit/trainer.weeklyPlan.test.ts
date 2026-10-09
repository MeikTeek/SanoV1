import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../../backend/src/services/trainer/exercises';
import { generateWeeklyPlan, type WeeklyPlanProfile } from '../../backend/src/services/trainer/weeklyPlan';

const base: WeeklyPlanProfile = {
  goal: 'HYPERTROPHY',
  equipment: ['academia', 'halteres', 'peso-corporal', 'nenhum', 'elastico', 'barra-fixa'],
  injuries: [],
  birthYear: 1990,
  experience: 'BEGINNER',
  trainingDays: 3,
  trainingWeekdays: [1, 3, 5],
  trainingLocation: 'GYM',
  sleepHours: 7,
  minutesPerDay: 60,
};

test('gera sete cartões e a divisão adequada para 2 a 6 sessões', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const weekdays = [1, 2, 3, 4, 5, 6].slice(0, count);
    const plan = generateWeeklyPlan({ ...base, trainingDays: count, trainingWeekdays: weekdays });
    assert.equal(plan.days.length, 7);
    assert.equal(plan.days.filter((day) => day.isTrainingDay).length, count);
    assert.equal(plan.matrix.length, 9);
    if (count === 2 || count === 3) assert.match(plan.split, /Corpo inteiro/);
    if (count === 4) assert.match(plan.split, /Superior\/Inferior/);
    if (count === 6) assert.match(plan.split, /Empurrar\/Puxar\/Pernas/);
  }
});

test('prescreve faixas de hipertrofia, força e emagrecimento e ajusta sono', () => {
  const hypertrophy = generateWeeklyPlan(base);
  assert.equal(hypertrophy.prescription.sets, 3);
  assert.equal(hypertrophy.prescription.reps, '8–12');
  assert.equal(hypertrophy.prescription.restSeconds, 75);
  assert.equal(hypertrophy.prescription.rir, '1–3');

  const strength = generateWeeklyPlan({ ...base, goal: 'STRENGTH', sleepHours: 5 });
  assert.equal(strength.prescription.sets, 2);
  assert.equal(strength.prescription.reps, '4–6');
  assert.equal(strength.prescription.restSeconds, 150);
  assert.ok(strength.days.flatMap((day) => day.exercises).every((exercise) => exercise.sets <= 3));

  const weightLoss = generateWeeklyPlan({ ...base, goal: 'WEIGHT_LOSS', experience: 'INTERMEDIATE' });
  assert.equal(weightLoss.prescription.sets, 3);
  assert.equal(weightLoss.prescription.reps, '12–15');
  assert.equal(weightLoss.prescription.restSeconds, 40);
});

test('respeita a semana circular e alerta quando há menos de 48 horas', () => {
  const crowded = generateWeeklyPlan({ ...base, trainingDays: 2, trainingWeekdays: [0, 1] });
  assert.ok(crowded.days.find((day) => day.weekday === 1)?.warnings.some((warning) => warning.includes('menos de 48h')));

  const spaced = generateWeeklyPlan({ ...base, trainingDays: 2, trainingWeekdays: [0, 3] });
  const monday = spaced.matrix.find((row) => row.key === 'chest')?.days.find((day) => day.weekday === 1);
  assert.equal(monday?.state, 'RECOVERY', 'segunda-feira deve considerar o treino de domingo');
});

test('volume semanal é calculado a partir dos exercícios, sessões e séries', () => {
  const plan = generateWeeklyPlan(base);
  const chest = plan.matrix.find((row) => row.key === 'chest')!;
  const measured = plan.days.flatMap((day) => day.exercises)
    .filter((exercise) => exercise.muscle === 'chest')
    .reduce((sum, exercise) => sum + exercise.sets, 0);
  assert.equal(chest.weeklySets, measured);
  assert.ok(chest.weeklySets >= chest.targetMin && chest.weeklySets <= chest.targetMax);
});

test('calistenia não escolhe exercícios que só exigem academia ou halteres', () => {
  const plan = generateWeeklyPlan({
    ...base,
    trainingDays: 3,
    trainingWeekdays: [1, 3, 5],
    trainingLocation: 'CALISTHENICS',
  });
  const selectedKeys = new Set(plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.key)));
  for (const key of selectedKeys) {
    const exercise = EXERCISES.find((item) => item.key === key)!;
    assert.ok(exercise.equipment.some((item) => !['academia', 'halteres'].includes(item)));
  }
});
