/**
 * Biblioteca local de exercícios.
 *
 * É o insumo do motor de REGRAS (não da IA): cada exercício declara equipamento
 * necessário e contraindicações, e o filtro de segurança usa isso para nunca
 * prescrever algo impróprio para o perfil. Base enxuta e revisável — ampliar
 * aqui é mais seguro do que pedir ao modelo que invente exercícios.
 */

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

export const EXERCISES: Exercise[] = [
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

export const byKey = (key: string) => EXERCISES.find((e) => e.key === key);