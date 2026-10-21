/**
 * Agenda pelo chat — o Sano como assistente de verdade:
 *
 *   marca dentista sexta às 15h          → cria na hora (com "desfazer")
 *   academia toda segunda às 7h          → série recorrente
 *   me lembra de ligar pra mãe às 19h    → hoje (ou amanhã, se já passou)
 *   quando é o dentista? / qual meu próximo compromisso
 *   tô livre quinta à tarde? / quantos compromissos essa semana
 *   adia o dentista 1 hora / passa a reunião pra sexta / concluí a reunião
 *   cancela o dentista (confirma) / cancela tudo de amanhã (confirma)
 *   desfazer
 *
 * Criar e mover são reversíveis, então acontecem na hora com "desfazer".
 * Cancelar continua pedindo confirmação. Conflito de horário também.
 */
import type { Intent, SanoAppointment, SanoContext, SanoResponse, SanoResult, SanoUser, SanoDeps, SanoView } from '../types';
import type { PendingAssistantAction } from '../../assistant/dialog';
import type { UndoEntry } from '../context.service';
import { understandAgenda, extractRange, type AgendaRange, type AgendaRequest, type Daypart } from '../../agenda/nlu';
import { parseSchedule } from '../../agenda/parse';
import { RECURRENCE_LABEL, type Recurrence } from '../../agenda/recurrence';
import { ASSISTANT_TIME_ZONE as TZ, dateAtLocalTime, extractDateTime, localDayBounds, localParts } from '../../assistant/dateTime';
import { variedReply } from '../../assistant/recovery';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Lembrete padrão de quem cria pelo chat sem dizer nada (compromisso com horário). */
const DEFAULT_REMINDER = 15;

/* ───────────────────────── formatação ───────────────────────── */

function wallClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: n('hour'), minute: n('minute') };
}

/** 15h, 9h30. */
export function hm(date: Date) {
  const { hour, minute } = wallClock(date);
  return minute ? `${hour}h${String(minute).padStart(2, '0')}` : `${hour}h`;
}

const sameDay = (a: Date, b: Date) => {
  const x = localParts(a); const y = localParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/** hoje · amanhã · sexta, 23/10. */
export function dayPhrase(date: Date, now: Date) {
  if (sameDay(date, now)) return 'hoje';
  if (sameDay(date, new Date(now.getTime() + DAY))) return 'amanhã';
  if (sameDay(date, new Date(now.getTime() - DAY))) return 'ontem';
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(date).replace('-feira', '');
  const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(date);
  return `${weekday}, ${dm}`;
}

/** Data num formato que o próprio parser entende (para comandos sugeridos). */
function dayCommand(date: Date, now: Date) {
  if (sameDay(date, now)) return 'hoje';
  if (sameDay(date, new Date(now.getTime() + DAY))) return 'amanhã';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(date);
}

export function whenText(a: Pick<SanoAppointment, 'startsAt' | 'endsAt' | 'allDay'>, now: Date) {
  const start = new Date(a.startsAt);
  if (a.allDay) return `${dayPhrase(start, now)} (dia inteiro)`;
  const end = a.endsAt ? new Date(a.endsAt) : null;
  return `${dayPhrase(start, now)}, ${end ? `das ${hm(start)} às ${hm(end)}` : `às ${hm(start)}`}`;
}

export function relative(date: Date, now: Date) {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MIN) return 'agora';
  if (diff < 0) {
    if (abs < HOUR) return `começou há ${Math.round(abs / MIN)} min`;
    return `foi há ${Math.round(abs / HOUR)}h`;
  }
  if (abs < HOUR) return `daqui a ${Math.round(abs / MIN)} min`;
  if (abs < DAY && sameDay(date, now)) {
    const h = Math.floor(abs / HOUR); const m = Math.round((abs % HOUR) / MIN);
    return `daqui a ${h}h${m >= 5 ? String(m).padStart(2, '0') : ''}`;
  }
  const days = Math.round((localDayBounds(date).start.getTime() - localDayBounds(now).start.getTime()) / DAY);
  if (days === 1) return 'amanhã';
  if (days < 7) return `em ${days} dias`;
  if (days < 14) return 'semana que vem';
  return `em ${Math.round(days / 7)} semanas`;
}

/** "amanhã, às 13h" ou "hoje, às 19h — daqui a 5h": o relativo só quando acrescenta algo. */
function whenWithRelative(a: SanoAppointment, now: Date) {
  const when = whenText(a, now);
  const rel = relative(new Date(a.startsAt), now);
  return /^(hoje|amanhã)/.test(when) && !rel.startsWith('daqui') && !rel.startsWith('começou') ? when : `${when} — ${rel}`;
}

/** " até 20/12" ou " (sem data para acabar)". `recurrenceUntil` é o fim do último dia. */
function untilText(a: SanoAppointment, now: Date) {
  if (!a.recurrenceUntil) return ' (sem data para acabar)';
  return ` até ${dayPhrase(new Date(new Date(a.recurrenceUntil).getTime() - 1), now)}`;
}

export function reminderText(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === 0) return 'na hora';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h antes`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? '1 dia antes' : `${days} dias antes`;
}

function details(a: SanoAppointment) {
  return [
    a.participants ? `Com ${a.participants}` : null,
    a.location ? `Local: ${a.location}` : null,
    a.recurrence ? `Repete ${RECURRENCE_LABEL[a.recurrence as Recurrence] ?? ''}${a.recurrenceUntil ? ` até ${dayCommand(new Date(new Date(a.recurrenceUntil).getTime() - 1), new Date(0))}` : ', sem data para acabar'}` : null,
    reminderText(a.remindBefore) ? `Lembrete ${reminderText(a.remindBefore)}` : 'Sem lembrete',
  ].filter((x): x is string => !!x);
}

function eventView(a: SanoAppointment, now: Date, state: Extract<SanoView, { kind: 'event' }>['state'], actions: { label: string; command: string }[] = []): SanoView {
  return {
    kind: 'event',
    title: a.title,
    when: whenText(a, now),
    relative: relative(new Date(a.startsAt), now),
    details: details(a),
    state,
    actions,
  };
}

const ref = (a: SanoAppointment) => `#${a.id}`;
const memoryOf = (items: SanoAppointment[], focusDay?: Date) => ({
  appointments: items.map((a) => ({ ...a, startsAt: new Date(a.startsAt) })),
  ...(focusDay && { focusDay: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(focusDay) }),
});

const requireAgenda = (ctx: { deps: SanoDeps }) => {
  if (!ctx.deps.agenda) throw new Error('Serviço de agenda indisponível');
  return ctx.deps.agenda;
};

/** Mantém o dia local de `day` e aplica a hora de parede. */
function atWallClock(day: Date, hour: number, minute: number) {
  const p = localParts(day);
  return dateAtLocalTime(new Date(Date.UTC(p.year, p.month, p.day, 12)), hour, minute);
}

/* ───────────────────────── alvo ("o dentista", "essa") ───────────────────────── */

const PRONOUN = /^(essa|esse|isso|ela|ele|o ultimo|a ultima|ultimo|ultima|esse ai|essa ai)?$/;

/** Melhor candidato: mais palavras do termo no título e mais perto de agora. */
function pickBest(matches: SanoAppointment[], term: string, now: Date): SanoAppointment | null {
  if (matches.length <= 1) return matches[0] ?? null;
  const words = term.split(/\s+/).filter((w) => w.length > 2);
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const scored = matches.map((m) => {
    const title = fold(`${m.title} ${m.participants ?? ''}`);
    const hits = words.filter((w) => title.includes(w)).length;
    const exact = fold(m.title) === term ? 2 : 0;
    const hours = Math.abs(new Date(m.startsAt).getTime() - now.getTime()) / HOUR;
    return { m, score: hits + exact + Math.max(0, 1 - hours / 48) };
  }).sort((a, b) => b.score - a.score);
  // Empate de verdade: melhor perguntar do que mexer no compromisso errado.
  return scored[0].score - scored[1].score >= 0.5 ? scored[0].m : null;
}

type Target = { target: SanoAppointment } | { result: SanoResult };

async function resolveTarget(ctx: SanoContext, term: string, targetId: string | null, verb: string): Promise<Target> {
  const agenda = requireAgenda(ctx);
  if (targetId) {
    const found = agenda.get ? await agenda.get(ctx.user.id, targetId) : (await agenda.list(ctx.user.id)).find((a) => a.id === targetId);
    if (found) return { target: found };
  }
  if (PRONOUN.test(term)) {
    const last = ctx.memory?.lastAppointments?.[ctx.memory.lastAppointments.length - 1];
    if (last) {
      const found = agenda.get ? await agenda.get(ctx.user.id, last.id) : (await agenda.findByTitle(ctx.user.id, last.title)).find((a) => a.id === last.id);
      if (found) return { target: found };
    }
    return { result: { reply: `Qual compromisso devo ${verb}? Diga um trecho do nome, por exemplo "${verb} o dentista".` } };
  }
  const matches = await agenda.findByTitle(ctx.user.id, term);
  if (!matches.length) {
    return {
      result: {
        reply: `Não achei nada com "${term}" na sua agenda.`,
        suggestions: ['o que tenho essa semana', `marcar ${term} amanhã`],
      },
    };
  }
  const best = pickBest(matches, term, ctx.now);
  if (best) return { target: best };
  return {
    result: {
      reply: `Achei ${matches.length} compromissos parecidos. Qual deles?`,
      view: {
        kind: 'actions',
        title: `Qual ${verb === 'cancelar' ? 'cancelar' : 'deles'}?`,
        items: matches.map((m) => ({ label: `${m.title} · ${whenText(m, ctx.now)}`, command: `${ctx.text.replace(/#[\w-]+/g, '').trim()} ${ref(m)}` })),
      },
      memory: memoryOf(matches),
    },
  };
}

/* ───────────────────────── conflitos ───────────────────────── */

async function conflictsFor(ctx: SanoContext, startsAt: Date, endsAt: Date | null, ignoreId?: string) {
  const agenda = requireAgenda(ctx);
  const { start, end } = localDayBounds(startsAt);
  const day = (await agenda.listByDay(ctx.user.id, start, end)).filter((a) => a.id !== ignoreId && !a.allDay);
  const s = startsAt.getTime();
  const e = (endsAt ?? new Date(s + HOUR)).getTime();
  const conflicts = day.filter((a) => {
    const as = new Date(a.startsAt).getTime();
    const ae = a.endsAt ? new Date(a.endsAt).getTime() : as + HOUR;
    return as < e && ae > s;
  });
  return { conflicts, day };
}

/** Horários cheios livres no mesmo dia, perto do pedido. */
function freeSlotsNear(day: SanoAppointment[], startsAt: Date, now: Date) {
  const { start } = localDayBounds(startsAt);
  const busy = day.map((a) => [new Date(a.startsAt).getTime(), a.endsAt ? new Date(a.endsAt).getTime() : new Date(a.startsAt).getTime() + HOUR]);
  const wanted = wallClock(startsAt).hour;
  const slots: Date[] = [];
  for (const offset of [1, -1, 2, -2, 3, 4]) {
    const h = wanted + offset;
    if (h < 7 || h > 21) continue;
    const s = start.getTime() + h * HOUR;
    if (s < now.getTime()) continue;
    if (!busy.some(([bs, be]) => s < be && s + HOUR > bs)) slots.push(new Date(s));
    if (slots.length === 2) break;
  }
  return slots;
}

/* ───────────────────────── criar ───────────────────────── */

const TIME_SUGGESTIONS: Record<Daypart | 'any', string[]> = {
  manha: ['8h', '9h', '10h', '11h'],
  tarde: ['13h', '14h', '15h', '16h'],
  noite: ['18h', '19h', '20h', '21h'],
  any: ['9h', '14h', '19h', 'dia inteiro'],
};

function draftOf(ctx: SanoContext): Extract<PendingAssistantAction, { type: 'draft' }> | null {
  const pending = ctx.memory?.pendingAction;
  return pending?.type === 'draft' && pending.operation !== 'update' ? pending : null;
}

async function create(ctx: SanoContext, req: AgendaRequest): Promise<SanoResult> {
  const draft = draftOf(ctx);
  // Resposta curta a uma pergunta ("sexta", "15h", "dia inteiro") completa o rascunho.
  if (draft && !req.schedule?.title) {
    const dateText = draft.date ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(draft.date)) : '';
    const merged = understandAgenda(`${draft.title} ${dateText} ${ctx.text}`, ctx.now);
    req = {
      ...merged,
      recurrence: merged.recurrence ?? draft.recurrence,
      allDay: merged.allDay ?? draft.allDay,
      location: merged.location ?? draft.location,
      remindMinutes: merged.remindMinutes !== undefined ? merged.remindMinutes : draft.remindBefore ?? undefined,
      schedule: merged.schedule && { ...merged.schedule, participants: merged.schedule.participants ?? draft.participants },
    };
  }
  const parsed = req.schedule!;

  if (parsed.missing === 'title') {
    return {
      reply: variedReply(ctx.user.id, 'agenda:missing-title', [
        'Posso anotar. O que vai na agenda?',
        'Claro — qual é o compromisso?',
        'Anoto sim. É o quê?',
      ]),
      dialog: { pendingAction: null },
    };
  }

  const draftBase = {
    type: 'draft' as const, title: parsed.title, participants: parsed.participants,
    remindBefore: req.remindMinutes ?? parsed.remindBeforeMinutes ?? null,
    location: req.location, allDay: req.allDay, recurrence: req.recurrence,
    createdAt: ctx.now.toISOString(),
  };

  if (parsed.missing === 'date') {
    const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(new Date(ctx.now.getTime() + 2 * DAY)).replace('-feira', '');
    return {
      reply: variedReply(ctx.user.id, 'agenda:missing-date', [
        `Anotei "${parsed.title}". Para qual dia?`,
        `Certo, "${parsed.title}". Quando vai ser?`,
        `"${parsed.title}" — para qual dia eu marco?`,
      ]),
      suggestions: ['hoje', 'amanhã', weekday, 'semana que vem'],
      dialog: { pendingAction: { ...draftBase, date: null } },
    };
  }

  let startsAt = parsed.startsAt;
  let endsAt = parsed.endsAt ?? null;
  const allDay = !!req.allDay || (parsed.missing === 'time' && /anivers|feriado|viagem|ferias|folga/i.test(parsed.title.normalize('NFD').replace(/[̀-ͯ]/g, '')));

  if (parsed.missing === 'time' && !allDay) {
    return {
      reply: variedReply(ctx.user.id, 'agenda:missing-time', [
        `Que horas é "${parsed.title}" ${dayPhrase(parsed.startsAt, ctx.now)}?`,
        `Beleza, ${dayPhrase(parsed.startsAt, ctx.now)}. Que horas?`,
        `Anotei o dia de "${parsed.title}" (${dayPhrase(parsed.startsAt, ctx.now)}). Qual horário?`,
      ]),
      suggestions: TIME_SUGGESTIONS[req.daypart ?? 'any'],
      dialog: { pendingAction: { ...draftBase, date: parsed.startsAt.toISOString() } },
    };
  }
  if (allDay) {
    startsAt = localDayBounds(parsed.startsAt).start;
    endsAt = null;
  }

  // Padrão: 15 min antes — ou na hora, se faltar menos que isso ("me lembra em 20 min").
  const soon = startsAt.getTime() - ctx.now.getTime() < 2 * DEFAULT_REMINDER * MIN;
  const remindBefore = req.remindMinutes !== undefined ? req.remindMinutes
    : parsed.remindBeforeMinutes ?? (allDay ? null : soon ? 0 : DEFAULT_REMINDER);

  const pendingCreate: PendingAssistantAction = {
    type: 'create', title: parsed.title,
    startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null,
    participants: parsed.participants, remindBefore,
    ...(req.location && { location: req.location }),
    ...(allDay && { allDay }),
    ...(req.recurrence && { recurrence: req.recurrence }),
    ...(req.recurrence && req.recurrenceUntil && { recurrenceUntil: req.recurrenceUntil.toISOString() }),
    createdAt: ctx.now.toISOString(),
  };

  if (!allDay) {
    const { conflicts, day } = await conflictsFor(ctx, startsAt, endsAt);
    if (conflicts.length) {
      const slots = freeSlotsNear(day, startsAt, ctx.now);
      const clash = conflicts.map((c) => `${c.title} às ${hm(new Date(c.startsAt))}`).join(' e ');
      return {
        reply: `${dayPhrase(startsAt, ctx.now).replace(/^./, (c) => c.toUpperCase())} você já tem ${clash}. Marco "${parsed.title}" às ${hm(startsAt)} mesmo assim?`,
        view: {
          kind: 'confirmation',
          title: 'Conflito de horário',
          details: [`${parsed.title} · ${whenText({ startsAt, endsAt, allDay }, ctx.now)}`, ...conflicts.map((c) => `Já marcado: ${c.title} · ${hm(new Date(c.startsAt))}`)],
          confirmCommand: 'sim, marca mesmo assim',
          cancelCommand: 'não',
        },
        suggestions: slots.map((s) => `marcar ${parsed.title} ${dayCommand(s, ctx.now)} às ${hm(s)}`),
        dialog: { pendingAction: pendingCreate },
      };
    }
  }

  const saved = await saveNew(ctx.user.id, ctx.deps, pendingCreate as Extract<PendingAssistantAction, { type: 'create' }>);
  return createdResult(ctx.user.id, saved, ctx.now, parsed.assumedDate);
}

async function saveNew(userId: string, deps: SanoDeps, action: Extract<PendingAssistantAction, { type: 'create' | 'update' }>) {
  const agenda = deps.agenda!;
  return agenda.create(userId, {
    title: action.title,
    startsAt: new Date(action.startsAt),
    endsAt: action.endsAt ? new Date(action.endsAt) : undefined,
    participants: action.participants,
    location: action.location,
    allDay: action.allDay,
    remindBefore: action.remindBefore ?? null,
    recurrence: action.recurrence ?? null,
    recurrenceUntil: action.type === 'create' && action.recurrenceUntil ? new Date(action.recurrenceUntil) : null,
  });
}

function createdResult(userId: string, saved: SanoAppointment, now: Date, assumedDate?: boolean): SanoResult {
  const when = whenText(saved, now);
  const extras = [
    saved.recurrence ? `Vai se repetir ${RECURRENCE_LABEL[saved.recurrence as Recurrence]}${untilText(saved, now)}.` : '',
    reminderText(saved.remindBefore) ? `Te aviso ${reminderText(saved.remindBefore)}.` : '',
    assumedDate ? `(Como você não disse o dia, considerei ${dayPhrase(new Date(saved.startsAt), now)}.)` : '',
  ].filter(Boolean).join(' ');
  // Oferece o lembrete que faz sentido para a distância do compromisso.
  const lead = new Date(saved.startsAt).getTime() - now.getTime();
  const remindOption = lead > 2 * DAY && saved.remindBefore !== 1440 ? { label: 'Lembrar 1 dia antes', amount: '1 dia' }
    : lead > 2 * HOUR && saved.remindBefore !== 60 ? { label: 'Lembrar 1h antes', amount: '1 hora' }
    : null;
  return {
    reply: `${variedReply(userId, 'agenda:created', [
      `Pronto, marquei ${saved.title} para ${when}.`,
      `Feito! ${saved.title} está na agenda: ${when}.`,
      `Anotado: ${saved.title}, ${when}.`,
    ])}${extras ? ` ${extras}` : ''}`,
    view: eventView(saved, now, 'created', [
      { label: 'Desfazer', command: 'desfazer' },
      ...(saved.allDay ? [] : [{ label: 'Adiar 1h', command: `adiar ${ref(saved)} 1 hora` }]),
      ...(remindOption ? [{ label: remindOption.label, command: `me lembra ${ref(saved)} ${remindOption.amount} antes` }] : []),
    ]),
    suggestions: ['o que tenho essa semana', 'qual meu próximo compromisso'],
    memory: memoryOf([saved], new Date(saved.startsAt)),
    dialog: {
      pendingAction: null,
      undo: { kind: 'create', id: saved.id, seriesId: saved.seriesId ?? null, title: saved.title },
    },
  };
}

/* ───────────────────────── consultar ───────────────────────── */

function groupByDay(items: SanoAppointment[], now: Date) {
  const days: { label: string; items: { id: string; time: string; title: string; subtitle?: string; tag?: string }[] }[] = [];
  for (const a of items) {
    const label = dayPhrase(new Date(a.startsAt), now);
    let day = days.find((d) => d.label === label);
    if (!day) { day = { label, items: [] }; days.push(day); }
    day.items.push({
      id: a.id,
      time: a.allDay ? 'dia todo' : a.endsAt ? `${hm(new Date(a.startsAt))}–${hm(new Date(a.endsAt))}` : hm(new Date(a.startsAt)),
      title: a.title,
      subtitle: [a.participants && `com ${a.participants}`, a.location].filter(Boolean).join(' · ') || undefined,
      tag: a.recurrence ? '↻' : undefined,
    });
  }
  return days;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const joinList = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`);

function defaultRange(now: Date): AgendaRange {
  return { start: now, end: new Date(localDayBounds(now).start.getTime() + 8 * DAY), label: 'nos próximos 7 dias', singleDay: false };
}

async function list(ctx: SanoContext, req: AgendaRequest): Promise<SanoResult> {
  const agenda = requireAgenda(ctx);
  const range = req.range ?? defaultRange(ctx.now);
  const items = (await agenda.listByDay(ctx.user.id, range.start, range.end))
    .filter((a) => !a.status || a.status === 'PENDING');

  if (!items.length) {
    return {
      reply: variedReply(ctx.user.id, 'agenda:list-empty', [
        `${capitalize(range.label)} você não tem nada marcado.`,
        `Nada na agenda ${range.label}. Tempo livre!`,
        `${capitalize(range.label)} está livre.`,
      ]),
      view: { kind: 'agenda', title: capitalize(range.label), days: [], emptyText: 'Nada marcado.' },
      suggestions: ['qual meu próximo compromisso', range.singleDay ? 'o que tenho essa semana' : 'semana que vem'],
      memory: memoryOf([], range.singleDay ? range.start : undefined),
    };
  }

  const days = groupByDay(items, ctx.now);
  let reply: string;
  if (range.singleDay) {
    const parts = items.slice(0, 4).map((a) => `${a.allDay ? 'o dia todo' : hm(new Date(a.startsAt))} ${a.title}`);
    reply = `${capitalize(range.label)} você tem ${plural(items.length, 'compromisso', 'compromissos')}: ${joinList(parts)}${items.length > 4 ? '…' : '.'}`;
  } else {
    const busiest = [...days].sort((a, b) => b.items.length - a.items.length)[0];
    // Poucos itens: cita todos; muitos: resume e aponta o dia mais cheio.
    const named = items.length <= 4
      ? ` ${joinList(items.map((a) => `${a.title} (${dayPhrase(new Date(a.startsAt), ctx.now)}${a.allDay ? '' : ` ${hm(new Date(a.startsAt))}`})`))}.`
      : '';
    reply = `${capitalize(range.label)}: ${plural(items.length, 'compromisso', 'compromissos')} em ${plural(days.length, 'dia', 'dias')}.${named}${!named && days.length > 1 && busiest.items.length > 1 ? ` O dia mais cheio é ${busiest.label} (${busiest.items.length}).` : ''}`;
  }

  return {
    reply,
    view: { kind: 'agenda', title: capitalize(range.label), days, footer: `${plural(items.length, 'compromisso', 'compromissos')}` },
    suggestions: range.singleDay ? [`tô livre ${range.label}?`, 'o que tenho essa semana'] : ['qual meu próximo compromisso'],
    memory: memoryOf(items, range.singleDay ? range.start : undefined),
  };
}

async function count(ctx: SanoContext, req: AgendaRequest): Promise<SanoResult> {
  const result = await list(ctx, req);
  const range = req.range ?? defaultRange(ctx.now);
  const n = result.view?.kind === 'agenda' ? result.view.days.reduce((s, d) => s + d.items.length, 0) : 0;
  return { ...result, reply: n ? `${capitalize(range.label)} você tem ${plural(n, 'compromisso', 'compromissos')}.` : result.reply };
}

async function next(ctx: SanoContext): Promise<SanoResult> {
  const agenda = requireAgenda(ctx);
  const upcoming = agenda.next
    ? await agenda.next(ctx.user.id, 3)
    : (await agenda.list(ctx.user.id, ctx.now, new Date(ctx.now.getTime() + 60 * DAY)))
      .filter((a) => new Date(a.startsAt) >= ctx.now)
      .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime())
      .slice(0, 3);
  if (!upcoming.length) {
    return { reply: 'Você não tem nenhum compromisso pela frente. Quer marcar algo?', suggestions: ['marcar reunião amanhã às 10h'] };
  }
  const [first, ...rest] = upcoming;
  const tail = rest.length ? ` Depois: ${rest.map((a) => `${a.title} (${whenText(a, ctx.now)})`).join('; ')}.` : '';
  return {
    reply: `Seu próximo compromisso é ${first.title}, ${whenWithRelative(first, ctx.now)}.${tail}`,
    view: eventView(first, ctx.now, 'info', [
      { label: 'Adiar 1h', command: `adiar ${ref(first)} 1 hora` },
      { label: 'Cancelar', command: `cancelar ${ref(first)}` },
    ]),
    suggestions: ['o que tenho essa semana'],
    memory: memoryOf([first]),
  };
}

async function when(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const found = await resolveTarget(ctx, req.term, targetId, 'consultar');
  if ('result' in found) return found.result;
  const a = found.target;
  const repeats = a.recurrence ? ` Ele se repete ${RECURRENCE_LABEL[a.recurrence as Recurrence]}.` : '';
  return {
    reply: `${a.title} é ${whenWithRelative(a, ctx.now)}.${repeats}`,
    view: eventView(a, ctx.now, 'info', [
      { label: 'Adiar 1h', command: `adiar ${ref(a)} 1 hora` },
      { label: 'Lembrar 1 dia antes', command: `me lembra ${ref(a)} 1 dia antes` },
      { label: 'Cancelar', command: `cancelar ${ref(a)}` },
    ]),
    memory: memoryOf([a]),
  };
}

/** Intervalos livres de pelo menos 30 min dentro de [from, to). */
function freeGaps(items: SanoAppointment[], from: number, to: number) {
  const busy = items
    .map((a) => {
      const s = new Date(a.startsAt).getTime();
      return [s, a.endsAt ? new Date(a.endsAt).getTime() : s + HOUR] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s - cursor >= 30 * MIN) gaps.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (to - cursor >= 30 * MIN) gaps.push([cursor, to]);
  return gaps.filter(([s, e]) => e - s >= 30 * MIN);
}

async function free(ctx: SanoContext, req: AgendaRequest): Promise<SanoResult> {
  const agenda = requireAgenda(ctx);
  const range = req.range ?? extractRange('hoje', ctx.now)!;

  if (!range.singleDay) {
    const items = await agenda.listByDay(ctx.user.id, range.start, range.end);
    const days: { label: string; n: number }[] = [];
    for (let t = localDayBounds(range.start).start.getTime(); t < range.end.getTime(); t += DAY) {
      const day = new Date(t + 12 * HOUR);
      const n = items.filter((a) => sameDay(new Date(a.startsAt), day)).length;
      days.push({ label: dayPhrase(day, ctx.now), n });
    }
    const freeDays = days.filter((d) => d.n === 0).map((d) => d.label);
    const busyDays = days.filter((d) => d.n > 0).map((d) => `${d.label} (${d.n})`);
    return {
      reply: freeDays.length
        ? `${capitalize(range.label)} você tem livres: ${joinList(freeDays)}.${busyDays.length ? ` Com compromissos: ${joinList(busyDays)}.` : ''}`
        : `${capitalize(range.label)} todos os dias têm algo marcado: ${joinList(busyDays)}.`,
      view: { kind: 'agenda', title: capitalize(range.label), days: groupByDay(items, ctx.now), emptyText: 'Tudo livre.' },
      memory: memoryOf(items),
    };
  }

  // Um dia: janela do período pedido ou 8h–20h; nunca antes de agora.
  const { start: dayStart } = localDayBounds(range.start);
  const windowStart = Math.max(range.daypart ? range.start.getTime() : dayStart.getTime() + 8 * HOUR, ctx.now.getTime());
  const windowEnd = range.daypart ? range.end.getTime() : dayStart.getTime() + 20 * HOUR;
  const items = (await agenda.listByDay(ctx.user.id, localDayBounds(range.start).start, localDayBounds(range.start).end))
    .filter((a) => !a.allDay)
    .filter((a) => {
      const s = new Date(a.startsAt).getTime();
      const e = a.endsAt ? new Date(a.endsAt).getTime() : s + HOUR;
      return s < windowEnd && e > windowStart;
    });
  const label = capitalize(range.label);

  if (windowStart >= windowEnd) {
    return { reply: `${label} já passou. Quer ver amanhã?`, suggestions: ['tô livre amanhã?'] };
  }
  if (!items.length) {
    return {
      reply: variedReply(ctx.user.id, 'agenda:free', [`${label} você está livre.`, `${label} está tudo livre.`, `Nada marcado ${range.label} — livre.`]),
      suggestions: [`o que tenho ${dayCommand(new Date(windowStart), ctx.now)}`, 'qual meu próximo compromisso'],
      memory: memoryOf([]),
    };
  }
  const gaps = freeGaps(items, windowStart, windowEnd);
  const busyText = joinList(items.map((a) => `${a.title} ${a.endsAt ? `das ${hm(new Date(a.startsAt))} às ${hm(new Date(a.endsAt))}` : `às ${hm(new Date(a.startsAt))}`}`));
  const gapText = gaps.length
    ? ` Fica livre ${joinList(gaps.map(([s, e]) => `das ${hm(new Date(s))} às ${hm(new Date(e))}`))}.`
    : ' Não sobra nenhum intervalo de 30 min.';
  return {
    reply: `${label} você tem ${busyText}.${gapText}`,
    view: { kind: 'agenda', title: label, days: groupByDay(items, ctx.now), footer: gaps.length ? `Livre: ${gaps.map(([s, e]) => `${hm(new Date(s))}–${hm(new Date(e))}`).join(', ')}` : 'Sem intervalos livres' },
    memory: memoryOf(items),
  };
}

/* ───────────────────────── mudar ───────────────────────── */

async function applyUpdate(ctx: SanoContext, current: SanoAppointment, startsAt: Date, reason: string): Promise<SanoResult> {
  const agenda = requireAgenda(ctx);
  // Cópia do estado anterior: o "desfazer" e o "(antes: …)" precisam dele intacto.
  const a: SanoAppointment = { ...current };
  const delta = startsAt.getTime() - new Date(a.startsAt).getTime();
  const endsAt = a.endsAt ? new Date(new Date(a.endsAt).getTime() + delta) : null;
  const { conflicts } = await conflictsFor(ctx, startsAt, endsAt, a.id);
  const saved = await agenda.update(ctx.user.id, a.id, { startsAt, endsAt });
  const after: SanoAppointment = { ...a, ...saved, startsAt, endsAt };
  const warn = conflicts.length ? ` Atenção: bate com ${joinList(conflicts.map((c) => `${c.title} (${hm(new Date(c.startsAt))})`))}.` : '';
  const seriesNote = a.seriesId ? ' Só essa ocorrência mudou; as próximas continuam no horário de sempre.' : '';
  return {
    reply: `${reason} ${a.title} agora é ${whenText(after, ctx.now)} (antes: ${whenText(a, ctx.now)}).${warn}${seriesNote}`,
    view: eventView(after, ctx.now, 'updated', [{ label: 'Desfazer', command: 'desfazer' }]),
    memory: memoryOf([after]),
    dialog: {
      pendingAction: null,
      undo: {
        kind: 'update', id: a.id, title: a.title,
        startsAt: new Date(a.startsAt).toISOString(), endsAt: a.endsAt ? new Date(a.endsAt).toISOString() : null,
        remindBefore: a.remindBefore ?? null,
      },
    },
  };
}

async function reschedule(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const updateDraft = ctx.memory?.pendingAction?.type === 'draft' && ctx.memory.pendingAction.operation === 'update'
    ? ctx.memory.pendingAction
    : null;
  const found = updateDraft?.appointmentId
    ? await resolveTarget(ctx, '', updateDraft.appointmentId, 'mudar')
    : await resolveTarget(ctx, req.term, targetId, 'mudar');
  if ('result' in found) return found.result;
  const a = found.target;

  // Dia e hora direto do extrator: numa resposta curta ("sexta") o parser não
  // tem título e devolve "agora" como data — não serve aqui.
  const folded = ctx.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/:,\s-]/g, ' ');
  const { date: dateHit, time: timeHit } = extractDateTime(folded, ctx.now);
  const parsed = {
    startsAt: dateHit?.hasTime
      ? dateHit.value
      : atWallClock(dateHit?.value ?? ctx.now, timeHit?.hours ?? 0, timeHit?.minutes ?? 0),
  };
  const hasDate = !!dateHit;
  const hasTime = !!timeHit || !!dateHit?.hasTime;
  if (!hasDate && !hasTime) {
    return {
      reply: `Para quando eu passo ${a.title}? Hoje está ${whenText(a, ctx.now)}.`,
      suggestions: ['amanhã', 'sexta', 'às 16h', 'semana que vem'],
      dialog: {
        pendingAction: {
          type: 'draft', operation: 'update', appointmentId: a.id, title: a.title,
          date: null, createdAt: ctx.now.toISOString(),
        },
      },
    };
  }
  const old = new Date(a.startsAt);
  const { hour, minute } = hasTime ? wallClock(parsed.startsAt) : wallClock(old);
  const startsAt = atWallClock(hasDate ? parsed.startsAt : old, hour, minute);
  return applyUpdate(ctx, a, startsAt, variedReply(ctx.user.id, 'agenda:moved', ['Feito:', 'Pronto:', 'Remarcado:']));
}

async function shift(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const found = await resolveTarget(ctx, req.term, targetId, 'adiar');
  if ('result' in found) return found.result;
  const a = found.target;
  const minutes = req.shiftMinutes ?? 60;
  const startsAt = new Date(new Date(a.startsAt).getTime() + minutes * MIN);
  return applyUpdate(ctx, a, startsAt, minutes > 0 ? 'Adiado:' : 'Antecipado:');
}

async function complete(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const found = await resolveTarget(ctx, req.term, targetId, 'concluir');
  if ('result' in found) return found.result;
  const a = found.target;
  await requireAgenda(ctx).update(ctx.user.id, a.id, { status: 'DONE' });
  return {
    reply: variedReply(ctx.user.id, 'agenda:done', [`Boa! Risquei ${a.title} da lista.`, `Feito: ${a.title} saiu dos pendentes.`, `Riscado da lista: ${a.title}.`]),
    view: eventView({ ...a, status: 'DONE' }, ctx.now, 'done', [{ label: 'Desfazer', command: 'desfazer' }]),
    dialog: { undo: { kind: 'complete', id: a.id, title: a.title } },
  };
}

async function remind(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const found = await resolveTarget(ctx, req.term, targetId, 'lembrar');
  if ('result' in found) return found.result;
  const a = { ...found.target };
  const minutes = req.remindMinutes ?? null;
  const saved = await requireAgenda(ctx).update(ctx.user.id, a.id, { remindBefore: minutes });
  const after = { ...a, ...saved, remindBefore: minutes };
  return {
    reply: minutes === null
      ? `Tirei o lembrete de ${a.title}.`
      : `Combinado: te aviso ${reminderText(minutes)} de ${a.title} (${whenText(a, ctx.now)}).`,
    view: eventView(after, ctx.now, 'updated'),
    memory: memoryOf([after]),
    dialog: {
      undo: {
        kind: 'update', id: a.id, title: a.title, startsAt: new Date(a.startsAt).toISOString(),
        endsAt: a.endsAt ? new Date(a.endsAt).toISOString() : null, remindBefore: a.remindBefore ?? null,
      },
    },
  };
}

/* ───────────────────────── cancelar ───────────────────────── */

async function cancel(ctx: SanoContext, req: AgendaRequest, targetId: string | null): Promise<SanoResult> {
  const found = await resolveTarget(ctx, req.term, targetId, 'cancelar');
  if ('result' in found) return found.result;
  const a = found.target;
  const base = {
    type: 'cancel' as const, appointmentId: a.id, title: a.title,
    startsAt: new Date(a.startsAt).toISOString(), createdAt: ctx.now.toISOString(),
  };

  if (a.seriesId) {
    return {
      reply: `${a.title} se repete ${RECURRENCE_LABEL[a.recurrence as Recurrence] ?? ''}. Cancelo só a de ${dayPhrase(new Date(a.startsAt), ctx.now)} ou todas as próximas?`,
      suggestions: ['só essa', 'todas as próximas', 'deixa'],
      dialog: { pendingAction: { ...base, seriesId: a.seriesId } },
      memory: memoryOf([a]),
    };
  }
  return {
    reply: variedReply(ctx.user.id, 'agenda:cancel-confirm', [
      `Vou cancelar "${a.title}" (${whenText(a, ctx.now)}).`,
      `Confere o cancelamento de "${a.title}" (${whenText(a, ctx.now)})?`,
      `Quer mesmo remover "${a.title}", marcado para ${whenText(a, ctx.now)}?`,
    ]),
    view: {
      kind: 'confirmation',
      title: 'Confirmar cancelamento',
      details: [a.title, whenText(a, ctx.now)],
      confirmCommand: 'confirmar',
      cancelCommand: 'não',
    },
    dialog: { pendingAction: base },
    memory: memoryOf([a]),
  };
}

/**
 * "cancelar tudo de amanhã". Apagar vários itens de uma vez é destrutivo:
 * mostra o que seria removido e só executa depois da confirmação.
 */
async function cancelAll(ctx: SanoContext, req: AgendaRequest): Promise<SanoResult> {
  if (!req.range) return { reply: 'Qual dia devo limpar? Diga por exemplo: "cancelar todos os compromissos de amanhã".' };
  const pending = await requireAgenda(ctx).listByDay(ctx.user.id, req.range.start, req.range.end);
  if (!pending.length) return { reply: `Não há compromissos para cancelar ${req.range.label}.` };

  const preview = pending.slice(0, 8).map((a) => `${dayPhrase(new Date(a.startsAt), ctx.now)} ${a.allDay ? '' : hm(new Date(a.startsAt))} — ${a.title}`);
  return {
    reply: variedReply(ctx.user.id, 'agenda:cancel-day-confirm', [
      `Vou cancelar ${plural(pending.length, 'compromisso', 'compromissos')} de ${req.range.label}.`,
      `Confirma o cancelamento de ${plural(pending.length, 'item', 'itens')} da agenda ${req.range.label}?`,
      `Posso remover ${pending.length === 1 ? 'esse compromisso' : `esses ${pending.length} compromissos`} de ${req.range.label}?`,
    ]),
    view: {
      kind: 'confirmation',
      title: 'Confirmar cancelamento',
      details: [...preview, ...(pending.length > 8 ? [`… e mais ${pending.length - 8}`] : [])],
      confirmCommand: 'confirmar',
      cancelCommand: 'não',
    },
    dialog: {
      pendingAction: {
        type: 'cancel-day', startsAt: req.range.start.toISOString(), endsAt: req.range.end.toISOString(),
        count: pending.length, createdAt: ctx.now.toISOString(),
      },
    },
  };
}

/* ───────────────────────── desfazer ───────────────────────── */

async function undo(ctx: SanoContext): Promise<SanoResult> {
  const entry = ctx.memory?.undo;
  const agenda = requireAgenda(ctx);
  if (!entry) return { reply: 'Não tem nada recente para desfazer.' };
  const done = (reply: string): SanoResult => ({ reply, dialog: { undo: null } });

  if (entry.kind === 'create') {
    if (entry.seriesId && agenda.deleteSeries) await agenda.deleteSeries(ctx.user.id, entry.seriesId);
    else if (agenda.remove) await agenda.remove(ctx.user.id, entry.id);
    else await agenda.cancel(ctx.user.id, entry.id);
    return done(`Desfeito: tirei ${entry.title} da agenda.`);
  }
  if (entry.kind === 'update') {
    const saved = await agenda.update(ctx.user.id, entry.id, {
      startsAt: new Date(entry.startsAt), endsAt: entry.endsAt ? new Date(entry.endsAt) : null, remindBefore: entry.remindBefore,
    });
    return { ...done(`Desfeito: ${entry.title} voltou para ${whenText({ ...saved, startsAt: new Date(entry.startsAt), endsAt: entry.endsAt ? new Date(entry.endsAt) : null }, ctx.now)}.`) };
  }
  if (entry.kind === 'cancel') {
    if (entry.seriesId && entry.from && agenda.restoreSeries) await agenda.restoreSeries(ctx.user.id, entry.seriesId, new Date(entry.from));
    else await agenda.update(ctx.user.id, entry.id, { status: 'PENDING' });
    return done(`Desfeito: ${entry.title} voltou para a agenda.`);
  }
  await agenda.update(ctx.user.id, entry.id, { status: 'PENDING' });
  return done(`Desfeito: ${entry.title} voltou a ficar pendente.`);
}

/* ───────────────────────── confirmações pendentes ───────────────────────── */

const undoOfCancel = (id: string, title: string, seriesId?: string, from?: string): UndoEntry =>
  ({ kind: 'cancel', id, title, seriesId: seriesId ?? null, ...(from && { from }) });

/** Executa a ação confirmada ("sim") — chamado pelo roteador. */
export async function executeAgendaPending(
  user: SanoUser,
  action: PendingAssistantAction,
  deps: SanoDeps,
  now: Date,
  scope: 'one' | 'series' = 'one',
): Promise<SanoResponse> {
  const agenda = deps.agenda;
  if (!agenda) throw new Error('O serviço de agenda não está disponível para concluir essa ação.');

  if (action.type === 'create') {
    const saved = await saveNew(user.id, deps, action);
    return { intent: 'agenda', ...createdResult(user.id, saved, now) };
  }

  if (action.type === 'cancel') {
    if (action.seriesId && scope === 'series' && agenda.cancelSeries) {
      const n = await agenda.cancelSeries(user.id, action.seriesId, new Date(action.startsAt));
      return {
        intent: 'agenda',
        reply: `Pronto, cancelei ${action.title} a partir de ${dayPhrase(new Date(action.startsAt), now)} (${plural(n, 'ocorrência', 'ocorrências')}).`,
        view: { kind: 'event', title: action.title, when: `a partir de ${dayPhrase(new Date(action.startsAt), now)}`, details: [], state: 'canceled', actions: [{ label: 'Desfazer', command: 'desfazer' }] },
        dialog: { undo: undoOfCancel(action.appointmentId, action.title, action.seriesId, action.startsAt) },
      };
    }
    await agenda.cancel(user.id, action.appointmentId);
    return {
      intent: 'agenda',
      reply: variedReply(user.id, 'agenda:canceled', [
        `Pronto, cancelei "${action.title}".`,
        `"${action.title}" foi removido da sua agenda.`,
        `Feito — "${action.title}" está cancelado.`,
      ]),
      view: { kind: 'event', title: action.title, when: whenText({ startsAt: new Date(action.startsAt) }, now), details: [], state: 'canceled', actions: [{ label: 'Desfazer', command: 'desfazer' }] },
      dialog: { undo: undoOfCancel(action.appointmentId, action.title) },
    };
  }

  if (action.type === 'cancel-day') {
    const n = await agenda.cancelDay(user.id, new Date(action.startsAt), new Date(action.endsAt));
    return { intent: 'agenda', reply: `Pronto, cancelei ${plural(n, 'compromisso', 'compromissos')}.` };
  }

  if (action.type === 'update' && action.appointmentId) {
    const saved = await agenda.update(user.id, action.appointmentId, {
      startsAt: new Date(action.startsAt),
      endsAt: action.endsAt ? new Date(action.endsAt) : undefined,
      remindBefore: action.remindBefore,
    });
    return {
      intent: 'agenda',
      reply: `"${saved.title}" ficou para ${whenText(saved, now)}.`,
      memory: memoryOf([saved]),
    };
  }
  throw new Error('A ação da agenda ainda precisa de informações antes da confirmação.');
}

/* ───────────────────────── intenção ───────────────────────── */

const TARGET_ID = /#([\w-]{1,64})/;

export const agendaIntent: Intent = {
  name: 'agenda',
  description: 'Compromissos e lembretes',
  examples: ['agendar dentista sexta às 15h', 'o que tenho essa semana', 'qual meu próximo compromisso', 'tô livre amanhã à tarde?'],
  patterns: [
    /\b(agenda|agendar|agende|agendo|compromisso|compromissos|lembrete|lembrar|lembre|lembra|reuniao|reunioes|calendario|marcar|marque|marca|marquei|adicionar|adiciona|adicione|anotar|anote|anota|registrar|registre|registra|cancelar|cancele|cancela|desmarcar|desmarca|desmarque|apagar|apague|remover|remova|remarcar|remarque|remarca|reagendar|reagende|alterar|altere|altera|mudar|muda|marcado|marcada|adia|adiar|adie|antecipa|antecipar|adianta|adiantar|desfaz|desfazer|conclui|concluir)\b/,
    /\b(o que tenho|tenho algo|tem algo|minha agenda|minha semana|quando (e|eh|sera|vai ser)|proximo compromisso|meu proximo|quantos compromissos|to livre|estou livre|tô livre|fico livre|ocupad[oa]|disponivel|tenho que|me avisa)\b/,
    /\b(toda|todo) (segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|semana|mes)\b/,
    /\b(as|a) \d{1,2}( ?h| \d{2}| horas)?\b|\b\d{1,2}h\d{0,2}\b/,
    // "almoço com o João amanhã": substantivo + dia, sem verbo nenhum.
    /^(?!.*\b(treino|treinar|missao|exercicio|musica|tocar|gastei|paguei|recebi)\b).*\b(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d{1,2}|\d{1,2} \d{1,2}|semana que vem|proxima semana)\b/,
  ],
  handle: async (ctx) => {
    const id = TARGET_ID.exec(ctx.text);
    const targetId = id?.[1] ?? null;
    const text = ctx.text.replace(TARGET_ID, ' ').replace(/\s+/g, ' ').trim();
    const local = { ...ctx, text };
    const pending = ctx.memory?.pendingAction;
    const req = understandAgenda(text, ctx.now);

    // Rascunho de remarcação: "sexta" / "16h" completam o "mudar X".
    if (pending?.type === 'draft' && pending.operation === 'update' && (req.act === 'create' || req.act === 'list') && !req.schedule?.title) {
      return reschedule(local, { ...req, act: 'reschedule', schedule: parseSchedule(text, ctx.now, 'create') }, targetId);
    }

    // Rascunho de criação + resposta curta de data ("amanhã", "sexta"): completa o rascunho.
    if (draftOf(ctx) && req.act === 'list' && text.split(/\s+/).length <= 4) return create(local, { ...req, act: 'create', schedule: undefined });

    switch (req.act) {
      case 'undo': return undo(local);
      case 'list': return list(local, req);
      case 'count': return count(local, req);
      case 'next': return next(local);
      case 'when': return when(local, req, targetId);
      case 'free': return free(local, req);
      case 'cancel': return cancel(local, req, targetId);
      case 'cancel_all': return cancelAll(local, req);
      case 'reschedule': return reschedule(local, req, targetId);
      case 'shift': return shift(local, req, targetId);
      case 'complete': return complete(local, req, targetId);
      case 'remind': return remind(local, req, targetId);
      default: return create(local, req);
    }
  },
};
