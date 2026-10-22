/**
 * Prescrição completa de uma série: carga, repetições e tempo.
 *
 * Quem nunca fez o exercício não sabe que carga pôr — antes o app pedia para
 * "escolher uma carga em que sobrem 2–3 repetições". Agora a carga inicial é
 * ESTIMADA pelo peso corporal e por uma razão de referência por exercício,
 * ajustada por sexo, experiência, idade e objetivo, e arredondada para o que
 * existe de verdade (halteres de 1 ou 2 kg, anilhas de 2,5 kg, placas de 5 kg).
 * Depois da primeira sessão, quem manda é a progressão dupla de `progression.ts`.
 *
 * É uma estimativa conservadora, não um teste de carga: a nota explica como
 * ajustar se ficar leve ou pesado demais.
 */
import type { Exercise } from './exercises';
import type { Suggestion } from './progression';

/** Como a carga é medida — muda o arredondamento e o texto exibido. */
export type LoadKind = 'halter' | 'barra' | 'maquina' | 'polia' | 'mochila';

/**
 * Carga de trabalho típica (8–12 reps, sobrando 2) de um homem treinado, em
 * fração do peso corporal. Halteres: por halter. Polia unilateral: por lado.
 */
const LOAD_RATIO: Record<string, { ratio: number; kind: LoadKind }> = {
  // Peito
  supino_reto_barra: { ratio: 0.65, kind: 'barra' },
  supino_inclinado: { ratio: 0.2, kind: 'halter' },
  supino_retrato: { ratio: 0.22, kind: 'halter' },
  supino_declinado: { ratio: 0.22, kind: 'halter' },
  crucifixo_halteres: { ratio: 0.1, kind: 'halter' },
  crucifixo_peck_deck: { ratio: 0.35, kind: 'maquina' },
  crossover_polia: { ratio: 0.12, kind: 'polia' },
  // Costas
  puxada_frontal: { ratio: 0.55, kind: 'polia' },
  puxada_supinada: { ratio: 0.55, kind: 'polia' },
  puxada_horizontal: { ratio: 0.45, kind: 'polia' },
  pulldown_bracos_estendidos: { ratio: 0.25, kind: 'polia' },
  remada_curvada_barra: { ratio: 0.5, kind: 'barra' },
  remada_baixa: { ratio: 0.5, kind: 'polia' },
  remada_maquina: { ratio: 0.5, kind: 'maquina' },
  remada_unilateral: { ratio: 0.25, kind: 'halter' },
  remada_mochila: { ratio: 0.1, kind: 'mochila' },
  // Ombros
  desenvolvimento_militar: { ratio: 0.15, kind: 'halter' },
  elevacao_lateral: { ratio: 0.07, kind: 'halter' },
  elevacao_frontal: { ratio: 0.07, kind: 'halter' },
  crucifixo_invertido: { ratio: 0.06, kind: 'halter' },
  face_pull: { ratio: 0.2, kind: 'polia' },
  // Braços
  rosca_direta: { ratio: 0.25, kind: 'barra' },
  rosca_martelo: { ratio: 0.12, kind: 'halter' },
  rosca_concentrada: { ratio: 0.1, kind: 'halter' },
  rosca_scott: { ratio: 0.25, kind: 'maquina' },
  rosca_mochila: { ratio: 0.08, kind: 'mochila' },
  curl_mao: { ratio: 0.1, kind: 'halter' },
  triceps_cabo: { ratio: 0.25, kind: 'polia' },
  triceps_testa_barra_w: { ratio: 0.25, kind: 'barra' },
  triceps_frances_halter: { ratio: 0.15, kind: 'halter' },
  triceps_coice: { ratio: 0.07, kind: 'halter' },
  extensao_triceps: { ratio: 0.15, kind: 'halter' },
  // Pernas
  agachamento_barra: { ratio: 0.8, kind: 'barra' },
  levantamento_terra: { ratio: 1.0, kind: 'barra' },
  leg_press_45: { ratio: 1.5, kind: 'maquina' },
  cadeira_extensora: { ratio: 0.4, kind: 'maquina' },
  agachamento_goblet: { ratio: 0.2, kind: 'halter' },
  afundo_halteres: { ratio: 0.12, kind: 'halter' },
  stiff_romeno: { ratio: 0.6, kind: 'barra' },
  hip_thrust_barra: { ratio: 0.9, kind: 'barra' },
  mesa_flexora: { ratio: 0.35, kind: 'maquina' },
  cadeira_flexora: { ratio: 0.35, kind: 'maquina' },
  cadeira_abdutora: { ratio: 0.5, kind: 'maquina' },
  elevacao_pelvica_maquina: { ratio: 0.8, kind: 'maquina' },
  panturrilha_sentado_maquina: { ratio: 0.5, kind: 'maquina' },
  panturrilha_halteres: { ratio: 0.15, kind: 'halter' },
  // Abdômen
  crunch_polia: { ratio: 0.35, kind: 'polia' },
  abdominal_maquina: { ratio: 0.3, kind: 'maquina' },
};

/** Precisa de academia para a carga valer (ex.: puxada horizontal também roda com elástico). */
const GYM_ONLY_KINDS: LoadKind[] = ['barra', 'maquina', 'polia'];

const SEX_FACTOR: Record<string, number> = { M: 1, F: 0.6, OTHER: 0.8 };
const EXPERIENCE_FACTOR: Record<string, number> = { BEGINNER: 0.6, INTERMEDIATE: 0.85, ADVANCED: 1.05 };
const GOAL_FACTOR: Record<string, number> = { STRENGTH: 1.15, HYPERTROPHY: 1, WEIGHT_LOSS: 0.85, CONDITIONING: 0.85, HEALTH: 0.75 };
/** Peso de referência limitado a IMC 27: massa a mais não vira força proporcional. */
const REFERENCE_BMI = 27;
/** Cadência padrão: 2 s descendo, 2 s subindo. */
export const TEMPO = '2-0-2';
const SECONDS_PER_REP = 4;

export interface Athlete {
  weightKg: number;
  heightCm: number;
  sex: string;
  age: number;
  experience: string;
  goal: string;
  /** Tem academia (barra, máquinas, polia) disponível. */
  hasGym: boolean;
}

export interface SetPrescription {
  /** Carga a usar em cada série (null = só o peso do corpo). */
  loadKg: number | null;
  /** "24 kg por halter", "40 kg na barra (com a barra)"… */
  loadLabel: string;
  reps: number;
  /** Duração estimada da série em segundos (ou o tempo-alvo nos isométricos). */
  setSeconds: number;
  restSeconds: number;
  tempo: string | null;
  /** Peso corporal efetivamente deslocado, quando o catálogo informa. */
  bodyweightKg: number | null;
  perSide: boolean;
  /** Carga calculada agora (não veio do histórico). */
  estimated: boolean;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

function roundLoad(kg: number, kind: LoadKind) {
  if (kind === 'halter') return kg < 10 ? Math.max(1, Math.round(kg)) : roundTo(kg, 2);
  if (kind === 'barra') return Math.max(10, roundTo(kg, 2.5));
  if (kind === 'maquina') return Math.max(5, roundTo(kg, 5));
  if (kind === 'polia') return Math.max(2.5, roundTo(kg, 2.5));
  return Math.max(2, Math.round(kg));
}

export function loadLabel(kg: number, kind: LoadKind | null) {
  if (kind === 'halter') return `${kgText(kg)} por halter`;
  if (kind === 'barra') return `${kgText(kg)} na barra (somando a barra)`;
  if (kind === 'maquina') return `${kgText(kg)} na máquina`;
  if (kind === 'polia') return `${kgText(kg)} na polia`;
  if (kind === 'mochila') return `mochila com ~${kgText(kg)}`;
  return kgText(kg);
}

export const loadKindOf = (key: string): LoadKind | null => LOAD_RATIO[key]?.kind ?? null;

/** Carga inicial estimada, ou null quando o exercício não leva carga externa. */
export function startingLoad(exercise: Pick<Exercise, 'key'>, athlete: Athlete): number | null {
  const reference = LOAD_RATIO[exercise.key];
  if (!reference) return null;
  if (GYM_ONLY_KINDS.includes(reference.kind) && !athlete.hasGym) return null;
  const heightM = athlete.heightCm / 100;
  const weight = Math.min(athlete.weightKg, REFERENCE_BMI * heightM * heightM);
  const ageFactor = athlete.age < 18 ? 0.7 : athlete.age >= 65 ? 0.7 : athlete.age >= 50 ? 0.85 : 1;
  const raw = weight * reference.ratio
    * (SEX_FACTOR[athlete.sex] ?? 0.8)
    * (EXPERIENCE_FACTOR[athlete.experience] ?? 0.6)
    * (GOAL_FACTOR[athlete.goal] ?? 1)
    * ageFactor;
  return roundLoad(raw, reference.kind);
}

/** Repetições-alvo da primeira vez: no início da faixa para iniciantes e força. */
function firstTimeReps(range: { min: number; max: number }, athlete: Athlete) {
  if (athlete.experience === 'BEGINNER' || athlete.goal === 'STRENGTH') return range.min;
  return Math.round((range.min + range.max) / 2);
}

/**
 * Junta a sugestão do histórico com a estimativa inicial e devolve a série
 * pronta para o player: o usuário só confirma.
 */
export function prescribeSet(
  exercise: Pick<Exercise, 'key' | 'bodyweightFactor' | 'unilateral'>,
  planned: { unit: 'reps' | 'segundos' | 'minutos'; repsMin: number; repsMax: number; restSeconds: number },
  suggestion: Suggestion,
  athlete: Athlete,
): { prescription: SetPrescription; suggestion: Suggestion } {
  const kind = loadKindOf(exercise.key);
  let next = suggestion;
  let estimated = false;

  if (suggestion.trend === 'new') {
    const loadKg = startingLoad(exercise, athlete);
    const reps = firstTimeReps({ min: planned.repsMin, max: planned.repsMax }, athlete);
    estimated = loadKg !== null;
    const what = planned.unit === 'reps' ? `${reps} repetições` : planned.unit === 'segundos' ? `${reps} segundos` : `${reps} minutos`;
    next = {
      ...suggestion,
      loadKg,
      reps,
      note: loadKg !== null
        ? `Carga inicial estimada pelo seu peso, sexo e experiência: ${loadLabel(loadKg, kind)} para ${what}. Se sobrarem mais de 3 repetições, suba; se não completar, reduza.`
        : `Primeira vez: faça ${what} com controle${exercise.unilateral ? ' de cada lado' : ''}.`,
    };
  }

  const reps = next.reps || planned.repsMin;
  const setSeconds = planned.unit === 'segundos'
    ? reps
    : planned.unit === 'minutos'
      ? reps * 60
      : reps * SECONDS_PER_REP * (exercise.unilateral ? 2 : 1);

  return {
    suggestion: next,
    prescription: {
      loadKg: next.loadKg,
      loadLabel: next.loadKg !== null && next.loadKg > 0 ? loadLabel(next.loadKg, kind) : 'Peso do corpo',
      reps,
      setSeconds,
      restSeconds: planned.restSeconds,
      tempo: planned.unit === 'reps' ? TEMPO : null,
      bodyweightKg: exercise.bodyweightFactor ? Math.round(athlete.weightKg * exercise.bodyweightFactor) : null,
      perSide: Boolean(exercise.unilateral),
      estimated,
    },
  };
}
