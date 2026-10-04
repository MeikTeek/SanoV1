import type { Block } from './rules';
import { STAT_BY_GROUP } from './rules';

/** Atributos e progressão do jogador. Espelha o modelo PlayerStats. */
export interface Stats {
  strength: number;
  agility: number;
  stamina: number;
  vitality: number;
  xp: number;
  level: number;
  streak: number;
}

/** XP necesario para sair do nível `n` (curva crescente, sem-Inflation). */
export const xpForLevel = (level: number) => Math.round(100 * Math.pow(1.35, level - 1));

/** Nome do nível, para a temática do sistema. */
export const levelTitle = (level: number) =>
  ['Desperto', 'Aprendiz', 'Constante', 'Firme', 'Asceta', 'Veterano', 'Elite', 'Mestre', 'Lenda', 'Soberano'][Math.min(level - 1, 9)];

/**
 * Ganho de atributos ao concluir uma missão.
 *
 * Cada bloco alimenta o atributo do seu grupo muscular. A divisão por 10 mantém
 * o incremento legível no radar (uma missão ≈ +0.5 a +2 pontos por atributo).
 * O XP é o total dos blocos concluídos — é ele que define o nível.
 */
export function applyCompletion(stats: Stats, blocks: Block[], doneKeys: string[]): Stats {
  const next = { ...stats };
  let earned = 0;

  for (const b of blocks) {
    if (!doneKeys.includes(b.key)) continue;
    const stat = STAT_BY_GROUP[b.group] ?? 'strength';
    next[stat] += b.xp / 10;
    earned += b.xp;
  }

  next.xp += earned;
  // Sobe de nível quantas vezes o XP acumulado permitir.
  while (next.xp >= xpForLevel(next.level)) {
    next.xp -= xpForLevel(next.level);
    next.level += 1;
  }
  next.streak = stats.streak + 1;
  return next;
}

/** Sem concluções, a ofensiva zera. */
export function applyMissedDay(streak: number): number {
  return 0;
}

/** Dias consecutivos perdidos → penalidade de atributo (debuff). */
export const DEBUFF_PER_MISSED_DAY = 5; // %

/** Redução aplicada enquanto o debuff estiver ativo (dias perdidos). */
export function debuffPercent(daysMissed: number): number {
  return Math.min(40, daysMissed * DEBUFF_PER_MISSED_DAY);
}

/** Atributos visíveis já com o debuff aplicado — o radar mostra a queda. */
export function applyDebuff(stats: Stats, debuffUntil: Date | null, now: Date): Stats {
  if (!debuffUntil || debuffUntil <= now) return stats;
  // Não guardamos a data de início; 1 dia de debuff por vez.
  const factor = 1 - debuffPercent(1) / 100;
  return {
    ...stats,
    strength: stats.strength * factor,
    agility: stats.agility * factor,
    stamina: stats.stamina * factor,
    vitality: stats.vitality * factor,
  };
}