/**
 * Regras puras de progressão: sugestão de carga, recordes, XP, ofensiva e
 * conquistas. Nada aqui toca o banco — o `workouts.ts` busca os dados e chama
 * estas funções, o que deixa tudo coberto por testes unitários.
 */
import { levelTitle, xpForLevel } from './progress';

export interface SetEntry { reps: number; loadKg: number | null; rir: number | null }

const round1 = (n: number) => Math.round(n * 10) / 10;
/** 47.5 → "47,5 kg" (texto exibido ao usuário). */
const kg = (n: number) => `${String(n).replace('.', ',')} kg`;

/** 1RM estimado (Epley). Com 1 repetição, a própria carga. */
export const estimate1Rm = (loadKg: number, reps: number) =>
  reps <= 1 ? loadKg : round1(loadKg * (1 + reps / 30));

export const setVolume = (set: SetEntry) => (set.loadKg ?? 0) * set.reps;

/* ── Sugestão para a próxima sessão (progressão dupla) ──────────────────── */

export interface Suggestion {
  loadKg: number | null;
  reps: number;
  /** O que mudou e por quê, em uma frase curta. */
  note: string;
  trend: 'up' | 'hold' | 'down' | 'new';
}

/** Incremento de carga: menor em isolados/membros superiores, maior em pernas. */
export function loadStep(loadKg: number, lowerBody: boolean) {
  if (loadKg < 10) return 1;
  return lowerBody ? 5 : 2.5;
}

/**
 * Progressão dupla, o padrão do wger para hipertrofia: primeiro sobe as
 * repetições dentro da faixa; quando TODAS as séries chegam ao topo da faixa
 * (sem falhar — RIR ≥ 1 quando informado), sobe a carga e volta ao início.
 */
export function suggestNext(previous: SetEntry[], range: { min: number; max: number }, lowerBody: boolean): Suggestion {
  const done = previous.filter((set) => set.reps > 0);
  if (!done.length) return { loadKg: null, reps: range.min, note: 'Primeira vez: escolha uma carga em que sobrem 2–3 repetições.', trend: 'new' };

  const loads = done.map((set) => set.loadKg ?? 0);
  const topLoad = Math.max(...loads);
  const atTop = done.filter((set) => (set.loadKg ?? 0) === topLoad);
  const minReps = Math.min(...atTop.map((set) => set.reps));
  const maxReps = Math.max(...atTop.map((set) => set.reps));
  const rirs = atTop.map((set) => set.rir).filter((rir): rir is number => rir !== null);
  const hitFailure = rirs.some((rir) => rir === 0);

  if (topLoad <= 0) {
    // Peso corporal: progride só em repetições até o teto da faixa.
    if (minReps >= range.max) return { loadKg: null, reps: range.max, note: 'Teto da faixa atingido: passe para a variação mais difícil.', trend: 'up' };
    return { loadKg: null, reps: Math.min(range.max, maxReps + 1), note: `Busque ${Math.min(range.max, maxReps + 1)} repetições.`, trend: 'up' };
  }

  if (minReps >= range.max && !hitFailure) {
    const next = round1(topLoad + loadStep(topLoad, lowerBody));
    return { loadKg: next, reps: range.min, note: `Todas as séries no topo da faixa: suba para ${kg(next)}.`, trend: 'up' };
  }
  if (minReps < Math.max(1, range.min - 2)) {
    const next = round1(Math.max(0, topLoad - loadStep(topLoad, lowerBody)));
    return { loadKg: next, reps: range.min, note: `Repetições bem abaixo da faixa: reduza para ${kg(next)}.`, trend: 'down' };
  }
  const target = Math.min(range.max, Math.max(range.min, minReps + 1));
  return { loadKg: topLoad, reps: target, note: `Mantenha ${kg(topLoad)} e busque ${target} repetições.`, trend: 'hold' };
}

/** "8–12", "30–45 segundos" → { min, max }. */
export function parseRange(text: string): { min: number; max: number } {
  const [low, high] = text.split(/[–-]/).map((part) => parseInt(part, 10));
  const min = Number.isFinite(low) ? low : 8;
  const max = Number.isFinite(high) ? high : min;
  return { min, max: Math.max(min, max) };
}

/* ── Recordes pessoais ──────────────────────────────────────────────────── */

export interface Best { loadKg: number; e1rm: number; reps: number; volume: number }

export function bestOf(sets: SetEntry[]): Best {
  return sets.reduce<Best>((best, set) => ({
    loadKg: Math.max(best.loadKg, set.loadKg ?? 0),
    e1rm: Math.max(best.e1rm, set.loadKg ? estimate1Rm(set.loadKg, set.reps) : 0),
    reps: Math.max(best.reps, set.reps),
    volume: best.volume + setVolume(set),
  }), { loadKg: 0, e1rm: 0, reps: 0, volume: 0 });
}

export interface PersonalRecord { kind: 'load' | 'e1rm' | 'reps'; value: number; previous: number }

/**
 * Recordes batidos numa sessão contra o histórico anterior. Sem histórico não
 * há recorde (a primeira vez não é "recorde", é ponto de partida). Repetições
 * só contam como recorde em exercício sem carga.
 */
export function detectRecords(current: SetEntry[], history: Best | null): PersonalRecord[] {
  if (!history) return [];
  const now = bestOf(current);
  const records: PersonalRecord[] = [];
  if (now.loadKg > 0 && now.loadKg > history.loadKg) records.push({ kind: 'load', value: now.loadKg, previous: history.loadKg });
  if (now.e1rm > 0 && now.e1rm > history.e1rm && now.loadKg <= history.loadKg) records.push({ kind: 'e1rm', value: now.e1rm, previous: history.e1rm });
  if (now.loadKg === 0 && history.loadKg === 0 && now.reps > history.reps) records.push({ kind: 'reps', value: now.reps, previous: history.reps });
  return records;
}

/* ── XP e nível ─────────────────────────────────────────────────────────── */

/** XP de uma sessão: presença vale mais que volume, para não premiar exagero. */
export const sessionXp = (completedSets: number) => Math.min(130, 40 + 3 * completedSets);

export function levelFromXp(totalXp: number) {
  let level = 1;
  let rest = Math.max(0, Math.round(totalXp));
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level += 1;
  }
  return { current: level, title: levelTitle(level), xp: rest, xpNeeded: xpForLevel(level), totalXp: Math.round(totalXp) };
}

/* ── Calendário: ofensiva e semanas ─────────────────────────────────────── */

const DAY_MS = 86_400_000;
export const dayKeyToDate = (day: string) => new Date(`${day}T12:00:00Z`);
export const addDaysKey = (day: string, days: number) => new Date(dayKeyToDate(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (day: string) => dayKeyToDate(day).getUTCDay();
/** Segunda-feira da semana do dia. */
export const weekStartKey = (day: string) => addDaysKey(day, -((weekdayOf(day) + 6) % 7));

/**
 * Ofensiva em dias de treino PLANEJADOS: descanso do plano não quebra a
 * sequência (a penalidade antiga punia o próprio descanso). Hoje sem treino
 * ainda não quebra — o dia não acabou. Treino extra num dia de descanso soma.
 */
export function trainingStreak(trainedDays: Set<string>, plannedWeekdays: number[], today: string): number {
  if (!trainedDays.size) return 0;
  const planned = new Set(plannedWeekdays);
  const first = [...trainedDays].sort()[0];
  let streak = 0;
  for (let day = today; day >= first; day = addDaysKey(day, -1)) {
    if (trainedDays.has(day)) streak += 1;
    else if (planned.has(weekdayOf(day)) && day !== today) break;
  }
  return streak;
}

/** Semanas seguidas (até a anterior, mais a atual se já cumprida) batendo a meta. */
export function weeklyGoalStreak(trainedDays: Set<string>, goalPerWeek: number, today: string): number {
  const counts = new Map<string, number>();
  for (const day of trainedDays) counts.set(weekStartKey(day), (counts.get(weekStartKey(day)) ?? 0) + 1);
  let week = weekStartKey(today);
  let streak = (counts.get(week) ?? 0) >= goalPerWeek ? 1 : 0;
  for (week = addDaysKey(week, -7); (counts.get(week) ?? 0) >= goalPerWeek; week = addDaysKey(week, -7)) streak += 1;
  return streak;
}

/* ── Conquistas ─────────────────────────────────────────────────────────── */

export interface AchievementInput {
  sessions: number;
  streak: number;
  bestWeeklyStreak: number;
  records: number;
  totalVolumeKg: number;
  assessments: number;
  earlySessions: number;
  lateSessions: number;
}

export interface Achievement { key: string; title: string; description: string; unlocked: boolean; progress: number; icon: string }

const DEFINITIONS: { key: string; title: string; description: string; icon: string; target: number; value: (a: AchievementInput) => number }[] = [
  { key: 'first', title: 'Primeiro passo', description: 'Registre o primeiro treino.', icon: '🏁', target: 1, value: (a) => a.sessions },
  { key: 'ten', title: 'Constância', description: 'Complete 10 treinos.', icon: '🔟', target: 10, value: (a) => a.sessions },
  { key: 'fifty', title: 'Hábito formado', description: 'Complete 50 treinos.', icon: '🏋️', target: 50, value: (a) => a.sessions },
  { key: 'hundred', title: 'Centurião', description: 'Complete 100 treinos.', icon: '💯', target: 100, value: (a) => a.sessions },
  { key: 'streak7', title: 'Uma semana firme', description: 'Ofensiva de 7 treinos sem falhar um dia planejado.', icon: '🔥', target: 7, value: (a) => a.streak },
  { key: 'weeks4', title: 'Mês completo', description: 'Bata a meta semanal 4 semanas seguidas.', icon: '📅', target: 4, value: (a) => a.bestWeeklyStreak },
  { key: 'pr1', title: 'Novo recorde', description: 'Bata seu primeiro recorde pessoal.', icon: '🏆', target: 1, value: (a) => a.records },
  { key: 'pr10', title: 'Sempre mais forte', description: 'Bata 10 recordes pessoais.', icon: '⚡', target: 10, value: (a) => a.records },
  { key: 'ton10', title: '10 toneladas', description: 'Some 10.000 kg de volume levantado.', icon: '🪨', target: 10_000, value: (a) => a.totalVolumeKg },
  { key: 'ton100', title: '100 toneladas', description: 'Some 100.000 kg de volume levantado.', icon: '⛰️', target: 100_000, value: (a) => a.totalVolumeKg },
  { key: 'body3', title: 'Acompanhamento', description: 'Faça 3 avaliações corporais.', icon: '📏', target: 3, value: (a) => a.assessments },
  { key: 'early', title: 'Madrugador', description: 'Treine 5 vezes antes das 7h.', icon: '🌅', target: 5, value: (a) => a.earlySessions },
  { key: 'late', title: 'Coruja', description: 'Treine 5 vezes depois das 21h.', icon: '🌙', target: 5, value: (a) => a.lateSessions },
];

export function achievements(input: AchievementInput): Achievement[] {
  return DEFINITIONS.map((item) => {
    const value = item.value(input);
    return {
      key: item.key, title: item.title, description: item.description, icon: item.icon,
      unlocked: value >= item.target,
      progress: Math.min(1, Math.max(0, value / item.target)),
    };
  });
}
