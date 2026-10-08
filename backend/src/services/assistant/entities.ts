import { extractDateTime } from './dateTime';
import { normalizeMessage } from './normalize';
import { parseSchedule } from '../agenda/parse';

export interface ExtractedEntities {
  normalized: string;
  date: Date | null;
  time: { hours: number; minutes: number } | null;
  title: string | null;
  participants: string | null;
  remaining: string;
}

export function extractEntities(text: string, now: Date): ExtractedEntities {
  const normalized = normalizeMessage(text);
  const { date, time } = extractDateTime(normalized, now);
  const schedule = parseSchedule(text, now);
  const spans = [date?.span, time?.span].filter((span) => span !== undefined);
  const remaining = normalized
    .split('')
    .map((character, index) => spans.some((span) => index >= span!.start && index < span!.end) ? ' ' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    normalized,
    date: date?.value ?? null,
    time: time ? { hours: time.hours, minutes: time.minutes } : null,
    title: schedule.title || null,
    participants: schedule.participants ?? null,
    remaining,
  };
}
