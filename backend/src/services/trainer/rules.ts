import { EXERCISES, GOALS, type Equipment, type Exercise, type Goal, type Injury } from './exercises';

/** Perfil mínimo de que o motor precisa para decidir. */
export interface RuleProfile {
  goal: Goal;
  equipment: Equipment[];
  injuries: Injury[];
  age: number;
  /** Nível do jogador (1..). Governa progressão de volume e dificuldade. */
  level: number;
  /** Minutos por dia disponíveis (vindo do onboarding). */
  minutesAvailable: number;
}

export interface Block {
  key: string;
  name: string;
  group: string;
  target: string;
  minutes: number;
  xp: number;
}

export interface MissionPlan {
  title: string;
  blocks: Block[];
  plannedMinutes: number;
  totalXp: number;
  /** Motivos das exclusões — a IA vira isso em texto para o usuário. */
  excluded: { name: string; reason: string }[];
}

/**
 * Filtro de SEGURANÇA. Roda antes de qualquer escolha de treino e é a razão de
 * este módulo existir: uma lesão declarada nunca resulta num exercício proibido.
 *
 * Ordem das regras (a primeira que casa vence):
 *  1. precisa de equipamento que o usuário não tem
 *  2. é contraindicado para alguma lesão informada
 *  3. acima da dificuldade aceitável para a idade
 */
/**
 * Filtro de SEGURANÇA. Roda antes de qualquer escolha de treino e é a razão de
 * este módulo existir: uma lesão declarada nunca resulta num exercício proibido.
 *
 * A LESÃO é avaliada antes do equipamento de propósito: é a informação que mais
 * importa, e o motivo exibido precisa ser o motivo real — dizer "falta
 * equipamento" para quem tem e está com dor esconderia o risco.
 */
export function screenOut(e: Exercise, p: RuleProfile): string | null {
  const clash = e.contraindicated.find((i) => p.injuries.includes(i));
  if (clash) return `contraindicado para ${clash}`;

  const hasGear = e.equipment.some((eq) => eq === 'nenhum' || p.equipment.includes(eq));
  if (!hasGear) return 'precisa de equipamento indisponível';

  // Acima dos 60 anos, nada de dificuldade máxima.
  if (p.age >= 60 && e.difficulty === 3) return 'exige dificuldade alta para a faixa etária';

  return null;
}

/**
 * Prioridade de grupos por objetivo.
 *
 * Deriva de `GOALS[].focus`, que é a MESMA lista exibida ao usuário no cadastro:
 * o que ele lê é exatamente o que o motor aplica (fonte única de verdade).
 */
const GROUPS_BY_GOAL: Record<Goal, string[]> = Object.fromEntries(
  GOALS.map((g) => [g.key, g.focus]),
) as Record<Goal, string[]>;

/**
 * Gerador determinístico da Missão Diária.
 *
 * Mesma entrada ⇒ mesma saída (só muda o "dia" da semente), o que dá
 * reprodutibilidade, testabilidade e evita alucinação: a IA nunca decide
 * exercício, volume ou segurança — ela só formata o resultado.
 */
export function generateMission(p: RuleProfile, dayIndex: number): MissionPlan {
  const excluded: MissionPlan['excluded'] = [];
  const safe = EXERCISES.filter((e) => {
    const reason = screenOut(e, p);
    if (reason) excluded.push({ name: e.name, reason });
    return reason === null;
  });

  // Objetivo define a ordem de prioridade dos grupos.
  const priority = GROUPS_BY_GOAL[p.goal];
  // Rotação pelo dia: o mesmo grupo não domina a missão todos os dias.
  const rotated = [...priority.slice(dayIndex % priority.length), ...priority.slice(0, dayIndex % priority.length)];

  // Volume por nível: 4 blocos no início, até 6. Tempo disponível manda no teto.
  const wantBlocks = Math.min(4 + Math.floor(p.level / 3), 6, Math.max(2, Math.floor(p.minutesAvailable / 8)));
  const maxMinutes = p.minutesAvailable;

  const chosen: Exercise[] = [];
  const usedGroups = new Set<string>();
  let total = 0;

  for (const group of rotated) {
    if (chosen.length >= wantBlocks || total >= maxMinutes) break;
    const pool = safe.filter((e) => e.group === group).sort((a, b) => a.difficulty - b.difficulty);
    if (!pool.length) continue;
    // Alterna grupos para não encher a missão só de pernas/cardio.
    if (usedGroups.has(group) && chosen.length < wantBlocks - 1) continue;
    const pick = pool[Math.floor((dayIndex + chosen.length) / 2) % pool.length];
    if (chosen.includes(pick)) continue;
    if (total + pick.minutes > maxMinutes) continue;
    chosen.push(pick);
    usedGroups.add(group);
    total += pick.minutes;
  }

  // Complementa com mobilidade/core se sobrar tempo (e sempre como base segura).
  if (chosen.length < 3) {
    for (const e of safe.filter((x) => x.group === 'core' || x.group === 'mobilidade')) {
      if (chosen.length >= 3 || total + e.minutes > maxMinutes) break;
      if (!chosen.includes(e)) { chosen.push(e); total += e.minutes; }
    }
  }

  const blocks: Block[] = chosen.map((e, i) => ({
    key: `${e.key}_${i}`,
    name: e.name,
    group: e.group,
    target: targetFor(e, p.level),
    minutes: e.minutes,
    xp: e.xp,
  }));

  return {
    title: `Treino de hoje — ${goalLabel(p.goal)}`,
    blocks,
    plannedMinutes: total,
    totalXp: blocks.reduce((s, b) => s + b.xp, 0),
    excluded: excluded.slice(0, 12),
  };
}

/** Nome do objetivo em português, usado no título da missão. */
const goalLabel = (goal: Goal) => GOALS.find((g) => g.key === goal)?.label ?? 'Treino';

/**
 * Volume alvo por exercício, escalado pelo nível. Determinístico e conservador:
 * o objetivo é progresso mensurável sem passar do que o corpo aguenta.
 */
function targetFor(e: Exercise, level: number): string {
  const scale = 1 + Math.floor(level / 3) * 0.25; // +25% a cada 3 níveis
  if (e.group === 'cardio') {
    const base = { caminhada: 20, corrida_esteira: 15, bike_estatica: 20, pulo_corda: 8, mountain_climber: 3, burpee: 12 }[e.key] ?? 15;
    return `${Math.round(base * scale)} min`;
  }
  if (e.minutes <= 5 && e.difficulty <= 2) return `${Math.round(15 * scale)} reps`;
  return `${Math.round(3 * scale)} séries de ${Math.round(10 * scale)} reps`;
}

/** Atributo que um grupo de músculo alimenta — usado no ganho de XP. */
export const STAT_BY_GROUP: Record<string, 'strength' | 'agility' | 'stamina' | 'vitality'> = {
  peito: 'strength', costas: 'strength', pernas: 'strength', bracos: 'strength', ombros: 'strength',
  cardio: 'stamina', core: 'stamina',
  mobilidade: 'agility',
};