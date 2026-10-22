/**
 * Motor de dieta — Determinístico.
 *
 * A IA NÃO calcula calorias: ela recebe os números já prontos e escreve os
 * "~pratos". Isso mantém a matemática auditável e previsível, e deixa a IA
 * atuando só onde ela é boa (variedade e praticidade das refeições).
 */

export type Somatotype = 'ECTOMORPH' | 'MESOMORPH' | 'ENDOMORPH';
export type DietQuality = 'POOR' | 'FAIR' | 'GOOD';

export interface DietProfile {
  weightKg: number;
  heightCm: number;
  birthYear: number;
  sex: 'M' | 'F' | 'OTHER';
  goal: string;
  somatotype?: Somatotype | null;
  experience?: string;
  trainingDays: number;
  sleepHours: number;
  waterLiters: number;
  dietQuality: DietQuality;
  dietRestrictions: string[];
}

export interface DietPlanNumbers {
  tdee: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  waterTarget: number;
  rationale: string[];
}

/* ── Constantes ─────────────────────────────────────────────────────────── */

/** Multiplicador de atividade pela frequência semanal de treino (índice = dias). */
const ACTIVITY_FACTORS = [1.2, 1.35, 1.45, 1.55, 1.65, 1.72, 1.8];

/** Ajuste calórico (kcal/dia) por objetivo. */
const GOAL_DELTA_KCAL: Record<string, number> = {
  HYPERTROPHY: 300, STRENGTH: 0, WEIGHT_LOSS: -400, CONDITIONING: 0, HEALTH: -100,
};

/** Proteína (g/kg) por objetivo. Faixa usada: 1,6 a 2,2. */
const GOAL_PROTEIN_PER_KG: Record<string, number> = {
  HYPERTROPHY: 2.0, STRENGTH: 2.0, WEIGHT_LOSS: 2.2,
};
const DEFAULT_PROTEIN_PER_KG = 1.6;

/** Ajuste calórico por biótipo; o excedente/falta entra no carboidrato. */
const SOMATOTYPE_DELTA_KCAL: Record<Somatotype, number> = {
  ECTOMORPH: 60, MESOMORPH: 0, ENDOMORPH: -60,
};

const MIN_FAT_PER_KG = 0.6;
const MIN_FAT_KCAL_SHARE = 0.25;
const KCAL_FLOOR = { F: 1200, M: 1500, OTHER: 1500 } as const;
const ADULT_AGE = 18;
const UNDERWEIGHT_BMI = 18.5;
const OBESE_BMI = 30;
const REFERENCE_BMI = 25;

/* ── Helpers exportados (fonte única para o resto do módulo) ────────────── */

export const ageFromBirthYear = (birthYear: number, now = new Date()) =>
  now.getFullYear() - birthYear;

/** Mifflin-St Jeor: fórmula padrão para gasto calórico em repouso. */
export function estimateBmr(sex: DietProfile['sex'], weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'M' ? base + 5 : sex === 'F' ? base - 161 : base - 78;
}

export function activityFactor(trainingDays: number) {
  const index = Math.min(6, Math.max(0, Math.round(trainingDays)));
  return ACTIVITY_FACTORS[index] ?? 1.45;
}

/** Meta de água em litros: 35 ml/kg + 150 ml por dia de treino, mínimo de 1,5 L. */
export function waterTargetLiters(weightKg: number, trainingDays: number) {
  return Math.max(1.5, Math.round((weightKg * 0.035 + trainingDays * 0.15) * 10) / 10);
}

/* ── Cálculo principal ──────────────────────────────────────────────────── */

/**
 * Calcula a dieta. Cada ajuste tem um motivo escrito em `rationale` — o
 * usuário consegue ver por que o número é aquele, em vez de confiar numa caixa
 * preta (nem na IA, nem no código).
 *
 * `now` é injetável para o resultado ser reproduzível em testes (a idade
 * depende do ano corrente).
 */
export function computeDiet(p: DietProfile, now = new Date()): DietPlanNumbers {
  const rationale: string[] = [];

  const age = ageFromBirthYear(p.birthYear, now);
  const bmr = estimateBmr(p.sex, p.weightKg, p.heightCm, age);
  const tdee = Math.round(bmr * activityFactor(p.trainingDays));
  rationale.push(`Gasto calórico estimado (BMR × atividade de ${p.trainingDays}x/semana): ${tdee} kcal.`);

  // Ajuste do objetivo. Menores de idade e quem está abaixo do peso não entram em déficit.
  let delta = GOAL_DELTA_KCAL[p.goal] ?? 0;
  const bmi = p.weightKg / ((p.heightCm / 100) ** 2);
  if (age < ADULT_AGE && delta < 0) {
    delta = 0;
    rationale.push('Menor de 18 anos: sem déficit calórico. Procure acompanhamento de nutricionista ou pediatra.');
  } else if (bmi < UNDERWEIGHT_BMI && delta < 0) {
    delta = 0;
    rationale.push('IMC abaixo de 18,5: o objetivo de emagrecer não gera déficit. Converse com um nutricionista.');
  } else if (bmi >= OBESE_BMI && delta > 0) {
    delta = 0;
    rationale.push('IMC de 30 ou mais: sem superávit calórico. Em manutenção o treino ainda constrói músculo; um nutricionista pode ajustar.');
  }

  // Biótipo: endomorfo tem menor gasto, ectomorfo precisa de mais energia.
  // Entra na meta calórica (e não só no carboidrato) para os macros sempre
  // fecharem com as kcal informadas.
  const somatotypeDelta = SOMATOTYPE_DELTA_KCAL[p.somatotype ?? 'MESOMORPH'] ?? 0;

  const minimumKcal = Math.round(Math.max(bmr, KCAL_FLOOR[p.sex]));
  const target = tdee + delta + somatotypeDelta;
  const kcal = Math.max(minimumKcal, target);
  if (target < minimumKcal) {
    rationale.push(`A meta foi limitada a ${minimumKcal} kcal por segurança; não fica abaixo da TMB estimada nem do piso conservador adotado.`);
  }
  rationale.push(
    delta > 0 ? `Superávit de ${delta} kcal para ganhar massa.` :
    delta < 0 ? `Déficit de ${Math.abs(delta)} kcal para emagrecer.` :
    'Manutenção calórica, ajustando a composição dos macronutrientes.',
  );
  if (somatotypeDelta > 0) {
    rationale.push(`Biótipo ectomorfo: +${somatotypeDelta} kcal, vindas de carboidrato, para facilitar o ganho.`);
  } else if (somatotypeDelta < 0) {
    rationale.push(`Biótipo endomorfo: ${somatotypeDelta} kcal, retiradas do carboidrato, para facilitar a perda de gordura.`);
  }

  // Proteína: sobe com treino de força, e é mais alta em déficit.
  // Com obesidade, g/kg sobre o peso total superestima a necessidade: usa o
  // peso que corresponderia a IMC 25.
  const proteinPerKg = GOAL_PROTEIN_PER_KG[p.goal] ?? DEFAULT_PROTEIN_PER_KG;
  const referenceKg = bmi >= OBESE_BMI ? Math.round(REFERENCE_BMI * (p.heightCm / 100) ** 2) : p.weightKg;
  const proteinG = Math.round(referenceKg * proteinPerKg);
  rationale.push(referenceKg !== p.weightKg
    ? `Proteína: ${proteinPerKg} g/kg sobre o peso de referência de ${referenceKg} kg (${proteinG} g/dia).`
    : `Proteína: ${proteinPerKg} g/kg (${proteinG} g/dia) para preservar e construir massa.`);

  // Gordura: o maior entre o mínimo funcional (0,6 g/kg) e 25% das calorias.
  const fatG = Math.max(
    Math.round(referenceKg * MIN_FAT_PER_KG),
    Math.round((kcal * MIN_FAT_KCAL_SHARE) / 9),
  );

  // Carboidrato fecha a conta; é o que sobra. Se proteína + gordura já passam
  // da meta, o carboidrato zera e as kcal finais refletem os macros reais.
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  const macroKcal = proteinG * 4 + carbG * 4 + fatG * 9;
  if (macroKcal > kcal) {
    rationale.push(`Proteína e gordura mínimas já ultrapassam a meta; as calorias foram ajustadas para ${macroKcal} kcal.`);
  }
  rationale.push(`Gordura: ${fatG} g/dia (função hormonal; mínimo de 0,6 g/kg ou 25% das calorias). Carboidrato: o restante, ${carbG} g/dia.`);

  // Sono e hidratação afetam o objetivo final, não só a conta.
  if (p.sleepHours < 6) rationale.push('Menos de 6h de sono reduz recuperação e ganho de massa: considere aumentar.');
  const waterTarget = waterTargetLiters(p.weightKg, p.trainingDays);
  if (p.waterLiters < waterTarget) {
    rationale.push(`Hidratação em ${p.waterLiters} L/dia está abaixo da meta de ${waterTarget} L.`);
  }

  if (p.dietQuality === 'POOR') rationale.push('Alimentação atual irregular: comece pelas mudanças simples da lista de refeições.');

  return { tdee, kcal: Math.max(kcal, macroKcal), proteinG, carbG, fatG, waterTarget, rationale };
}

/* ── Restrições alimentares ─────────────────────────────────────────────── */

const PLANT_BASED = new Set(['vegetariano', 'vegetariana', 'vegano', 'vegana']);

/** Proteína vegetal para quem não come carne. Ignora caixa e espaços. */
export const isPlantBased = (restrictions: string[]) =>
  restrictions.some((r) => PLANT_BASED.has(r.trim().toLowerCase()));