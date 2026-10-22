/**
 * Biblioteca local de exercícios.
 *
 * É o insumo do motor de REGRAS (não da IA): cada exercício declara equipamento
 * necessário e contraindicações, e o filtro de segurança usa isso para nunca
 * prescrever algo impróprio para o perfil. O catálogo versionado em
 * `exercise-catalog.json` é mesclado aos exercícios legados, com equipamento e
 * contraindicações normalizados para este motor.
 */

import catalog from './exercise-catalog.json';

/**
 * Registro do catálogo. Os 60 primeiros usam os mapas por id abaixo; os
 * adicionados depois trazem `chave`, `lesoes` e `impacto` no próprio registro,
 * para não espalhar cada exercício novo por três tabelas.
 */
interface SourceExercise {
  id: number;
  nome: string;
  grupo_principal: string;
  grupos_secundarios: string[];
  equipamento: string[];
  nivel: string;
  mecanica: string;
  unilateral: boolean;
  series_sugeridas: number;
  reps_min: number;
  reps_max: number;
  unidade: string;
  descanso_s: number;
  fator_peso_corporal: number | null;
  instrucao: string;
  progressao: string;
  regressao: string;
  chave?: string;
  lesoes?: string[];
  impacto?: string;
}

const sourceExercises = catalog as SourceExercise[];

export type Equipment = 'academia' | 'peso-corporal' | 'elastico' | 'barra-fixa' | 'halteres' | 'nenhum';
export type MuscleGroup = 'peito' | 'costas' | 'pernas' | 'ombros' | 'bracos' | 'core' | 'cardio' | 'mobilidade';
export type Injury = 'joelho' | 'lombar' | 'ombro' | 'cotovelo' | 'quadril' | 'pescoco';
export type Goal = 'HYPERTROPHY' | 'STRENGTH' | 'WEIGHT_LOSS' | 'CONDITIONING' | 'HEALTH';

export interface Exercise {
  key: string;
  name: string;
  group: MuscleGroup;
  /** Qualquer um destes equipamentos serve; "nenhum" = corpo livre. */
  equipment: Equipment[];
  /** Lesão que torna o exercício contraindicado. */
  contraindicated: Injury[];
  /** 'alto' marca exercícios com impacto articular alto. */
  impact: 'baixo' | 'medio' | 'alto';
  difficulty: 1 | 2 | 3;
  xp: number;
  minutes: number;
  /** Músculos trabalhados, em português — exibido no detalhe. */
  muscles?: string;
  /** Execução passo a passo. */
  howTo?: string;
  /** Erro mais comum e como evitá-lo. */
  commonMistake?: string;
  /** Contexto de por que este exercício faz sentido no objetivo escolhido. */
  benefits?: string;
  /** Segundos de trabalho e descanso sugeridos (usados pelo cronômetro). */
  workSeconds?: number;
  restSeconds?: number;
  sourceId?: number;
  sourceMuscles?: string[];
  progression?: string;
  regression?: string;
  suggestedSets?: number;
  repsMin?: number;
  repsMax?: number;
  unit?: 'reps' | 'segundos' | 'minutos';
  /** Fração do peso corporal deslocada (calistenia), usada para mostrar a carga real. */
  bodyweightFactor?: number;
  /** Feito um lado por vez: as repetições valem para cada lado. */
  unilateral?: boolean;
}

export const INJURY_LABELS: Record<Injury, string> = {
  joelho: 'joelho', lombar: 'lombar', ombro: 'ombro',
  cotovelo: 'cotovelo', quadril: 'quadril', pescoco: 'pescoço',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  academia: 'Academia completa',
  'peso-corporal': 'Calistenia (peso corporal)',
  elastico: 'Elásticos',
  'barra-fixa': 'Barra fixa em casa',
  halteres: 'Halteres',
  nenhum: 'Nada (só o corpo)',
};

export const GOAL_LABELS: Record<Goal, string> = {
  HYPERTROPHY: 'Hipertrofia', STRENGTH: 'Força', WEIGHT_LOSS: 'Emagrecimento',
  CONDITIONING: 'Condicionamento', HEALTH: 'Saúde',
};

/**
 * Objetivos com o efeito EXPLÍCITO de cada um.
 *
 * O cadastro mostra este texto: o usuário escolhe sabendo exatamente o que vai
 * mudar no plano, em vez de escolher um rótulo ambíguo. A lista `focus` é a
 * mesma consumida pelo motor em `GROUPS_BY_GOAL` — fonte única de verdade.
 */
export const GOALS: { key: Goal; label: string; summary: string; focus: string[] }[] = [
  {
    key: 'HYPERTROPHY',
    label: 'Ganhar massa muscular',
    summary: 'Mais força e músculo, com progressão de carga.',
    focus: ['pernas', 'peito', 'costas', 'ombros', 'bracos'],
  },
  {
    key: 'STRENGTH',
    label: 'Ganhar força',
    summary: 'Prioriza movimentos compostos, cargas progressivas e intervalos maiores.',
    focus: ['pernas', 'peito', 'costas', 'ombros', 'bracos'],
  },
  {
    key: 'WEIGHT_LOSS',
    label: 'Emagrecer',
    summary: 'Mais gasto calórico e cardiovascular, preservando músculo.',
    focus: ['cardio', 'pernas', 'core', 'mobilidade'],
  },
  {
    key: 'CONDITIONING',
    label: 'Melhorar condicionamento',
    summary: 'Resistência cardiovascular e muscular, com menos volume por grupo.',
    focus: ['cardio', 'core', 'pernas', 'mobilidade'],
  },
  {
    key: 'HEALTH',
    label: 'Saúde e mobilidade',
    summary: 'Treino leve focado em mobilidade e postura. Bom para começar ou voltar.',
    focus: ['mobilidade', 'core', 'cardio'],
  },
];

const LEGACY_EXERCISES: Exercise[] = [
  { key: 'flexao', name: 'Flexão', group: 'peito', equipment: ['peso-corporal', 'nenhum'], contraindicated: ['ombro', 'cotovelo'], impact: 'baixo', difficulty: 1, xp: 10, minutes: 5 },
  { key: 'flexao_diamante', name: 'Flexão diamante', group: 'peito', equipment: ['peso-corporal', 'nenhum'], contraindicated: ['ombro', 'cotovelo'], impact: 'baixo', difficulty: 2, xp: 14, minutes: 5 },
  { key: 'flexao_declaracao', name: 'Flexão declinada', group: 'peito', equipment: ['academia', 'halteres'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 12, minutes: 6 },
  { key: 'supino_retrato', name: 'Supino reto com halteres', group: 'peito', equipment: ['halteres', 'academia'], contraindicated: ['ombro'], impact: 'baixo', difficulty: 2, xp: 16, minutes: 8 },
  { key: 'supino_inclinado', name: 'Supino inclinado', group: 'peito', equipment: ['academia'], contraindicated: ['ombro'], impact: 'baixo', difficulty: 3, xp: 20, minutes: 9 },

  { key: 'barra_fixa', name: 'Barra fixa', group: 'costas', equipment: ['barra-fixa', 'academia'], contraindicated: ['ombro'], impact: 'baixo', difficulty: 3, xp: 22, minutes: 8 },
  { key: 'puxada_horizontal', name: 'Puxada horizontal', group: 'costas', equipment: ['elastico', 'academia'], contraindicated: [], impact: 'baixo', difficulty: 2, xp: 15, minutes: 7 },
  { key: 'remada_baixa', name: 'Remada baixa', group: 'costas', equipment: ['halteres', 'academia'], contraindicated: ['lombar'], impact: 'baixo', difficulty: 2, xp: 15, minutes: 7 },
  { key: 'superman', name: 'Superman', group: 'costas', equipment: ['peso-corporal', 'nenhum'], contraindicated: ['lombar'], impact: 'baixo', difficulty: 1, xp: 9, minutes: 4 },
  { key: 'prone_y_raise', name: 'Elevação Y prone', group: 'costas', equipment: ['peso-corporal', 'nenhum'], contraindicated: ['ombro', 'lombar'], impact: 'baixo', difficulty: 2, xp: 13, minutes: 5 },
{ key: 'agachamento_livre', name: 'Agachamento livre', group: 'pernas', equipment: ['peso-corporal', 'nenhum'], contraindicated: ['joelho', 'lombar'], impact: 'medio', difficulty: 1, xp: 12, minutes: 7 },
  { key: 'agachamento_sumido', name: 'Agachamento sumido', group: 'pernas', equipment: ['peso-corporal'], contraindicated: ['joelho', 'lombar'], impact: 'alto', difficulty: 2, xp: 18, minutes: 7 },
  { key: 'agachamento_caixa', name: 'Agachamento na caixa', group: 'pernas', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 10, minutes: 6 },
  { key: 'agachamento_bulgario', name: 'Agachamento búlgaro', group: 'pernas', equipment: ['halteres'], contraindicated: ['joelho'], impact: 'medio', difficulty: 3, xp: 20, minutes: 8 },
  { key: 'afundo_estatico', name: 'Afundo estático', group: 'pernas', equipment: ['nenhum'], contraindicated: ['joelho'], impact: 'baixo', difficulty: 2, xp: 13, minutes: 6 },
  { key: 'ponte_gluteo', name: 'Ponte de glúteo', group: 'pernas', equipment: ['nenhum', 'peso-corporal'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 9, minutes: 5 },
  { key: 'elevacao_calf', name: 'Elevação de panturrilha', group: 'pernas', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 8, minutes: 4 },

  { key: 'desenvolvimento_militar', name: 'Desenvolvimento militar', group: 'ombros', equipment: ['halteres', 'academia'], contraindicated: ['ombro', 'pescoco'], impact: 'baixo', difficulty: 2, xp: 15, minutes: 6 },
  { key: 'elevacao_lateral', name: 'Elevação lateral', group: 'ombros', equipment: ['halteres', 'elastico'], contraindicated: [], impact: 'baixo', difficulty: 2, xp: 13, minutes: 5 },
  { key: 'face_pull', name: 'Face pull', group: 'ombros', equipment: ['elastico', 'academia'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 12, minutes: 5 },

  { key: 'triceps_cabo', name: 'Tríceps no cabo', group: 'bracos', equipment: ['elastico', 'academia'], contraindicated: ['cotovelo'], impact: 'baixo', difficulty: 2, xp: 12, minutes: 5 },
  { key: 'triceps_bench', name: 'Tríceps na bench', group: 'bracos', equipment: ['peso-corporal'], contraindicated: ['ombro', 'cotovelo'], impact: 'baixo', difficulty: 2, xp: 13, minutes: 5 },
  { key: 'curl_mao', name: 'Curl de mão', group: 'bracos', equipment: ['nenhum', 'halteres'], contraindicated: ['cotovelo'], impact: 'baixo', difficulty: 1, xp: 10, minutes: 5 },
  { key: 'rosca_direta', name: 'Rosca direta', group: 'bracos', equipment: ['academia', 'halteres', 'elastico'], contraindicated: ['cotovelo'], impact: 'baixo', difficulty: 1, xp: 12, minutes: 5 },
  { key: 'rosca_martelo', name: 'Rosca martelo', group: 'bracos', equipment: ['academia', 'halteres'], contraindicated: ['cotovelo'], impact: 'baixo', difficulty: 2, xp: 14, minutes: 5 },
  { key: 'extensao_triceps', name: 'Extensão de tríceps', group: 'bracos', equipment: ['academia', 'halteres', 'elastico'], contraindicated: ['cotovelo', 'ombro'], impact: 'baixo', difficulty: 1, xp: 12, minutes: 5 },
  { key: 'stiff_romeno', name: 'Levantamento terra romeno', group: 'pernas', equipment: ['academia', 'halteres'], contraindicated: ['lombar', 'quadril'], impact: 'baixo', difficulty: 2, xp: 16, minutes: 7 },
  { key: 'mesa_flexora', name: 'Flexão de joelhos na máquina', group: 'pernas', equipment: ['academia'], contraindicated: ['joelho'], impact: 'baixo', difficulty: 1, xp: 12, minutes: 6 },

  { key: 'prancha', name: 'Prancha', group: 'core', equipment: ['nenhum'], contraindicated: ['ombro'], impact: 'baixo', difficulty: 1, xp: 11, minutes: 4 },
  { key: 'hollow_hold', name: 'Hollow hold', group: 'core', equipment: ['nenhum'], contraindicated: ['lombar'], impact: 'baixo', difficulty: 2, xp: 14, minutes: 4 },
  { key: 'dead_bug', name: 'Dead bug', group: 'core', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 10, minutes: 5 },
  { key: 'leg_raise', name: 'Elevação de pernas', group: 'core', equipment: ['nenhum'], contraindicated: ['lombar'], impact: 'baixo', difficulty: 2, xp: 13, minutes: 4 },

  { key: 'caminhada', name: 'Caminhada rápida', group: 'cardio', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 9, minutes: 20 },
  { key: 'corrida_esteira', name: 'Corrida leve', group: 'cardio', equipment: ['academia'], contraindicated: ['joelho', 'quadril'], impact: 'medio', difficulty: 2, xp: 15, minutes: 20 },
  { key: 'pulo_corda', name: 'Pulo de corda', group: 'cardio', equipment: ['elastico', 'nenhum'], contraindicated: ['joelho', 'quadril'], impact: 'alto', difficulty: 2, xp: 16, minutes: 10 },
  { key: 'mountain_climber', name: 'Mountain climber', group: 'cardio', equipment: ['nenhum'], contraindicated: ['lombar', 'quadril'], impact: 'medio', difficulty: 2, xp: 15, minutes: 6 },
  { key: 'burpee', name: 'Burpee', group: 'cardio', equipment: ['nenhum'], contraindicated: ['joelho', 'lombar', 'quadril'], impact: 'alto', difficulty: 3, xp: 20, minutes: 8 },
  { key: 'bike_estatica', name: 'Bicicleta estática', group: 'cardio', equipment: ['academia'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 11, minutes: 15 },

  { key: 'gato_camelo', name: 'Gato-camelo', group: 'mobilidade', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 7, minutes: 4 },
  { key: 'bird_dog', name: 'Bird dog', group: 'mobilidade', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 8, minutes: 4 },
  { key: 'stretch_hamstring', name: 'Alongamento posterior', group: 'mobilidade', equipment: ['nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 7, minutes: 5 },
  { key: 'rotacao_externa_elastico', name: 'Rotação externa com elástico', group: 'mobilidade', equipment: ['elastico'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 9, minutes: 5 },
  { key: 'elevacao_ombro_elastico', name: 'Elevação de ombro com elástico', group: 'mobilidade', equipment: ['elastico', 'nenhum'], contraindicated: [], impact: 'baixo', difficulty: 1, xp: 8, minutes: 4 },
];

const SOURCE_KEYS: Record<number, string> = {
  1: 'flexao',
  2: 'flexao_inclinada',
  3: 'flexao_declaracao',
  4: 'supino_reto_barra',
  5: 'supino_inclinado',
  6: 'crucifixo_peck_deck',
  7: 'crossover_polia',
  8: 'barra_fixa',
  9: 'remada_invertida',
  10: 'superman',
  11: 'remada_elastico',
  12: 'prone_y_raise',
  13: 'puxada_frontal',
  14: 'remada_curvada_barra',
  15: 'remada_baixa',
  16: 'remada_unilateral',
  17: 'flexao_pike',
  18: 'parada_mao_parede',
  19: 'desenvolvimento_militar',
  20: 'elevacao_lateral',
  21: 'face_pull',
  22: 'rosca_direta',
  23: 'rosca_martelo',
  24: 'chin_up',
  25: 'rosca_elastico',
  26: 'triceps_bench',
  27: 'flexao_diamante',
  28: 'triceps_cabo',
  29: 'triceps_testa_barra_w',
  30: 'triceps_frances_halter',
  31: 'agachamento_livre',
  32: 'agachamento_sumido',
  33: 'agachamento_bulgario',
  34: 'afundo_estatico',
  35: 'agachamento_salto',
  36: 'agachamento_parede',
  37: 'leg_press_45',
  38: 'cadeira_extensora',
  39: 'agachamento_goblet',
  40: 'ponte_gluteo',
  41: 'ponte_gluteo_unilateral',
  42: 'good_morning',
  43: 'coice_gluteo_elastico',
  44: 'stiff_romeno',
  45: 'mesa_flexora',
  46: 'hip_thrust_barra',
  47: 'elevacao_calf',
  48: 'panturrilha_unilateral_degrau',
  49: 'panturrilha_sentado_maquina',
  50: 'prancha',
  51: 'prancha_lateral',
  52: 'abdominal_crunch',
  53: 'leg_raise',
  54: 'mountain_climber',
  55: 'bicicleta_ar',
  56: 'dead_bug',
  57: 'crunch_polia',
  58: 'burpee',
  59: 'polichinelo',
  60: 'caminhada_inclinada_esteira',
};

const SOURCE_GROUPS: Record<string, MuscleGroup> = {
  peito: 'peito',
  costas: 'costas',
  ombros: 'ombros',
  biceps: 'bracos',
  triceps: 'bracos',
  quadriceps: 'pernas',
  posterior: 'pernas',
  panturrilha: 'pernas',
  abdomen: 'core',
  corpo_inteiro: 'cardio',
};

const SOURCE_EQUIPMENT: Record<string, Equipment> = {
  nenhum: 'nenhum',
  halteres: 'halteres',
  elastico: 'elastico',
  barra_fixa: 'barra-fixa',
  barra: 'academia',
  barra_w: 'academia',
  banco_supino: 'academia',
  maquina: 'academia',
  polia: 'academia',
  esteira: 'academia',
  banco_ou_cadeira: 'peso-corporal',
  barra_baixa_ou_mesa: 'peso-corporal',
  degrau: 'peso-corporal',
  parede: 'peso-corporal',
  paralelas: 'peso-corporal',
};

const SOURCE_INJURIES: Partial<Record<number, Injury[]>> = {
  1: ['ombro', 'cotovelo'],
  2: ['ombro', 'cotovelo'],
  3: ['ombro', 'cotovelo'],
  4: ['ombro'],
  5: ['ombro'],
  6: ['ombro'],
  7: ['ombro'],
  8: ['ombro'],
  17: ['ombro', 'cotovelo'],
  18: ['ombro', 'pescoco'],
  19: ['ombro', 'pescoco'],
  20: ['ombro'],
  26: ['ombro', 'cotovelo'],
  27: ['ombro', 'cotovelo'],
  29: ['cotovelo'],
  30: ['cotovelo'],
  31: ['joelho', 'lombar'],
  32: ['joelho', 'lombar'],
  33: ['joelho'],
  34: ['joelho'],
  35: ['joelho', 'quadril'],
  36: ['joelho'],
  37: ['joelho'],
  38: ['joelho'],
  39: ['joelho', 'lombar'],
  42: ['lombar', 'quadril'],
  44: ['lombar', 'quadril'],
  46: ['lombar', 'quadril'],
  50: ['ombro'],
  51: ['ombro'],
  53: ['lombar'],
  54: ['ombro', 'quadril'],
  58: ['joelho', 'lombar', 'quadril'],
  59: ['joelho', 'quadril'],
};

const SOURCE_MUSCLE_LABELS: Record<string, string> = {
  peito: 'peitoral',
  costas: 'costas',
  ombros: 'ombros',
  biceps: 'bíceps',
  triceps: 'tríceps',
  antebraco: 'antebraços',
  quadriceps: 'quadríceps',
  posterior: 'posterior da coxa',
  gluteo: 'glúteos',
  adutores: 'adutores',
  panturrilha: 'panturrilhas',
  abdomen: 'abdômen',
  obliquos: 'oblíquos',
  flexores_quadril: 'flexores do quadril',
  lombar: 'lombar',
  trapezio: 'trapézio',
};

function sourceDurationSeconds(unit: string, min: number, max: number) {
  const average = (min + max) / 2;
  if (unit === 'segundos') return Math.round(average);
  if (unit === 'minutos') return Math.round(average * 60);
  return Math.max(30, Math.round(average * 3));
}

function isExerciseUnit(unit: string): unit is NonNullable<Exercise['unit']> {
  return unit === 'reps' || unit === 'segundos' || unit === 'minutos';
}

const INJURIES = new Set<string>(Object.keys(INJURY_LABELS));

function sourceInjuries(source: SourceExercise): Injury[] {
  if (!source.lesoes) return SOURCE_INJURIES[source.id] ?? [];
  const unknown = source.lesoes.filter((injury) => !INJURIES.has(injury));
  if (unknown.length) throw new Error(`Lesão não mapeada no exercício ${source.id}: ${unknown.join(', ')}.`);
  return source.lesoes as Injury[];
}

function fromSource(source: SourceExercise): Exercise {
  const key = source.chave ?? SOURCE_KEYS[source.id];
  const mainGroup = SOURCE_GROUPS[source.grupo_principal];
  if (!isExerciseUnit(source.unidade)) {
    throw new Error(`Unidade não mapeada no exercício ${source.id}: ${source.unidade}.`);
  }
  const unit = source.unidade;
  const difficulty = source.nivel === 'avancado' ? 3 : source.nivel === 'intermediario' ? 2 : source.nivel === 'iniciante' ? 1 : null;
  if (!key) throw new Error(`Exercício de catálogo sem chave mapeada: ${source.id}.`);
  if (!mainGroup) throw new Error(`Grupo muscular não mapeado no exercício ${source.id}: ${source.grupo_principal}.`);
  if (difficulty === null) throw new Error(`Nível não mapeado no exercício ${source.id}: ${source.nivel}.`);
  const equipment = source.equipamento.map((item) => {
    const mapped = SOURCE_EQUIPMENT[item];
    if (!mapped) throw new Error(`Equipamento não mapeado no exercício ${source.id}: ${item}.`);
    return mapped;
  });
  const sourceMuscles = [source.grupo_principal, ...source.grupos_secundarios];
  const muscles = sourceMuscles
    .map((muscle) => SOURCE_MUSCLE_LABELS[muscle] ?? muscle.replaceAll('_', ' '))
    .join(', ');
  const impact: Exercise['impact'] = source.impacto === 'alto' || [35, 58, 59].includes(source.id) ? 'alto' : 'baixo';
  const workSeconds = sourceDurationSeconds(unit, source.reps_min, source.reps_max);
  const name = source.nome;

  return {
    key,
    name,
    group: mainGroup,
    equipment: Array.from(new Set(equipment)),
    contraindicated: sourceInjuries(source),
    impact,
    difficulty,
    xp: source.mecanica === 'composto' ? 15 : 10,
    minutes: unit === 'minutos' ? Math.round((source.reps_min + source.reps_max) / 2) : 5,
    muscles: `Músculos principais: ${muscles}.`,
    howTo: source.instrucao,
    commonMistake: 'Evite compensar com impulso ou perder o alinhamento. Execute com controle e interrompa se sentir dor.',
    benefits: `Trabalha ${muscles.toLowerCase()} e complementa o treino de ${SOURCE_MUSCLE_LABELS[source.grupo_principal] ?? source.grupo_principal}.`,
    workSeconds,
    restSeconds: source.descanso_s,
    sourceId: source.id,
    sourceMuscles,
    progression: source.progressao,
    regression: source.regressao,
    suggestedSets: source.series_sugeridas,
    repsMin: source.reps_min,
    repsMax: source.reps_max,
    unit,
    bodyweightFactor: source.fator_peso_corporal ?? undefined,
    unilateral: source.unilateral,
  };
}

const CATALOG_EXERCISES = sourceExercises.map(fromSource);
const catalogKeys = new Set(CATALOG_EXERCISES.map((exercise) => exercise.key));

export const EXERCISES: Exercise[] = [
  ...CATALOG_EXERCISES,
  ...LEGACY_EXERCISES.filter((exercise) => !catalogKeys.has(exercise.key)),
];

export const byKey = (key: string) => EXERCISES.find((e) => e.key === key);