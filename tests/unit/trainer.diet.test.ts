import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiet, isPlantBased, type DietProfile } from '../../backend/src/services/trainer/diet';

const base: DietProfile = {
  weightKg: 80, heightCm: 180, birthYear: 1990, sex: 'M',
  goal: 'HYPERTROPHY', somatotype: 'MESOMORPH', experience: 'INTERMEDIATE',
  trainingDays: 4, sleepHours: 7, waterLiters: 3,
  dietQuality: 'GOOD', dietRestrictions: [],
};

test('objetivo muda as calorias na direção esperada', () => {
  const massa = computeDiet(base).kcal;
  const emag = computeDiet({ ...base, goal: 'WEIGHT_LOSS' }).kcal;
  const manut = computeDiet({ ...base, goal: 'CONDITIONING' }).kcal;
  assert.ok(massa > manut, 'ganhar massa deve superar a manutenção');
  assert.ok(emag < manut, 'emagrecer deve ficar abaixo da manutenção');
});

test('proteína sobe com o peso e nunca é irrisória', () => {
  const leve = computeDiet({ ...base, weightKg: 55 });
  const pesado = computeDiet({ ...base, weightKg: 95 });
  assert.ok(pesado.proteinG > leve.proteinG);
  assert.ok(leve.proteinG / 55 >= 1.5, 'proteína mínima por kg deve ser 1,6 ou mais');
});

test('gordura tem piso funcional (0,6 g/kg)', () => {
  // Com déficit forte a gordura não pode despencar: é hormônio.
  const d = computeDiet({ ...base, goal: 'WEIGHT_LOSS' });
  assert.ok(d.fatG >= 0.6 * base.weightKg, `gordura ${d.fatG} abaixo do piso funcional`);
});

test('calorias nunca ficam abaixo de um piso seguro', () => {
  const d = computeDiet({ ...base, weightKg: 50, heightCm: 150, sex: 'F', birthYear: 1960, goal: 'WEIGHT_LOSS' });
  assert.ok(d.kcal >= 1200, `kcal ${d.kcal} abaixo do piso de segurança`);
});

test('biiótipo altera o carboidrato', () => {
  const ecto = computeDiet({ ...base, somatotype: 'ECTOMORPH' });
  const endo = computeDiet({ ...base, somatotype: 'ENDOMORPH' });
  assert.ok(ecto.carbG > endo.carbG, 'ectomorfo deve receber mais carboidrato que endomorfo');
});

test('treinar mais aumenta o TDEE', () => {
  const poco = computeDiet({ ...base, trainingDays: 1 });
  const muito = computeDiet({ ...base, trainingDays: 6 });
  assert.ok(muito.tdee > poco.tdee);
});

test('todo ajuste fica visível e explicado para o usuário', () => {
  const d = computeDiet({ ...base, sleepHours: 5, waterLiters: 1, dietQuality: 'POOR' });
  const texto = d.rationale.join(' ').toLowerCase();
  assert.match(texto, /sono/, 'o ajuste de sono deve ser explicado');
  assert.match(texto, /hidrata/, 'o ajuste de hidratação deve ser explicado');
  assert.ok(d.rationale.length >= 4);
});

test('meta de água cresce com peso e frequência de treino', () => {
  const leve = computeDiet({ ...base, weightKg: 55, trainingDays: 2 });
  const pesado = computeDiet({ ...base, weightKg: 95, trainingDays: 6 });
  assert.ok(pesado.waterTarget > leve.waterTarget);
});

test('detecta dieta vegetal', () => {
  assert.equal(isPlantBased([]), false);
  assert.equal(isPlantBased(['lactose']), false);
  assert.equal(isPlantBased(['vegetariano']), true);
  assert.equal(isPlantBased(['vegano']), true);
});