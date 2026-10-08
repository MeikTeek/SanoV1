export const ASSISTANT_TIME_ZONE = 'America/Sao_Paulo';

export interface EntitySpan {
  start: number;
  end: number;
}

export interface DateEntity {
  value: Date;
  span: EntitySpan;
  hasTime?: boolean;
}

export interface TimeEntity {
  hours: number;
  minutes: number;
  span: EntitySpan;
}

export interface DateTimeEntities {
  date: DateEntity | null;
  time: TimeEntity | null;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

type LocalParts = { year: number; month: number; day: number; weekday: number };

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ASSISTANT_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  return {
    year: Number(value('year')),
    month: Number(value('month')) - 1,
    day: Number(value('day')),
    weekday,
  };
}

function localDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12));
}

function dateAtLocalTime(day: Date, hour = 0, minute = 0): Date {
  const parts = localParts(day);
  const wallClock = Date.UTC(parts.year, parts.month, parts.day, hour, minute);
  const utcGuess = new Date(wallClock);
  const localized = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASSISTANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcGuess);
  const number = (type: string) => Number(localized.find((part) => part.type === type)?.value ?? 0);
  const localizedAsUtc = Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'));
  const offset = localizedAsUtc - utcGuess.getTime();
  return new Date(wallClock - offset);
}

const spanOf = (match: RegExpExecArray): EntitySpan => ({
  start: match.index,
  end: match.index + match[0].length,
});

function resolveDate(text: string, now: Date): DateEntity | null {
  const todayParts = localParts(now);
  const today = localDate(todayParts.year, todayParts.month, todayParts.day);
  const shiftDays = (days: number, match: RegExpExecArray): DateEntity => {
    const target = new Date(today);
    target.setUTCDate(target.getUTCDate() + days);
    return { value: dateAtLocalTime(target), span: spanOf(match) };
  };

  const inDays = /\b(?:daqui a|em)\s+(\d{1,2})\s+dias?\b/.exec(text);
  if (inDays) return shiftDays(Number(inDays[1]), inDays);

  const inHours = /\b(?:daqui a|em)\s+(\d{1,2})\s+horas?\b/.exec(text);
  if (inHours) {
    return {
      value: new Date(now.getTime() + Number(inHours[1]) * 60 * 60_000),
      span: spanOf(inHours),
      hasTime: true,
    };
  }
  const inMinutes = /\b(?:daqui a|em)\s+(\d{1,3})\s+minutos?\b/.exec(text);
  if (inMinutes) {
    return {
      value: new Date(now.getTime() + Number(inMinutes[1]) * 60_000),
      span: spanOf(inMinutes),
      hasTime: true,
    };
  }

  const daysAfterTomorrow = /\bdepois\s+de\s+amanha\b/.exec(text);
  if (daysAfterTomorrow) return shiftDays(2, daysAfterTomorrow);
  const tomorrow = /\b(?:amanha|amnh)\b/.exec(text);
  if (tomorrow) return shiftDays(1, tomorrow);
  const todayMatch = /\b(?:hoje|hj)\b/.exec(text);
  if (todayMatch) return shiftDays(0, todayMatch);

  const nextWeek = /\b(?:semana que vem|proxima semana)\b/.exec(text);
  if (nextWeek) {
    const daysUntilNextMonday = ((8 - todayParts.weekday) % 7) || 7;
    return shiftDays(daysUntilNextMonday, nextWeek);
  }

  const weekday = /\b(?:(proxim[ao])\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.exec(text);
  if (weekday) {
    let delta = (WEEKDAYS[weekday[2]] - todayParts.weekday + 7) % 7;
    if (delta === 0 || weekday[1]) delta = delta || 7;
    return shiftDays(delta, weekday);
  }

  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    let year = numeric[3] ? Number(numeric[3]) : todayParts.year;
    if (year < 100) year += 2000;
    let target = localDate(year, month, day);
    const check = localParts(target);
    if (check.day !== day || check.month !== month || check.year !== year) return null;
    if (!numeric[3] && dateAtLocalTime(target).getTime() < dateAtLocalTime(today).getTime()) {
      year += 1;
      target = localDate(year, month, day);
      const nextCheck = localParts(target);
      if (nextCheck.day !== day || nextCheck.month !== month) return null;
    }
    return { value: dateAtLocalTime(target), span: spanOf(numeric) };
  }

  const long = /\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/.exec(text);
  if (long && MONTHS[long[2]] !== undefined) {
    const day = Number(long[1]);
    let year = long[3] ? Number(long[3]) : todayParts.year;
    let target = localDate(year, MONTHS[long[2]], day);
    if (!long[3] && dateAtLocalTime(target).getTime() < dateAtLocalTime(today).getTime()) {
      year += 1;
      target = localDate(year, MONTHS[long[2]], day);
    }
    return { value: dateAtLocalTime(target), span: spanOf(long) };
  }

  const dayOnly = /\bdia\s+(\d{1,2})\b/.exec(text);
  if (dayOnly) {
    let year = todayParts.year;
    let month = todayParts.month;
    let target = localDate(year, month, Number(dayOnly[1]));
    if (localParts(target).month !== month || localParts(target).day !== Number(dayOnly[1])) {
      return null;
    }
    if (dateAtLocalTime(target).getTime() < dateAtLocalTime(today).getTime()) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      target = localDate(year, month, Number(dayOnly[1]));
      if (localParts(target).day !== Number(dayOnly[1])) return null;
    }
    return { value: dateAtLocalTime(target), span: spanOf(dayOnly) };
  }

  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

function resolveTime(text: string): TimeEntity | null {
  const noon = /\bmeio[- ]dia\b/.exec(text);
  if (noon) return { hours: 12, minutes: 0, span: spanOf(noon) };
  const midnight = /\bmeia[- ]noite\b/.exec(text);
  if (midnight) return { hours: 0, minutes: 0, span: spanOf(midnight) };

  const wordTime = /\b(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:e\s+(meia|(\d{1,2}))\s*)?(?:da\s+(manha|tarde|noite))?\b/.exec(text);
  if (wordTime && (wordTime[2] || wordTime[3] || wordTime[4])) {
    let hours = NUMBER_WORDS[wordTime[1]];
    const period = wordTime[4];
    if (period === 'tarde' && hours < 12) hours += 12;
    if (period === 'noite' && hours < 12) hours += 12;
    if (period === 'manha' && hours === 12) hours = 0;
    const minutes = wordTime[2] === 'meia' ? 30 : Number(wordTime[3] ?? 0);
    if (minutes < 60) return { hours, minutes, span: spanOf(wordTime) };
  }

  const numericHalf = /\b(\d{1,2})\s+e\s+meia(?:\s+da\s+(manha|tarde|noite))?\b/.exec(text);
  if (numericHalf && Number(numericHalf[1]) <= 23) {
    let hours = Number(numericHalf[1]);
    if ((numericHalf[2] === 'tarde' || numericHalf[2] === 'noite') && hours < 12) hours += 12;
    if (numericHalf[2] === 'manha' && hours === 12) hours = 0;
    return { hours, minutes: 30, span: spanOf(numericHalf) };
  }

  const numeric = /\b(?:(as|a|ao)\s*)?(\d{1,2})(?:(h)\s*(\d{1,2})?|:(\d{2})|(\s+horas?))(?:\s+da\s+(manha|tarde|noite))?\b/.exec(text);
  const numericPeriod = /\b(?:(as|a|ao)\s*)?(\d{1,2})\s+da\s+(manha|tarde|noite)\b/.exec(text);
  const bare = numeric ?? numericPeriod ?? /\b(as|a|ao)\s+(\d{1,2})(?:\s+da\s+(manha|tarde|noite))?\b/.exec(text);
  if (!bare) return null;
  const hourValue = Number(bare[2]);
  if (hourValue > 23) return null;
  let hours = hourValue;
  const period = numeric ? numeric[7] : numericPeriod ? numericPeriod[3] : bare[3];
  if ((period === 'tarde' || period === 'noite') && hours < 12) hours += 12;
  if (period === 'manha' && hours === 12) hours = 0;
  const minutes = numeric ? Number(numeric[4] ?? numeric[5] ?? 0) : 0;
  if (minutes >= 60) return null;
  return { hours, minutes, span: spanOf(bare) };
}

export function extractDateTime(text: string, now: Date): DateTimeEntities {
  return { date: resolveDate(text, now), time: resolveTime(text) };
}

export function localDayBounds(date: Date): { start: Date; end: Date } {
  const parts = localParts(date);
  const start = dateAtLocalTime(localDate(parts.year, parts.month, parts.day));
  const next = localDate(parts.year, parts.month, parts.day);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: dateAtLocalTime(next) };
}
