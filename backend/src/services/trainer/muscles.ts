import type { Exercise, MuscleGroup } from './exercises';

/**
 * Músculos no padrão do wger (ids de `exercises/fixtures/muscles.json`).
 *
 * O frontend desenha o mapa corporal com os mesmos ids, então o catálogo só
 * precisa dizer QUAIS músculos cada exercício trabalha — a posição no corpo
 * fica no desenho.
 */
export const MUSCLES = [
  { id: 1, key: 'biceps', label: 'Bíceps', front: true },
  { id: 2, key: 'ombros', label: 'Ombros', front: true },
  { id: 3, key: 'serratil', label: 'Serrátil', front: true },
  { id: 4, key: 'peito', label: 'Peitoral', front: true },
  { id: 5, key: 'triceps', label: 'Tríceps', front: false },
  { id: 6, key: 'abdomen', label: 'Abdômen', front: true },
  { id: 7, key: 'panturrilha', label: 'Panturrilha', front: false },
  { id: 8, key: 'gluteo', label: 'Glúteos', front: false },
  { id: 9, key: 'trapezio', label: 'Trapézio', front: false },
  { id: 10, key: 'quadriceps', label: 'Quadríceps', front: true },
  { id: 11, key: 'posterior', label: 'Posterior da coxa', front: false },
  { id: 12, key: 'costas', label: 'Dorsais', front: false },
  { id: 13, key: 'braquial', label: 'Braquial', front: true },
  { id: 14, key: 'obliquos', label: 'Oblíquos', front: true },
  { id: 15, key: 'soleo', label: 'Sóleo', front: false },
  { id: 16, key: 'lombar', label: 'Lombar', front: false },
] as const;

/** Nome de músculo do catálogo (`grupos_secundarios`) → ids do wger. */
const SOURCE_TO_IDS: Record<string, number[]> = {
  peito: [4],
  costas: [12],
  ombros: [2],
  biceps: [1],
  triceps: [5],
  antebraco: [13],
  quadriceps: [10],
  posterior: [11],
  gluteo: [8],
  panturrilha: [7, 15],
  abdomen: [6],
  obliquos: [14],
  lombar: [16],
  trapezio: [9],
  // Cardio de corpo inteiro: as pernas carregam o esforço.
  corpo_inteiro: [10, 7],
};

/** Exercícios legados não têm `sourceMuscles`: o grupo dá uma boa aproximação. */
const GROUP_TO_IDS: Record<MuscleGroup, { primary: number[]; secondary: number[] }> = {
  peito: { primary: [4], secondary: [2, 5] },
  costas: { primary: [12], secondary: [1, 9] },
  pernas: { primary: [10, 8], secondary: [11, 7] },
  ombros: { primary: [2], secondary: [5, 9] },
  bracos: { primary: [1, 5], secondary: [13] },
  core: { primary: [6], secondary: [14] },
  cardio: { primary: [10, 7], secondary: [6] },
  mobilidade: { primary: [], secondary: [16, 8] },
};

/** Ajustes pontuais em legados cujo grupo engana (ex.: tríceps está em "braços"). */
const LEGACY_OVERRIDES: Record<string, { primary: number[]; secondary: number[] }> = {
  ponte_gluteo: { primary: [8], secondary: [11, 16] },
  stiff_romeno: { primary: [11, 8], secondary: [16] },
  mesa_flexora: { primary: [11], secondary: [7] },
  elevacao_calf: { primary: [7, 15], secondary: [] },
};

const unique = (ids: number[]) => [...new Set(ids)];

export function musclesFor(exercise: Exercise): { primary: number[]; secondary: number[] } {
  const override = LEGACY_OVERRIDES[exercise.key];
  if (override) return override;
  if (exercise.sourceMuscles?.length) {
    const [main, ...rest] = exercise.sourceMuscles;
    const primary = unique(SOURCE_TO_IDS[main] ?? []);
    const secondary = unique(rest.flatMap((name) => SOURCE_TO_IDS[name] ?? [])).filter((id) => !primary.includes(id));
    return { primary, secondary };
  }
  if (exercise.key.startsWith('rosca_')) return { primary: [1], secondary: [13] };
  if (exercise.key.startsWith('triceps_') || exercise.key === 'extensao_triceps') return { primary: [5], secondary: [] };
  return GROUP_TO_IDS[exercise.group] ?? { primary: [], secondary: [] };
}
