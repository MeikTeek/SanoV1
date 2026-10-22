import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMealPlan, excludedTags, screenDiet } from '../../backend/src/services/trainer/mealPlan';
import { FOODS, FOOD_BY_KEY } from '../../backend/src/services/trainer/foods';
import { computeDiet } from '../../backend/src/services/trainer/diet';

const adult = { weightKg: 75, heightCm: 175, age: 30 };
const targets = { kcal: 2400, proteinG: 150, carbG: 290, fatG: 70 };

test('tabela tem ao menos 100 alimentos com macros coerentes', () => {
  assert.ok(FOODS.length >= 100, `só ${FOODS.length} alimentos`);
  assert.equal(new Set(FOODS.map((food) => food.key)).size, FOODS.length);
  for (const food of FOODS) {
    const fromMacros = food.proteinG * 4 + food.carbG * 4 + food.fatG * 9;
    // Fibra e álcool de açúcar explicam diferenças pequenas; erro grosseiro de digitação não passa.
    assert.ok(Math.abs(fromMacros - food.kcal) <= Math.max(25, food.kcal * 0.2), `${food.name}: ${food.kcal} kcal vs ${Math.round(fromMacros)} pelos macros`);
  }
});

test('triagem: extremos bloqueiam, obesidade e magreza avisam', () => {
  assert.equal(screenDiet(adult).level, 'ok');
  assert.equal(screenDiet({ ...adult, weightKg: 45 }).level, 'blocked'); // IMC 14,7
  assert.equal(screenDiet({ ...adult, weightKg: 125 }).level, 'blocked'); // IMC 40,8
  assert.equal(screenDiet({ ...adult, weightKg: 54 }).level, 'caution'); // IMC 17,6
  assert.equal(screenDiet({ ...adult, weightKg: 100 }).level, 'caution'); // IMC 32,7
  assert.equal(screenDiet({ ...adult, weightKg: 82 }).level, 'attention'); // IMC 26,8
  assert.equal(screenDiet({ ...adult, age: 16 }).level, 'blocked');
  assert.equal(screenDiet({ ...adult, pregnancy: true }).level, 'blocked');
  assert.equal(screenDiet({ ...adult, heartCondition: true }).level, 'attention');
});

test('cardápio chega perto da meta e usa só alimentos da tabela', () => {
  const plan = buildMealPlan({ ...targets, mealsPerDay: 4, restrictions: [], seed: 100 });
  assert.equal(plan.meals.length, 4);
  assert.ok(Math.abs(plan.totals.kcal - targets.kcal) <= targets.kcal * 0.1, `${plan.totals.kcal} kcal`);
  assert.ok(Math.abs(plan.totals.proteinG - targets.proteinG) <= targets.proteinG * 0.1, `${plan.totals.proteinG} g de proteína`);
  for (const item of plan.meals.flatMap((meal) => meal.items)) {
    assert.ok(FOOD_BY_KEY.has(item.key));
    assert.ok(item.grams > 0 && item.measure.length > 0);
  }
});

test('restrições valem para o cardápio e para as trocas', () => {
  for (const restrictions of [['vegano'], ['vegetariano', 'sem lactose'], ['sem glúten', 'alergia a amendoim']]) {
    const blocked = excludedTags(restrictions);
    for (const seed of [1, 2, 3, 50]) {
      const plan = buildMealPlan({ ...targets, mealsPerDay: 5, restrictions, seed });
      const keys = plan.meals.flatMap((meal) => meal.items.flatMap((item) => [item.key, ...item.alternatives.map((alt) => alt.key)]));
      for (const key of keys) {
        const tags = FOOD_BY_KEY.get(key)!.tags;
        assert.ok(!tags.some((tag) => blocked.has(tag)), `${restrictions.join('+')}: ${key} (${tags.join(',')})`);
      }
    }
  }
});

test('mesma semente, mesmo cardápio; outro dia, outro cardápio', () => {
  const a = buildMealPlan({ ...targets, mealsPerDay: 3, restrictions: [], seed: 7 });
  const b = buildMealPlan({ ...targets, mealsPerDay: 3, restrictions: [], seed: 7 });
  const c = buildMealPlan({ ...targets, mealsPerDay: 3, restrictions: [], seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.meals.map((meal) => meal.items.map((item) => item.key)), c.meals.map((meal) => meal.items.map((item) => item.key)));
});

test('abaixo do peso não entra em déficit; obesidade calcula proteína pelo peso de referência', () => {
  const base = { heightCm: 175, birthYear: 1994, sex: 'M' as const, trainingDays: 3, sleepHours: 7, waterLiters: 2, dietQuality: 'FAIR' as const, dietRestrictions: [] };
  const thin = computeDiet({ ...base, weightKg: 54, goal: 'WEIGHT_LOSS' });
  assert.ok(thin.kcal >= thin.tdee, 'sem déficit com IMC < 18,5');
  const obese = computeDiet({ ...base, weightKg: 110, goal: 'HYPERTROPHY' });
  assert.ok(obese.proteinG <= Math.round(25 * 1.75 * 1.75 * 2.0) + 1, `proteína ${obese.proteinG} g`);
});

test('obesidade com objetivo de ganhar massa fica em manutenção', () => {
  const base = { heightCm: 175, birthYear: 1994, sex: 'M' as const, trainingDays: 3, sleepHours: 7, waterLiters: 2, dietQuality: 'FAIR' as const, dietRestrictions: [] };
  const obese = computeDiet({ ...base, weightKg: 100, goal: 'HYPERTROPHY' });
  assert.ok(Math.abs(obese.kcal - obese.tdee) <= 10, `${obese.kcal} kcal vs TDEE ${obese.tdee}`);
});
