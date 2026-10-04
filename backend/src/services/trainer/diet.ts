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

/** Mifflin-St Jeor: fórmula padrão para gasto calórico em repouso. */
const bmr = (p: DietProfile) => {
  const age = new Date().getFullYear() - p.birthYear;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  return p.sex === 'M' ? base + 5 : p.sex === 'F' ? base - 161 : base - 78;
};

/** Multiplicador de atividade pela frequência semanal de treino. */
const ACTIVITY: Record<number, number> = { 0: 1.2, 1: 1.35, 2: 1.45, 3: 1.55, 4: 1.65, 5: 1.72, 6: 1.8 };

/**
 * Calcula a dieta. Cada ajuste tem um motivo escrito em `rationale` — o
 * usuário consegue ver por que o número é aquele, em vez de confiar numa caixa
 * preta (nem na IA, nem no código).
 */
export function computeDiet(p: DietProfile): DietPlanNumbers {
  const rationale: string[] = [];

  const tdee = Math.round(bmr(p) * (ACTIVITY[Math.min(6, p.trainingDays)] ?? 1.45));
  rationale.push(`Gasto calórico estimado (BMR × atividade de ${p.trainingDays}x/semana): ${tdee} kcal.`);

  // Ajuste do objetivo.
  const DELTA: Record<string, number> = { HYPERTROPHY: 300, WEIGHT_LOSS: -400, CONDITIONING: 0, HEALTH: -100 };
  const delta = DELTA[p.goal] ?? 0;
  const kcal = Math.max(1200, tdee + delta);
  rationale.push(
    delta > 0 ? `Superávit de ${delta} kcal para ganhar massa.` :
    delta < 0 ? `Déficit de ${Math.abs(delta)} kcal para emagrecer.` :
    'Manutenção calórica, ajustando a composição dos macronutrientes.',
  );

  // Proteína: 1,6 a 2,2 g/kg. Sobe com treino de força, cai em déficit.
  const proteinPerKg = p.goal === 'HYPERTROPHY' ? 2.0 : p.goal === 'WEIGHT_LOSS' ? 2.2 : 1.6;
  const proteinG = Math.round(p.weightKg * proteinPerKg);
  rationale.push(`Proteína: ${proteinPerKg} g/kg (${proteinG} g/dia) para preservar e construir massa.`);

  // Biótipo: endomorfo tem menor gasto e ladeia mais carboidrato.
  const somatotypeAdj: Record<string, number> = { ECTOMORPH: 60, MESOMORPH: 0, ENDOMORPH: -60 };
  const soma = somatotypeAdj[p.somatotype ?? 'MESOMORPH'] ?? 0;
  if (soma) {
    rationale.push(soma > 0
      ? 'Biótipo ectomorfo: carboidrato liberado acima da média para facilitar o ganho.'
      : 'Biótipo endomorfo: carboidrato reduzido para facilitar a perda de gordura.');
  }

  // Gordura: mínima funcional (0,6 g/kg) — nunca abaixo disso.
  const fatG = Math.max(Math.round(p.weightKg * 0.6), Math.round((kcal * 0.25) / 9));

  // Carboidrato fecha a conta; é o que sobra.
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4) + soma / 4);
  rationale.push(`Gordura: ${fatG} g/dia (função hormonal). Carboidrato: o restante, ${carbG} g/dia.`);

  // Sono e hidratação afetam o objetivo final, não só a conta.
  if (p.sleepHours < 6) rationale.push('Menos de 6h de sono reduz recuperação e ganho de massa: considere aumentar.');
  const waterTarget = Math.max(1.5, Math.round((p.weightKg * 0.035 + p.trainingDays * 0.15) * 10) / 10);
  if (p.waterLiters < waterTarget) {
    rationale.push(`Hidratação em ${p.waterLiters} L/dia está abaixo da meta de ${waterTarget} L.`);
  }

  if (p.dietQuality === 'POOR') rationale.push('Alimentação atual irregular: comece pelas mudanças simples da lista de refeições.');

  return { tdee, kcal: Math.round(kcal), proteinG, carbG, fatG, waterTarget, rationale };
}

/** Proteína vegetal para quem não come carne. */
export const isPlantBased = (r: string[]) =>
  r.includes('vegetariano') || r.includes('vegano');