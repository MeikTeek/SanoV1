import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  achievements, detectRecords, estimate1Rm, levelFromXp, parseRange, sessionXp, suggestNext,
  trainingStreak, weekStartKey, weeklyGoalStreak, bestOf,
} from '../../backend/src/services/trainer/progression';
import { EXERCISES } from '../../backend/src/services/trainer/exercises';
import { musclesFor } from '../../backend/src/services/trainer/muscles';
import { generateWeeklyPlan, swapKey, swapOptions, type WeeklyPlanProfile } from '../../backend/src/services/trainer/weeklyPlan';

const set = (reps: number, loadKg: number | null = null, rir: number | null = null) => ({ reps, loadKg, rir });

test('progressão dupla: sobe a carga só quando todas as séries chegam ao topo da faixa', () => {
  const range = { min: 8, max: 12 };
  const up = suggestNext([set(12, 40, 2), set(12, 40, 1), set(12, 40, 1)], range, false);
  assert.equal(up.trend, 'up');
  assert.equal(up.loadKg, 42.5);
  assert.equal(up.reps, 8);

  const hold = suggestNext([set(12, 40), set(10, 40), set(9, 40)], range, false);
  assert.equal(hold.trend, 'hold');
  assert.equal(hold.loadKg, 40);
  assert.equal(hold.reps, 10);

  // Chegou ao topo mas falhou (RIR 0): não sobe.
  assert.equal(suggestNext([set(12, 40, 0), set(12, 40, 0)], range, false).trend, 'hold');
  // Pernas sobem de 5 em 5.
  assert.equal(suggestNext([set(12, 100), set(12, 100)], range, true).loadKg, 105);
  // Muito abaixo da faixa: reduz.
  assert.equal(suggestNext([set(4, 60), set(3, 60)], range, false).trend, 'down');
  // Sem histórico.
  assert.equal(suggestNext([], range, false).trend, 'new');
  // Peso corporal: progride em repetições.
  const bodyweight = suggestNext([set(10), set(9)], range, false);
  assert.equal(bodyweight.loadKg, null);
  assert.equal(bodyweight.reps, 11);
});

test('recordes comparam com o histórico; a primeira vez é ponto de partida', () => {
  assert.deepEqual(detectRecords([set(10, 50)], null), []);
  const history = bestOf([set(10, 50), set(8, 50)]);
  assert.deepEqual(detectRecords([set(10, 50)], history), []);
  assert.equal(detectRecords([set(6, 55)], history)[0].kind, 'load');
  assert.equal(detectRecords([set(13, 50)], history)[0].kind, 'e1rm');
  assert.equal(detectRecords([set(15)], bestOf([set(12)]))[0].kind, 'reps');
  assert.equal(estimate1Rm(100, 1), 100);
  assert.equal(estimate1Rm(100, 10), 133.3);
});

test('XP premia presença com teto e o nível sobe pela curva existente', () => {
  assert.equal(sessionXp(0), 40);
  assert.equal(sessionXp(10), 70);
  assert.equal(sessionXp(100), 130);
  assert.equal(levelFromXp(0).current, 1);
  assert.equal(levelFromXp(100).current, 2);
  assert.equal(levelFromXp(99).xp, 99);
});

test('ofensiva conta dias planejados: descanso não quebra, hoje ainda não quebra', () => {
  // Plano seg/qua/sex. 2026-10-19 é segunda.
  const planned = [1, 3, 5];
  const days = new Set(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19']);
  // Terça (20): segunda treinou, fim de semana era descanso.
  assert.equal(trainingStreak(days, planned, '2026-10-20'), 4);
  // Quarta (21) sem treino ainda: não quebra.
  assert.equal(trainingStreak(days, planned, '2026-10-21'), 4);
  // Quinta (22): quarta planejada passou em branco.
  assert.equal(trainingStreak(days, planned, '2026-10-22'), 0);
  // Treino extra num sábado soma.
  assert.equal(trainingStreak(new Set([...days, '2026-10-17']), planned, '2026-10-20'), 5);
  assert.equal(trainingStreak(new Set(), planned, '2026-10-20'), 0);
});

test('semanas na meta e início da semana na segunda', () => {
  assert.equal(weekStartKey('2026-10-25'), '2026-10-19');
  assert.equal(weekStartKey('2026-10-19'), '2026-10-19');
  const days = new Set(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15', '2026-10-20']);
  assert.equal(weeklyGoalStreak(days, 2, '2026-10-21'), 2);
  assert.equal(weeklyGoalStreak(new Set([...days, '2026-10-21']), 2, '2026-10-21'), 3);
});

test('conquistas mostram progresso parcial', () => {
  const list = achievements({ sessions: 5, streak: 2, bestWeeklyStreak: 1, records: 0, totalVolumeKg: 5000, assessments: 0, earlySessions: 0, lateSessions: 0 });
  assert.equal(list.find((a) => a.key === 'first')!.unlocked, true);
  assert.equal(list.find((a) => a.key === 'ten')!.progress, 0.5);
  assert.equal(list.find((a) => a.key === 'ton10')!.unlocked, false);
  assert.deepEqual(parseRange('8–12'), { min: 8, max: 12 });
  assert.deepEqual(parseRange('30–45 segundos'), { min: 30, max: 45 });
});

test('todo exercício do catálogo tem músculo principal para o mapa corporal', () => {
  const withoutMuscle = EXERCISES.filter((e) => e.group !== 'mobilidade' && musclesFor(e).primary.length === 0);
  assert.deepEqual(withoutMuscle.map((e) => e.key), []);
  for (const exercise of EXERCISES) {
    for (const id of [...musclesFor(exercise).primary, ...musclesFor(exercise).secondary]) assert.ok(id >= 1 && id <= 16);
  }
});

const profile: WeeklyPlanProfile = {
  goal: 'HYPERTROPHY',
  equipment: ['academia'],
  injuries: [],
  birthYear: 1990,
  experience: 'INTERMEDIATE',
  trainingDays: 4,
  trainingWeekdays: [1, 2, 4, 5],
  trainingLocation: 'GYM',
  sleepHours: 7,
  minutesPerDay: 90,
};

test('troca de exercício respeita músculo, segurança e não duplica o dia', () => {
  const plan = generateWeeklyPlan(profile);
  const monday = plan.days.find((d) => d.weekday === 1)!;
  const slot = monday.exercises[0];
  const swap = swapOptions(profile, plan, 1, slot.key)!;
  const replacement = swap.options.find((o) => o.key !== slot.key && !monday.exercises.some((e) => e.key === o.key))!;
  assert.ok(replacement, 'há alternativa para o primeiro exercício');

  const swapped = generateWeeklyPlan(profile, new Date(), { [swapKey(1, slot.key)]: replacement.key });
  const newMonday = swapped.days.find((d) => d.weekday === 1)!;
  assert.equal(newMonday.exercises[0].key, replacement.key);
  assert.equal(newMonday.exercises[0].swappedFrom, slot.key);
  assert.equal(newMonday.exercises[0].muscle, slot.muscle);
  assert.equal(new Set(newMonday.exercises.map((e) => e.key)).size, newMonday.exercises.length);

  // Troca por algo bloqueado (lesão) é ignorada.
  const injured = { ...profile, injuries: ['ombro'] };
  const ignored = generateWeeklyPlan(injured, new Date(), { [swapKey(1, slot.key)]: 'desenvolvimento_militar' });
  assert.ok(!ignored.days.flatMap((d) => d.exercises).some((e) => e.key === 'desenvolvimento_militar'));
});

test('cada dia de treino informa os músculos para o mapa e a faixa numérica de reps', () => {
  const plan = generateWeeklyPlan(profile);
  for (const day of plan.days.filter((d) => d.isTrainingDay)) {
    assert.ok(day.muscleIds.primary.length > 0);
    for (const exercise of day.exercises) assert.ok(exercise.repsMin > 0 && exercise.repsMax >= exercise.repsMin);
  }
});
