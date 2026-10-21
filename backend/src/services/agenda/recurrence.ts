import { ASSISTANT_TIME_ZONE, dateAtLocalTime, localDate, localParts } from '../assistant/dateTime';

/**
 * Recorrência da agenda. Cada ocorrência vira uma linha própria (mesmo
 * `seriesId`), gerada até um horizonte e estendida sob demanda — assim
 * lembrete, "feito" e cancelamento de uma ocorrência não exigem regras de
 * exceção como num RRULE.
 *
 * Tudo em horário de parede de São Paulo: "toda segunda às 7h" continua às 7h
 * mesmo se o fuso mudar.
 */
export const RECURRENCES = ['DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  DAILY: 'todo dia',
  WEEKDAYS: 'dias úteis',
  WEEKLY: 'toda semana',
  MONTHLY: 'todo mês',
  YEARLY: 'todo ano',
};

/** Quantas ocorrências à frente cada regra mantém gerado. */
export const HORIZON_DAYS = 120;

function wallClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASSISTANT_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: n('hour'), minute: n('minute') };
}

/** Próxima ocorrência depois de `from`, preservando o horário local e o dia-âncora do mês. */
export function nextOccurrence(from: Date, rule: Recurrence, anchorDay: number): Date {
  const { year, month, day, weekday } = localParts(from);
  const { hour, minute } = wallClock(from);
  let target: Date;
  if (rule === 'DAILY') target = localDate(year, month, day + 1);
  else if (rule === 'WEEKDAYS') target = localDate(year, month, day + (weekday === 5 ? 3 : weekday === 6 ? 2 : 1));
  else if (rule === 'WEEKLY') target = localDate(year, month, day + 7);
  else {
    const months = rule === 'MONTHLY' ? 1 : 12;
    const index = year * 12 + month + months;
    const y = Math.floor(index / 12);
    const m = index % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    target = localDate(y, m, Math.min(anchorDay, last));
  }
  return dateAtLocalTime(target, hour, minute);
}

/**
 * Ocorrências a partir de `first` (inclusive) até `horizon` ou `until`,
 * no máximo `limit`. `first` já é a primeira ocorrência válida.
 */
export function expandSeries(first: Date, rule: Recurrence, horizon: Date, until?: Date | null, limit = 400): Date[] {
  const anchorDay = localParts(first).day;
  const end = until && until < horizon ? until : horizon;
  const out: Date[] = [];
  for (let at = first; at <= end && out.length < limit; at = nextOccurrence(at, rule, anchorDay)) out.push(at);
  return out;
}

/** "Dias úteis" começando num sábado/domingo: pula para segunda. */
export function alignStart(first: Date, rule: Recurrence): Date {
  if (rule !== 'WEEKDAYS') return first;
  const { weekday } = localParts(first);
  if (weekday !== 0 && weekday !== 6) return first;
  const { year, month, day } = localParts(first);
  const { hour, minute } = wallClock(first);
  return dateAtLocalTime(localDate(year, month, day + (weekday === 6 ? 2 : 1)), hour, minute);
}
