/**
 * Cardápio por REGRAS, sem IA.
 *
 * Recebe as metas já calculadas em `diet.ts` (kcal e macros), divide entre as
 * refeições do dia e, para cada refeição, escolhe um alimento por papel
 * (carboidrato, proteína, leguminosa, verduras, fruta, gordura) da tabela de
 * `foods.ts`. As quantidades saem de um sistema simples: cada papel cobre o
 * macro que ele carrega, descontando o que os outros alimentos já trazem.
 *
 * Antes de tudo, `screenDiet` avalia o IMC e a condição informada: em casos
 * extremos não há cardápio, só a orientação de procurar um profissional.
 */
import { FOOD_BY_KEY, type Food, type FoodTag, type MealSlot } from './foods';

/* ── Avaliação de segurança ─────────────────────────────────────────────── */

export type DietLevel = 'ok' | 'attention' | 'caution' | 'blocked';

export interface DietAssessment {
  bmi: number;
  category: string;
  level: DietLevel;
  title: string;
  messages: string[];
}

export interface ScreenInput {
  weightKg: number;
  heightCm: number;
  age: number;
  pregnancy?: boolean | null;
  heartCondition?: boolean | null;
  medicationUse?: boolean | null;
}

export const DIET_DISCLAIMER =
  'Este cardápio é um levantamento lógico feito por regras, a partir de uma tabela de alimentos e das suas respostas. Não é uma prescrição: consulte um nutricionista ou médico antes de mudar sua alimentação.';

const LEVEL_ORDER: DietLevel[] = ['ok', 'attention', 'caution', 'blocked'];
const worst = (a: DietLevel, b: DietLevel) => (LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function bmiOf(weightKg: number, heightCm: number) {
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

/** Classificação da OMS para adultos. */
export function bmiCategory(bmi: number) {
  if (bmi < 16) return 'Magreza grave';
  if (bmi < 17) return 'Magreza moderada';
  if (bmi < 18.5) return 'Magreza leve';
  if (bmi < 25) return 'Peso adequado';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

/**
 * Decide se dá para montar um cardápio e com que nível de aviso.
 *
 * `blocked` (IMC < 16, IMC ≥ 40, gestação, menor de 18): não há cardápio nem
 * metas — só o aviso. `caution` (magreza ou obesidade I/II): cardápio com
 * aviso destacado. `attention`: sobrepeso ou condição de saúde informada.
 */
export function screenDiet(input: ScreenInput): DietAssessment {
  const bmi = round1(bmiOf(input.weightKg, input.heightCm));
  const category = bmiCategory(bmi);
  const messages: string[] = [];
  let level: DietLevel = 'ok';
  let title = 'Levantamento dentro da faixa de referência';

  if (input.age < 18) {
    return {
      bmi, category: 'Não se aplica (menor de 18 anos)', level: 'blocked',
      title: 'Não montamos dieta para menores de 18 anos',
      messages: ['Crianças e adolescentes ainda estão em crescimento: a alimentação precisa ser orientada por pediatra ou nutricionista, com curvas de crescimento próprias.'],
    };
  }
  if (input.pregnancy) {
    return {
      bmi, category, level: 'blocked',
      title: 'Gestação exige acompanhamento profissional',
      messages: ['Na gestação as necessidades mudam a cada trimestre. Siga as orientações do seu obstetra e de um nutricionista; não geramos cardápio nesse caso.'],
    };
  }
  if (bmi < 16) {
    return {
      bmi, category, level: 'blocked',
      title: `IMC ${String(bmi).replace('.', ',')}: magreza grave`,
      messages: [
        'Este nível de IMC pode indicar desnutrição e exige avaliação médica. Por segurança, não geramos cardápio nem metas de calorias.',
        'Procure um médico ou nutricionista o quanto antes. Se houver perda de peso sem explicação, cansaço extremo ou tontura, procure atendimento.',
      ],
    };
  }
  if (bmi >= 40) {
    return {
      bmi, category, level: 'blocked',
      title: `IMC ${String(bmi).replace('.', ',')}: obesidade grau III`,
      messages: [
        'Neste nível de IMC, mudanças na alimentação precisam de acompanhamento médico e nutricional, porque podem envolver outras condições de saúde e medicamentos.',
        'Por segurança, não geramos cardápio nem metas de calorias. Um endocrinologista e um nutricionista podem montar um plano seguro para você.',
      ],
    };
  }

  if (bmi < 18.5) {
    level = 'caution';
    title = `Atenção: IMC ${String(bmi).replace('.', ',')} (${category})`;
    messages.push(
      'Seu IMC está abaixo da faixa de referência. O cardápio abaixo não faz déficit calórico e é só um ponto de partida.',
      'Procure um nutricionista: abaixo do peso, é importante investigar a causa e acompanhar a evolução.',
    );
  } else if (bmi >= 30) {
    level = 'caution';
    title = `Atenção: IMC ${String(bmi).replace('.', ',')} (${category})`;
    messages.push(
      'Seu IMC está na faixa de obesidade. Este levantamento é apenas uma referência e não substitui acompanhamento médico e nutricional.',
      'A proteína foi calculada sobre um peso de referência (IMC 25), e não sobre o peso total, para não superestimar as necessidades.',
      'O IMC não diferencia músculo de gordura: se você tem muita massa muscular, um profissional pode avaliar sua composição corporal.',
    );
  } else if (bmi >= 25) {
    level = 'attention';
    title = `IMC ${String(bmi).replace('.', ',')} (${category})`;
    messages.push('Seu IMC está um pouco acima da faixa de referência. O IMC não diferencia músculo de gordura; use o cardápio como estimativa.');
  }

  if (input.heartCondition) {
    level = worst(level, 'attention');
    messages.push('Você informou uma condição cardíaca: confirme com seu médico, principalmente quanto a sal, gorduras e suplementos.');
  }
  if (input.medicationUse) {
    level = worst(level, 'attention');
    messages.push('Você usa medicamentos contínuos: alguns interagem com alimentos. Confirme o cardápio com seu médico ou nutricionista.');
  }
  if (input.age >= 65) {
    level = worst(level, 'attention');
    messages.push('Acima dos 65 anos as necessidades de proteína, cálcio e vitamina D mudam: vale uma avaliação com nutricionista.');
  }

  return { bmi, category, level, title, messages };
}

/* ── Restrições ─────────────────────────────────────────────────────────── */

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

/** Restrições em texto livre (do cadastro) → marcadores de alimento a evitar. */
export function excludedTags(restrictions: string[]): Set<FoodTag> {
  const tags = new Set<FoodTag>();
  for (const raw of restrictions) {
    const r = normalize(raw);
    if (/vegan/.test(r)) tags.add('animal');
    if (/vegetarian|sem carne|nao como carne/.test(r)) { tags.add('carne'); tags.add('peixe'); }
    if (/lactose|leite|laticinio/.test(r)) tags.add('lactose');
    if (/gluten|celiac|trigo/.test(r)) tags.add('gluten');
    if (/peixe|frutos do mar|camarao|pescado/.test(r)) tags.add('peixe');
    if (/porco|suino/.test(r)) tags.add('porco');
    if (/amendoim/.test(r)) tags.add('amendoim');
    if (/castanha|oleaginosa|nozes|amendoa/.test(r)) tags.add('castanha');
    if (/\bovos?\b/.test(r)) tags.add('ovo');
    if (/\bsoja\b/.test(r)) tags.add('soja');
  }
  if (tags.has('animal')) ['carne', 'peixe', 'porco', 'ovo', 'lactose'].forEach((tag) => tags.add(tag as FoodTag));
  return tags;
}

/* ── Estrutura do dia ───────────────────────────────────────────────────── */

type Role = 'carb' | 'carb2' | 'protein' | 'protein2' | 'legume' | 'vegRaw' | 'vegCooked' | 'fruit' | 'fat';

/** Segunda opção que absorve o que passar do teto da primeira (ex.: arroz + batata). */
const OVERFLOW: Partial<Record<Role, Role>> = { carb: 'carb2', protein: 'protein2' };
const BASE_ROLE: Partial<Record<Role, Role>> = { carb2: 'carb', protein2: 'protein' };

/** Fatia das calorias do dia em cada refeição, pelo número de refeições. */
const LAYOUTS: Record<number, [MealSlot, number][]> = {
  1: [['almoco', 1]],
  2: [['almoco', 0.55], ['jantar', 0.45]],
  3: [['cafe', 0.25], ['almoco', 0.4], ['jantar', 0.35]],
  4: [['cafe', 0.25], ['almoco', 0.35], ['lanche', 0.15], ['jantar', 0.25]],
  5: [['cafe', 0.2], ['lanche', 0.1], ['almoco', 0.3], ['lanche', 0.15], ['jantar', 0.25]],
  6: [['cafe', 0.2], ['lanche', 0.1], ['almoco', 0.25], ['lanche', 0.15], ['jantar', 0.2], ['ceia', 0.1]],
};

const SLOT_HOURS: Record<MealSlot, string> = { cafe: '7h', almoco: '12h', lanche: '16h', jantar: '19h30', ceia: '22h' };

const FRUITS = ['banana', 'mamao', 'morango', 'maca', 'abacaxi', 'manga', 'kiwi', 'laranja', 'pera', 'melao', 'goiaba', 'uva', 'melancia'];

/** Opções por papel, na ordem de preferência (o dia gira dentro de cada lista). */
const OPTIONS: Record<'cafe' | 'lanche' | 'main' | 'ceia', Partial<Record<Role, string[]>>> = {
  cafe: {
    carb: ['pao_frances', 'pao_integral', 'tapioca', 'cuscuz', 'aveia', 'wrap', 'batata_doce', 'inhame', 'biscoito_arroz'],
    protein: ['ovo_mexido', 'iogurte_grego', 'queijo_minas', 'ovo', 'cottage', 'whey', 'peito_peru', 'ricota', 'tofu', 'iogurte_soja', 'proteina_ervilha'],
    fruit: FRUITS,
    fat: ['pasta_amendoim', 'chia', 'abacate', 'linhaca', 'manteiga'],
  },
  lanche: {
    protein: ['iogurte_grego', 'whey', 'cottage', 'iogurte_natural', 'ovo', 'peito_peru', 'iogurte_soja', 'proteina_ervilha', 'edamame', 'hummus', 'leite_soja'],
    fruit: FRUITS,
    carb: ['aveia', 'granola', 'biscoito_arroz', 'pao_integral', 'tapioca', 'pipoca'],
    fat: ['castanha_para', 'amendoas', 'castanha_caju', 'nozes', 'amendoim', 'chia', 'semente_girassol', 'pasta_amendoim'],
  },
  main: {
    carb: ['arroz_branco', 'batata_doce', 'arroz_integral', 'macarrao', 'mandioca', 'batata', 'quinoa', 'macarrao_integral', 'inhame', 'cuscuz'],
    legume: ['feijao_carioca', 'feijao_preto', 'lentilha', 'grao_bico', 'ervilha'],
    protein: ['frango_peito', 'tilapia', 'patinho_moido', 'ovo', 'alcatra', 'salmao', 'frango_coxa', 'atum_agua', 'acem_moido', 'lombo_porco', 'sardinha', 'camarao', 'figado', 'tofu', 'pts', 'tempeh', 'seitan', 'edamame'],
    vegRaw: ['alface', 'tomate', 'rucula', 'pepino', 'cenoura', 'repolho', 'pimentao'],
    vegCooked: ['brocolis', 'abobrinha', 'couve_flor', 'vagem', 'chuchu', 'abobora', 'berinjela', 'espinafre', 'quiabo', 'beterraba', 'couve'],
    fat: ['azeite'],
  },
  ceia: {
    protein: ['iogurte_grego', 'cottage', 'leite_desnatado', 'leite_sem_lactose', 'queijo_minas', 'ovo', 'iogurte_soja', 'leite_soja'],
    fat: ['castanha_para', 'amendoas', 'nozes', 'chia'],
  },
};

const ROLE_LABELS: Record<Role, string> = {
  carb: 'Carboidrato', carb2: 'Carboidrato', protein: 'Proteína', protein2: 'Proteína', legume: 'Leguminosa', vegRaw: 'Salada', vegCooked: 'Legumes', fruit: 'Fruta', fat: 'Gordura boa',
};

/** Só os primeiros N de cada lista entram no rodízio diário; o resto vira troca. */
const ROTATION_SIZE = 6;

/** Proteína pesa mais no almoço e no jantar; lanches ficam mais leves. */
const PROTEIN_WEIGHT: Record<MealSlot, number> = { almoco: 1.3, jantar: 1.3, cafe: 0.8, lanche: 0.7, ceia: 0.7 };

/** Teto por alimento (g) para porções que ficariam estranhas (ex.: 200 g de queijo). */
const MAX_GRAMS: Record<string, number> = {
  queijo_minas: 90, mucarela: 40, ricota: 90, cottage: 120, requeijao_light: 30, peito_peru: 90,
  ovo: 200, ovo_mexido: 200, clara: 200, iogurte_natural: 340, iogurte_grego: 300, iogurte_soja: 340,
  whey: 60, proteina_ervilha: 60, leite_desnatado: 400, leite_integral: 300, leite_sem_lactose: 400, leite_soja: 400,
  pasta_amendoim: 30, amendoim: 30, manteiga: 10, chia: 20, linhaca: 20, semente_girassol: 20, abacate: 120,
  castanha_para: 12, castanha_caju: 30, amendoas: 30, nozes: 30, azeite: 12,
  mel: 20, granola: 45, aveia: 60, biscoito_arroz: 45, pipoca: 30, tapioca: 120,
  pao_frances: 100, pao_integral: 100, pao_sirio: 100, wrap: 80, cuscuz: 250, batata_doce: 350, inhame: 300,
  sardinha: 125, atum_agua: 150, edamame: 150, hummus: 90, tofu: 250,
};

/** Limites por porção (g), para nada sair absurdo quando a meta é alta ou baixa. */
const LIMITS: Record<Role, { min: number; max: number }> = {
  carb: { min: 20, max: 400 },
  carb2: { min: 20, max: 300 },
  protein: { min: 40, max: 260 },
  protein2: { min: 40, max: 200 },
  legume: { min: 40, max: 200 },
  vegRaw: { min: 40, max: 120 },
  vegCooked: { min: 60, max: 150 },
  fruit: { min: 60, max: 250 },
  fat: { min: 4, max: 30 },
};

/* ── Tipos de saída ─────────────────────────────────────────────────────── */

export interface Macros { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG: number }

export interface PlannedFood extends Macros {
  key: string;
  name: string;
  role: string;
  grams: number;
  /** "2 colheres de sopa cheias" — medida caseira aproximada. */
  measure: string;
  /** Trocas equivalentes no mesmo papel (mesma quantidade do macro principal). */
  alternatives: (Macros & { key: string; name: string; grams: number; measure: string })[];
}

export interface PlannedMeal {
  slot: MealSlot;
  title: string;
  time: string;
  target: Macros;
  items: PlannedFood[];
  totals: Macros;
}

export interface MealPlan {
  meals: PlannedMeal[];
  totals: Macros;
  notes: string[];
}

export interface MealPlanInput {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  mealsPerDay: number;
  restrictions: string[];
  /** Muda o cardápio de um dia para o outro (ex.: nº do dia no ano). */
  seed: number;
}

/* ── Contas ─────────────────────────────────────────────────────────────── */

const macrosOf = (food: Food, grams: number): Macros => ({
  kcal: (food.kcal * grams) / 100,
  proteinG: (food.proteinG * grams) / 100,
  carbG: (food.carbG * grams) / 100,
  fatG: (food.fatG * grams) / 100,
  fiberG: (food.fiberG * grams) / 100,
});

const sum = (list: Macros[]): Macros => list.reduce((acc, m) => ({
  kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG, carbG: acc.carbG + m.carbG,
  fatG: acc.fatG + m.fatG, fiberG: acc.fiberG + m.fiberG,
}), { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 });

const roundMacros = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbG: Math.round(m.carbG),
  fatG: Math.round(m.fatG), fiberG: Math.round(m.fiberG),
});

/** Carne, peixe ou tofu no almoço/jantar: menos que isso não faz um prato. */
const MAIN_PROTEIN_MIN = 80;

const maxGrams = (food: Food, role: Role) => Math.min(LIMITS[role].max, MAX_GRAMS[food.key] ?? Infinity);

/** Arredonda para algo que dá para medir em casa. */
function roundGrams(food: Food, grams: number, role: Role, main = false) {
  const max = maxGrams(food, role);
  const min = role === 'protein' && main && !food.wholeUnits ? Math.min(max, MAIN_PROTEIN_MIN) : LIMITS[role].min;
  const clamped = Math.min(max, Math.max(min, grams));
  if (food.wholeUnits) return Math.max(1, Math.round(clamped / food.unit.grams)) * food.unit.grams;
  // Unidade pequena (colher de chá, castanha, folha): gramas batem com a contagem exibida.
  if (food.unit.grams < 15) return Math.round(Math.max(1, Math.round(clamped / food.unit.grams)) * food.unit.grams);
  if (clamped < 30) return Math.max(food.unit.grams <= 5 ? food.unit.grams : 5, Math.round(clamped / 5) * 5);
  return Math.round(clamped / 10) * 10;
}

const fmtCount = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

export function measureOf(food: Food, grams: number) {
  // Unidades pequenas (amêndoa, uva, folha) contam inteiras; as maiores, de meia em meia.
  const units = food.wholeUnits || food.unit.grams < 15
    ? Math.max(1, Math.round(grams / food.unit.grams))
    : Math.max(0.5, Math.round((grams / food.unit.grams) * 2) / 2);
  return `${fmtCount(units)} ${units > 1 ? food.unit.plural : food.unit.label}`;
}

/** Macro que o papel "carrega" — usado para calcular a quantidade e as trocas. */
const MAIN_MACRO: Record<Role, keyof Macros> = {
  carb: 'carbG', carb2: 'carbG', protein: 'proteinG', protein2: 'proteinG', legume: 'carbG', vegRaw: 'kcal', vegCooked: 'kcal', fruit: 'carbG', fat: 'fatG',
};

/* ── Montagem ───────────────────────────────────────────────────────────── */

function slotTitle(slot: MealSlot, index: number, layout: [MealSlot, number][]) {
  if (slot !== 'lanche') return { cafe: 'Café da manhã', almoco: 'Almoço', jantar: 'Jantar', ceia: 'Ceia', lanche: 'Lanche' }[slot];
  const lunchIndex = layout.findIndex(([s]) => s === 'almoco');
  return lunchIndex >= 0 && index < lunchIndex ? 'Lanche da manhã' : 'Lanche da tarde';
}

const isMain = (slot: MealSlot) => slot === 'almoco' || slot === 'jantar';
const optionsFor = (slot: MealSlot) => (isMain(slot) ? OPTIONS.main : OPTIONS[slot]);
const optionKeys = (slot: MealSlot, role: Role) => optionsFor(slot)[BASE_ROLE[role] ?? role];

function allowed(keys: string[] | undefined, excluded: Set<FoodTag>, slot: MealSlot): Food[] {
  return (keys ?? [])
    .map((key) => FOOD_BY_KEY.get(key))
    .filter((food): food is Food => Boolean(food) && food!.meals.includes(slot) && !food!.tags.some((tag) => excluded.has(tag)));
}

/** Gramas do alimento `to` que entregam o mesmo macro principal que `grams` de `from`. */
function equivalentGrams(from: Food, grams: number, to: Food, role: Role, main: boolean) {
  const macro = MAIN_MACRO[role];
  const per = (food: Food) => (macro === 'kcal' ? food.kcal : macro === 'proteinG' ? food.proteinG : macro === 'carbG' ? food.carbG : food.fatG);
  if (per(to) <= 0) return grams;
  return roundGrams(to, (grams * per(from)) / per(to), role, main);
}

/**
 * Quantidades de uma refeição. Verduras, fruta e leguminosa entram em porção
 * fixa; carboidrato, proteína e gordura fecham as metas, cada um descontando o
 * que os demais já trazem (3 passadas bastam para estabilizar).
 */
function solveMeal(chosen: Partial<Record<Role, Food>>, target: Macros, main: boolean) {
  const grams: Partial<Record<Role, number>> = {};
  const fixed: Role[] = ['vegRaw', 'vegCooked', 'fruit', 'legume'];
  for (const role of fixed) {
    const food = chosen[role];
    if (!food) continue;
    // Refeição com muito carboidrato ganha a segunda concha de feijão antes de virar uma montanha de arroz.
    const base = role === 'vegRaw' ? 60 : role === 'vegCooked' ? 80
      : role === 'legume' ? (target.carbG > 100 ? 172 : 86)
      : food.wholeUnits ? food.unit.grams : 120;
    grams[role] = base;
  }
  const others = (except: Role) => sum((Object.keys(chosen) as Role[])
    .filter((role) => role !== except && grams[role])
    .map((role) => macrosOf(chosen[role]!, grams[role]!)));

  for (let pass = 0; pass < 3; pass += 1) {
    const solve = (role: Role, macro: 'carbG' | 'proteinG' | 'fatG') => {
      const food = chosen[role];
      if (!food || food[macro] <= 0) return;
      const extraRole = OVERFLOW[role];
      const extra = extraRole ? chosen[extraRole] : undefined;
      // A segunda opção sai da conta e é recalculada só com o que sobrar do teto.
      if (extraRole) grams[extraRole] = 0;
      const missing = target[macro] - others(role)[macro];
      const wanted = Math.max(0, (missing / food[macro]) * 100);
      grams[role] = extra ? Math.min(wanted, maxGrams(food, role)) : wanted;
      if (extra && extraRole && extra[macro] > 0) {
        const left = target[macro] - others(extraRole)[macro];
        grams[extraRole] = Math.max(0, (left / extra[macro]) * 100);
      }
    };
    solve('carb', 'carbG');
    solve('protein', 'proteinG');
    solve('fat', 'fatG');
  }

  const rounded: Partial<Record<Role, number>> = {};
  for (const role of Object.keys(chosen) as Role[]) {
    const food = chosen[role]!;
    const value = grams[role] ?? 0;
    // Gordura que já veio de sobra nos outros alimentos: o azeite sai do prato.
    if (role === 'fat' && value < LIMITS.fat.min / 2) continue;
    // Carboidrato quase coberto pela fruta e leguminosa: sem porção extra.
    if (role === 'carb' && value < 10) continue;
    // Segunda opção só entra quando a primeira estourou o teto de verdade.
    if (BASE_ROLE[role] && value < LIMITS[role].min) continue;
    rounded[role] = roundGrams(food, value, role, main);
  }
  return rounded;
}

/** Itens prontos de uma refeição (quantidades, medidas e trocas). */
function mealItems(slot: MealSlot, chosen: Partial<Record<Role, Food>>, grams: Partial<Record<Role, number>>, excluded: Set<FoodTag>) {
  const inMeal = new Set(Object.values(chosen).map((food) => food!.key));
  const items: PlannedFood[] = (Object.keys(grams) as Role[]).map((role) => {
    const food = chosen[role]!;
    const g = grams[role]!;
    const alternatives = allowed(optionKeys(slot, role), excluded, slot)
      .filter((other) => !inMeal.has(other.key))
      .slice(0, 4)
      .map((other) => {
        const og = equivalentGrams(food, g, other, role, isMain(slot));
        return { key: other.key, name: other.name, grams: og, measure: measureOf(other, og), ...roundMacros(macrosOf(other, og)) };
      });
    return {
      key: food.key, name: food.name, role: ROLE_LABELS[role], grams: g, measure: measureOf(food, g),
      ...roundMacros(macrosOf(food, g)), alternatives,
    };
  });
  const order: string[] = Object.values(ROLE_LABELS);
  return items.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

export function buildMealPlan(input: MealPlanInput): MealPlan {
  const meals = Math.min(6, Math.max(1, Math.round(input.mealsPerDay)));
  const layout = LAYOUTS[meals];
  const excluded = excludedTags(input.restrictions);
  const notes: string[] = [];
  if (input.mealsPerDay > 6) notes.push(`Você informou ${input.mealsPerDay} refeições; o cardápio foi organizado em 6 para ficar prático.`);
  if (excluded.size) notes.push('Restrições respeitadas: alimentos com elas ficaram de fora do cardápio e das trocas.');

  const proteinWeights = layout.map(([slot, share]) => share * PROTEIN_WEIGHT[slot]);
  const proteinTotal = proteinWeights.reduce((a, b) => a + b, 0);

  // 1) Escolhe os alimentos de cada refeição e resolve as quantidades.
  const used = new Set<string>();
  const shells = layout.map(([slot, share], index) => {
    const target: Macros = {
      kcal: input.kcal * share, proteinG: (input.proteinG * proteinWeights[index]) / proteinTotal,
      carbG: input.carbG * share, fatG: input.fatG * share, fiberG: 0,
    };
    const chosen: Partial<Record<Role, Food>> = {};
    (Object.keys(optionsFor(slot)) as Role[]).forEach((role, roleIndex) => {
      const list = allowed(optionKeys(slot, role), excluded, slot).slice(0, ROTATION_SIZE);
      if (!list.length) return;
      // Gira pelo dia e pela posição da refeição; evita repetir o mesmo alimento no dia.
      const start = (input.seed * 7 + index * 3 + roleIndex) % list.length;
      const rotated = [...list.slice(start), ...list.slice(0, start)];
      chosen[role] = rotated.find((food) => !used.has(food.key)) ?? rotated[0];
      used.add(chosen[role]!.key);
      // Reserva, nas refeições principais, quem completa se a primeira opção atingir o teto.
      const extraRole = OVERFLOW[role];
      const extra = isMain(slot) && extraRole ? rotated.find((food) => food.key !== chosen[role]!.key && !food.wholeUnits) : undefined;
      if (extra && extraRole) chosen[extraRole] = extra;
    });
    return { slot, share, index, target, chosen, grams: solveMeal(chosen, target, isMain(slot)) };
  });

  // 2) O que os tetos de porção deixaram de fora volta para almoço e jantar.
  const first = sum(shells.flatMap((shell) => (Object.keys(shell.grams) as Role[]).map((role) => macrosOf(shell.chosen[role]!, shell.grams[role]!))));
  const mains = shells.filter((shell) => shell.slot === 'almoco' || shell.slot === 'jantar');
  const receivers = mains.length ? mains : shells;
  const receiverShare = receivers.reduce((total, shell) => total + shell.share, 0);
  for (const shell of receivers) {
    const part = shell.share / receiverShare;
    shell.target = {
      ...shell.target,
      proteinG: Math.max(0, shell.target.proteinG + (input.proteinG - first.proteinG) * part),
      carbG: Math.max(0, shell.target.carbG + (input.carbG - first.carbG) * part),
      fatG: Math.max(0, shell.target.fatG + (input.fatG - first.fatG) * part),
    };
    shell.grams = solveMeal(shell.chosen, shell.target, isMain(shell.slot));
  }

  const planned: PlannedMeal[] = shells.map((shell) => {
    const items = mealItems(shell.slot, shell.chosen, shell.grams, excluded);
    const target = { ...shell.target, kcal: shell.target.proteinG * 4 + shell.target.carbG * 4 + shell.target.fatG * 9 };
    return {
      slot: shell.slot,
      title: slotTitle(shell.slot, shell.index, layout),
      time: shell.slot === 'lanche' && slotTitle(shell.slot, shell.index, layout) === 'Lanche da manhã' ? '10h' : SLOT_HOURS[shell.slot],
      target: roundMacros(target),
      items,
      totals: roundMacros(sum(items)),
    };
  });

  const totals = roundMacros(sum(planned.map((meal) => meal.totals)));
  const gap = totals.kcal - input.kcal;
  if (Math.abs(gap) > input.kcal * 0.08) {
    notes.push(`As porções arredondadas somam ${totals.kcal} kcal (${gap > 0 ? '+' : ''}${gap} da meta). Ajuste as quantidades de carboidrato para chegar mais perto.`);
  }
  return { meals: planned, totals, notes };
}
