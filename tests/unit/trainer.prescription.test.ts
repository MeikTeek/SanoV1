import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prescribeSet, startingLoad, type Athlete } from '../../backend/src/services/trainer/prescription';
import { byKey } from '../../backend/src/services/trainer/exercises';

const man: Athlete = { weightKg: 80, heightCm: 178, sex: 'M', age: 30, experience: 'INTERMEDIATE', goal: 'HYPERTROPHY', hasGym: true };
const fresh = { loadKg: null, reps: 8, note: '', trend: 'new' as const };

test('estima a carga inicial e arredonda para incrementos reais', () => {
  assert.equal(startingLoad({ key: 'supino_reto_barra' }, man), 45);
  const dumbbell = startingLoad({ key: 'rosca_martelo' }, man)!;
  assert.ok(Number.isInteger(dumbbell) && dumbbell >= 1);
  assert.equal(startingLoad({ key: 'leg_press_45' }, man)! % 5, 0);
});

test('iniciante, mulher e mais velhos começam mais leve', () => {
  const base = startingLoad({ key: 'leg_press_45' }, man)!;
  assert.ok(startingLoad({ key: 'leg_press_45' }, { ...man, experience: 'BEGINNER' })! < base);
  assert.ok(startingLoad({ key: 'leg_press_45' }, { ...man, sex: 'F' })! < base);
  assert.ok(startingLoad({ key: 'leg_press_45' }, { ...man, age: 68 })! < base);
});

test('peso acima de IMC 27 não infla a carga', () => {
  const heavy = startingLoad({ key: 'leg_press_45' }, { ...man, weightKg: 140 })!;
  const capped = startingLoad({ key: 'leg_press_45' }, { ...man, weightKg: 27 * 1.78 * 1.78 })!;
  assert.equal(heavy, capped);
});

test('sem academia não prescreve carga de máquina; peso corporal mostra o peso deslocado', () => {
  assert.equal(startingLoad({ key: 'leg_press_45' }, { ...man, hasGym: false }), null);
  const pushup = byKey('flexao')!;
  const { prescription } = prescribeSet(pushup, { unit: 'reps', repsMin: 8, repsMax: 15, restSeconds: 90 }, fresh, man);
  assert.equal(prescription.loadKg, null);
  assert.equal(prescription.bodyweightKg, Math.round(80 * pushup.bodyweightFactor!));
  assert.equal(prescription.setSeconds, prescription.reps * 4);
});

test('histórico manda na carga; isométricos usam o tempo como duração da série', () => {
  const hold = byKey('prancha')!;
  const timed = prescribeSet(hold, { unit: 'segundos', repsMin: 30, repsMax: 60, restSeconds: 45 }, { ...fresh, reps: 30 }, man);
  assert.equal(timed.prescription.setSeconds, timed.prescription.reps);
  const known = prescribeSet(byKey('supino_reto_barra')!, { unit: 'reps', repsMin: 6, repsMax: 10, restSeconds: 120 },
    { loadKg: 60, reps: 8, note: 'Mantenha', trend: 'hold' }, man);
  assert.equal(known.prescription.loadKg, 60);
  assert.equal(known.prescription.estimated, false);
});
