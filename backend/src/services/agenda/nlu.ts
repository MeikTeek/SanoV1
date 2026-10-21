/**
 * Entende pedidos de agenda em português: o que o usuário quer (criar,
 * consultar, mover, adiar, cancelar, concluir…) e sobre o quê.
 *
 * Divide o trabalho com `parse.ts`: aqui ficam a CLASSIFICAÇÃO, os intervalos
 * ("essa semana", "quinta à tarde"), a recorrência e o termo de busca; lá fica
 * a extração de título/participantes/horário para criar. Puro e testável.
 */
import { dateAtLocalTime, extractDateTime, localDate, localDayBounds, localParts } from '../assistant/dateTime';
import { parseSchedule, type ParsedSchedule } from './parse';
import { nextOccurrence, type Recurrence } from './recurrence';

export type AgendaAct =
  | 'create' | 'list' | 'next' | 'when' | 'free' | 'count'
  | 'cancel' | 'cancel_all' | 'reschedule' | 'shift' | 'complete' | 'remind' | 'undo';

export type Daypart = 'manha' | 'tarde' | 'noite';

export interface AgendaRange {
  start: Date;
  end: Date;
  /** Para a resposta: "amanhã", "essa semana", "quinta à tarde". */
  label: string;
  /** Um dia só (lista com horário) ou vários (lista agrupada por dia). */
  singleDay: boolean;
  daypart?: Daypart;
}

export interface AgendaRequest {
  act: AgendaAct;
  /** Busca do compromisso alvo ("dentista"); vazio = "esse"/último citado. */
  term: string;
  range?: AgendaRange;
  /** Extração completa para criar (e data/hora novas para remarcar). */
  schedule?: ParsedSchedule;
  /** A frase tem dia e/ou horário explícitos (para remarcar só o que foi dito). */
  hasDate: boolean;
  hasTime: boolean;
  recurrence?: Recurrence;
  /** "até 20/12": fim da série (inclusive). Sem isso, a série não termina. */
  recurrenceUntil?: Date;
  allDay?: boolean;
  daypart?: Daypart;
  location?: string;
  /** Adiar/antecipar: minutos (negativo = antecipar). */
  shiftMinutes?: number;
  /** Lembrete pedido: minutos antes; null = "sem lembrete". */
  remindMinutes?: number | null;
}

/* ───────────────────────── utilitários ───────────────────────── */

/** Minúsculo, sem acento e sem pontuação, com o MESMO comprimento do original. */
export function fold(input: string): string {
  let out = '';
  for (const ch of input) {
    const c = (ch.normalize('NFD')[0] ?? ch).toLowerCase();
    out += /[a-z0-9/:,-]/.test(c) ? c : ' ';
  }
  return out;
}

const DAY = 86_400_000;
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DAYPART_HOURS: Record<Daypart, [number, number]> = { manha: [6, 12], tarde: [12, 18], noite: [18, 24] };
const DAYPART_LABEL: Record<Daypart, string> = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };

const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, dez: 10, quinze: 15, vinte: 20, trinta: 30, meia: 0.5 };

function amountToMinutes(n: string, unit: string): number {
  const value = /^\d+$/.test(n) ? Number(n) : NUMBER_WORDS[n] ?? 1;
  if (unit.startsWith('min')) return Math.round(value);
  if (unit.startsWith('h')) return Math.round(value * 60);
  if (unit.startsWith('dia')) return Math.round(value * 1440);
  if (unit.startsWith('semana')) return Math.round(value * 7 * 1440);
  return Math.round(value);
}

const AMOUNT = '(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|dez|quinze|vinte|trinta|meia)\\s*(minutos?|min|horas?|h|dias?|semanas?)';

function dayLabel(date: Date, now: Date): string {
  const key = (d: Date) => { const p = localParts(d); return `${p.year}-${p.month}-${p.day}`; };
  if (key(date) === key(now)) return 'hoje';
  if (key(date) === key(new Date(now.getTime() + DAY))) return 'amanhã';
  if (key(date) === key(new Date(now.getTime() + 2 * DAY))) return 'depois de amanhã';
  const diff = (date.getTime() - now.getTime()) / DAY;
  const text = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', ...(diff > 6 || diff < 0 ? { day: 'numeric', month: 'numeric' } : {}),
  }).format(date);
  return text.replace('-feira', '');
}

/* ───────────────────────── intervalos ───────────────────────── */

function detectDaypart(f: string): Daypart | undefined {
  // Exige a preposição: "manha" solto é quase sempre o fim de "amanha".
  if (/\b(de|pela|na|da|essa|esta|nesta|nessa) manha\b/.test(f)) return 'manha';
  if (/\b(a|de|pela|na|da|essa|esta|nesta|nessa|hoje a|amanha a) tarde\b|\bfim da tarde\b/.test(f)) return 'tarde';
  if (/\b(a|de|pela|na|da|essa|esta|nesta|nessa|hoje a|amanha a) noite\b|\bhoje a noite\b/.test(f)) return 'noite';
  return undefined;
}

/** "essa semana", "semana que vem", "esse mês", "fim de semana", "próximos 3 dias" ou um dia. */
export function extractRange(text: string, now: Date): AgendaRange | undefined {
  const f = fold(text);
  const today = localParts(now);
  const startOfDay = (offset: number) => dateAtLocalTime(localDate(today.year, today.month, today.day + offset));
  const daypart = detectDaypart(f);

  if (/\b(essa|esta|nessa|nesta) semana\b|\bsemana atual\b|\bminha semana\b/.test(f)) {
    const toSunday = (7 - today.weekday) % 7;
    return { start: now, end: startOfDay(toSunday + 1), label: 'essa semana', singleDay: false };
  }
  if (/\b(semana que vem|proxima semana|semana seguinte)\b/.test(f)) {
    const toMonday = ((8 - today.weekday) % 7) || 7;
    return { start: startOfDay(toMonday), end: startOfDay(toMonday + 7), label: 'semana que vem', singleDay: false };
  }
  if (/\b(fim de semana|final de semana|fds)\b/.test(f)) {
    const toSaturday = today.weekday === 0 ? -1 : (6 - today.weekday);
    const start = toSaturday <= 0 ? now : startOfDay(toSaturday);
    return { start, end: startOfDay(toSaturday + 2), label: 'no fim de semana', singleDay: false };
  }
  if (/\b(esse|este|nesse|neste) mes\b|\bmes atual\b/.test(f)) {
    return { start: now, end: dateAtLocalTime(localDate(today.year, today.month + 1, 1)), label: 'esse mês', singleDay: false };
  }
  if (/\b(mes que vem|proximo mes)\b/.test(f)) {
    return {
      start: dateAtLocalTime(localDate(today.year, today.month + 1, 1)),
      end: dateAtLocalTime(localDate(today.year, today.month + 2, 1)),
      label: 'mês que vem', singleDay: false,
    };
  }
  const nextDays = /\bproxim[oa]s (\d{1,2}) dias\b/.exec(f);
  if (nextDays) return { start: now, end: startOfDay(Number(nextDays[1]) + 1), label: `nos próximos ${nextDays[1]} dias`, singleDay: false };

  const { date } = extractDateTime(f, now);
  const base = date?.value ?? (daypart || /\b(agora|hoje)\b/.test(f) ? now : undefined);
  if (!base) return undefined;
  const bounds = localDayBounds(base);
  let start = bounds.start;
  let end = bounds.end;
  let label = dayLabel(base, now);
  if (daypart) {
    const [h0, h1] = DAYPART_HOURS[daypart];
    start = new Date(bounds.start.getTime() + h0 * 3_600_000);
    end = new Date(bounds.start.getTime() + h1 * 3_600_000);
    label = `${label} ${DAYPART_LABEL[daypart]}`;
  }
  return { start, end, label, singleDay: true, daypart };
}

/* ───────────────────────── recorrência / extras ───────────────────────── */

interface Extras {
  text: string; recurrence?: Recurrence; recurrenceUntil?: Date; allDay?: boolean; location?: string; remindMinutes?: number | null;
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * "até 20/12", "até dia 15", "até 3 de março", "até dezembro" → fim desse dia
 * (ou do último dia do mês). Só faz sentido junto de uma recorrência.
 */
function untilDate(phrase: string, now: Date): Date | undefined {
  const month = MONTH_NAMES.indexOf(phrase.replace(/^(o )?(fim|final) de /, '').trim());
  if (month >= 0) {
    const today = localParts(now);
    const year = month < today.month ? today.year + 1 : today.year;
    return localDayBounds(localDate(year, month + 1, 0)).end; // dia 0 do mês seguinte = último dia
  }
  const { date } = extractDateTime(phrase, now);
  return date ? localDayBounds(date.value).end : undefined;
}

/** Tira da frase o que não é título/data comum, trocando por algo que o parser entende. */
function extractExtras(text: string, now: Date): Extras {
  let out = text;
  const out2 = () => fold(out);
  const replace = (re: RegExp, by: (m: RegExpExecArray) => string) => {
    const m = re.exec(out2());
    if (!m) return null;
    out = out.slice(0, m.index) + by(m) + out.slice(m.index + m[0].length);
    return m;
  };
  const extras: Extras = { text };

  // Local explícito: "local: Rua X", "@ Escritório", "no endereço Y".
  const place = /(?:\s+@\s*|\b(?:local|lugar|endereco)\s*:?\s+)([^,;]+)$/i.exec(out);
  if (place) {
    extras.location = place[1].trim().slice(0, 200);
    out = out.slice(0, place.index);
  }

  if (replace(/\bsem (lembrete|aviso|notificacao)\b/, () => ' ')) extras.remindMinutes = null;
  const remind = replace(new RegExp(`\\b(?:(?:me |com )?(?:lembr\\w*|avis\\w*|lembrete|notific\\w*)\\s+(?:de\\s+)?)?${AMOUNT}\\s+antes\\b`), (m) => {
    extras.remindMinutes = amountToMinutes(m[1], m[2]);
    return ' ';
  });
  if (!remind && replace(/\b(?:me )?(?:lembr\w*|avis\w*) na hora\b/, () => ' ')) extras.remindMinutes = 0;

  if (replace(/\b(o dia (todo|inteiro)|dia inteiro|o dia todo)\b/, () => ' ')) extras.allDay = true;
  // O período ("de manhã") vira pergunta de horário com sugestões; não é título.
  replace(/\b(de|pela|na|a|essa|esta|nesta|nessa) (manha|tarde|noite)\b/, () => ' ');

  // Se hoje já é o dia pedido, começa hoje: o parser leria "quarta" (numa quarta) como a da semana que vem.
  const weekly = replace(/\btod[oa]s? (?:as |os )?(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?(?:-feiras?)?\b/,
    (m) => (WEEKDAY_NAMES.indexOf(m[1]) === localParts(now).weekday ? ' hoje ' : ` ${m[1]} `));
  if (weekly) extras.recurrence = 'WEEKLY';
  else if (replace(/\b(dias uteis|de segunda a sexta|segunda a sexta)\b/, () => ' ')) extras.recurrence = 'WEEKDAYS';
  else if (replace(/\b(todo dia|todos os dias|diariamente|todo santo dia)\b(?! \d)/, () => ' ')) extras.recurrence = 'DAILY';
  else if (replace(/\b(toda semana|todas as semanas|semanalmente)\b/, () => ' ')) extras.recurrence = 'WEEKLY';
  else if (replace(/\btodo dia (\d{1,2})\b/, (m) => ` dia ${m[1]} `)) extras.recurrence = 'MONTHLY';
  else if (replace(/\b(todo mes|todos os meses|mensalmente)\b/, () => ' ')) extras.recurrence = 'MONTHLY';
  else if (replace(/\b(todo ano|todos os anos|anualmente)\b/, () => ' ')) extras.recurrence = 'YEARLY';

  if (extras.recurrence) {
    replace(/\bate (?:o |a )?((?:dia )?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?|\d{1,2} de [a-z]+(?: de \d{4})?|(?:o )?(?:fim|final) de [a-z]+|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/, (m) => {
      extras.recurrenceUntil = untilDate(m[1], now);
      return ' ';
    });
  }

  extras.text = out.replace(/\s+/g, ' ').trim();
  return extras;
}

/* ───────────────────────── termo de busca ───────────────────────── */

const TARGET_VERBS = /\b(cancelar|cancele|cancela|apagar|apague|apaga|remover|remova|remove|desmarcar|desmarque|desmarca|excluir|exclua|exclui|deletar|deleta|tirar|tira|tire|mudar|muda|mude|alterar|altera|altere|remarcar|remarca|remarque|reagendar|reagenda|reagende|passar|passa|passe|transferir|transfere|mover|move|trocar|troca|adiar|adia|adie|atrasar|atrasa|atrase|empurrar|empurra|antecipar|antecipa|antecipe|adiantar|adianta|adiante|conclui|concluir|concluido|concluida|terminei|finalizei|fiz|feito|feita|quando|que horas|que dia|qual|horario|hora|dia|e|eh|sera|vai ser|ficou|marquei|tenho|lembra|lembre|lembrar|me|avisa|avise|como|marcar|marca|marque|da agenda|na agenda)\b/g;
const TARGET_FILLER = /\b(o|a|os|as|um|uma|meu|minha|meus|minhas|do|da|dos|das|de|pra|pras|pros|para|pro|por|em|no|na|com|que|ja|ai|isso|essa|esse|esta|este|aquele|aquela|ela|ele|ultimo|ultima|so|apenas|compromisso|evento|agendamento|lembrete)\b/g;

/** "muda o dentista pra sábado" → "dentista". Remove verbos, datas, horas e conectivos. */
export function extractTerm(text: string, now: Date): string {
  const f = fold(text);
  const { date, time } = extractDateTime(f, now);
  const spans = [date?.span, time?.span].filter((s): s is { start: number; end: number } => !!s);
  let t = f.split('').map((ch, i) => (spans.some((s) => i >= s.start && i < s.end) ? ' ' : ch)).join('');
  t = t
    .replace(new RegExp(`\\b(em|por|para|pra)?\\s*${AMOUNT}(\\s+(antes|depois|mais tarde|mais cedo))?\\b`, 'g'), ' ')
    .replace(/\b(todos?|todas?|tudo|mais tarde|mais cedo|como (feito|feita|concluid[oa]))\b/g, ' ')
    .replace(/\b(hoje|amanha|depois de amanha|semana que vem|proxima semana)\b/g, ' ')
    .replace(TARGET_VERBS, ' ')
    .replace(TARGET_FILLER, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/* ───────────────────────── classificação ───────────────────────── */

const UNDO = /^(desfaz|desfazer|desfaca|desfaz isso|desfazer isso|volta atras|voltar atras|nao era isso|errei|desfaz o ultimo|desfaz a ultima)$/;
const CANCEL = /\b(cancelar|cancele|cancela|apagar|apague|apaga|remover|remova|remove|desmarcar|desmarque|desmarca|excluir|exclua|exclui|deletar|deleta|tira(r)? da agenda)\b/;
const ALL = /\b(todos|todas|tudo|inteira|inteiro)\b/;
const SHIFT = /\b(adia|adiar|adie|atrasa|atrasar|atrase|empurra|empurrar|antecipa|antecipar|antecipe|adianta|adiantar|adiante)\b/;
const EARLIER = /\b(antecipa|antecipar|antecipe|adianta|adiantar|adiante|mais cedo)\b/;
const RESCHEDULE = /\b(mudar|muda|mude|alterar|altera|altere|remarcar|remarca|remarque|reagendar|reagenda|reagende|passar|passa|passe|transferir|transfere|mover|move|trocar|troca)\b/;
const COMPLETE = /\b(conclui|concluir|terminei|finalizei|ja fiz|ja foi)\b|\bcomo (feito|feita|concluid[oa]|realizad[oa])\b/;
const NEXT = /\b(proxim[oa]s? (compromisso|evento|reuniao|tarefa|agendamento)s?|o que (vem|tenho) (agora|depois|a seguir|em seguida|daqui a pouco)|qual (e )?(o )?meu proximo|tenho algo agora|o que vem agora)\b/;
const WHEN = /\b(quando (e|eh|sera|vai ser|e que e|tenho|marquei|ficou|foi marcad[oa])|que (horas|dia) (e|eh|sera|vai ser|ficou|marquei|tenho|foi)|qual (o )?(dia|horario|hora) d[aeo])\b/;
const FREE = /\b(livre|livres|disponivel|disponiveis|desocupad[oa]s?|ocupad[oa]s?|tenho tempo|horarios? vagos?|horarios? livres?|brecha)\b/;
const COUNT = /\bquant[oa]s (compromissos|eventos|reunioes|coisas|agendamentos)\b/;
const LIST = /\b(o que tenho|que tenho|tenho algo|tem algo|tenho alguma coisa|tem alguma coisa|minha agenda|meus compromissos|quais (sao )?(os )?(meus )?compromissos|listar|lista|mostra|mostrar|mostre|ver (a |minha )?agenda|como (esta|ta|fica) (minha|a) (agenda|semana|dia)|agenda (de|da|do|para|pra)|programacao|o que rola|abre a agenda|abrir agenda)\b|^agenda$|^compromissos$/;
const CREATE = /\b(agendar|agende|agendo|agenda|criar|crie|cria|marcar|marque|marca|marquei|coloca|coloque|bota|boto|poe|lembrar|lembre|lembra|anote|anota|anotar|adiciona|adicione|adicionar|inclui|incluir|cadastrar|cadastra|registrar|registre|tenho que|preciso)\b/;
const REMIND_ONLY = new RegExp(`\\b${AMOUNT}\\s+antes\\b|\\bsem lembrete\\b|\\bna hora\\b`);

export function understandAgenda(text: string, now: Date): AgendaRequest {
  const f = fold(text).replace(/\s+/g, ' ').trim().replace(/^(?:(?:ei|oi|ok|sano)[ ,]+)+/, '');
  // "1 hora antes" é antecedência de lembrete, não horário.
  const { date, time } = extractDateTime(f.replace(new RegExp(`\\b${AMOUNT}\\s+antes\\b`, 'g'), ' '), now);
  const base = { term: '', hasDate: !!date, hasTime: !!time || !!date?.hasTime };

  if (UNDO.test(f)) return { ...base, act: 'undo' };

  if (CANCEL.test(f)) {
    if (ALL.test(f)) return { ...base, act: 'cancel_all', range: extractRange(text, now) };
    return { ...base, act: 'cancel', term: extractTerm(text, now) };
  }
  if (COMPLETE.test(f)) return { ...base, act: 'complete', term: extractTerm(text, now) };

  if (SHIFT.test(f)) {
    const amount = new RegExp(AMOUNT).exec(f);
    const term = extractTerm(text, now);
    if (amount) {
      const minutes = amountToMinutes(amount[1], amount[2]);
      return { ...base, act: 'shift', term, shiftMinutes: EARLIER.test(f) ? -minutes : minutes };
    }
    return { ...base, act: 'reschedule', term, schedule: parseSchedule(text, now, 'create') };
  }
  if (RESCHEDULE.test(f) && !/\b(marcar|marca|marque) (um|uma|o|a)? ?(novo|nova)\b/.test(f)) {
    return { ...base, act: 'reschedule', term: extractTerm(text, now), schedule: parseSchedule(text, now, 'create') };
  }

  // Lembrete para algo já marcado: "me lembra do dentista 1 dia antes", "sem lembrete na reunião".
  if (REMIND_ONLY.test(f) && !time && !date && !CREATE.test(f.replace(/\b(lembr\w*|avis\w*|me)\b/g, ''))) {
    const extras = extractExtras(text, now);
    return { ...base, act: 'remind', term: extractTerm(extras.text, now), remindMinutes: extras.remindMinutes };
  }

  if (NEXT.test(f)) return { ...base, act: 'next' };
  if (WHEN.test(f)) return { ...base, act: 'when', term: extractTerm(text, now) };
  if (FREE.test(f)) return { ...base, act: 'free', range: extractRange(text, now), daypart: detectDaypart(f) };
  if (COUNT.test(f)) return { ...base, act: 'count', range: extractRange(text, now) };

  // "agenda" é verbo em "agenda reunião amanhã", mas substantivo em "minha agenda".
  const creating = CREATE.test(f.replace(/\b(minha|a|da|na|ver|abre|abrir|abra|mostra|mostrar|mostre|sua|consultar|consulta) agenda\b/g, ' '));
  if (!creating && (LIST.test(f) || /^(e )?(hoje|amanha|depois de amanha|essa semana|semana que vem|fim de semana)$/.test(f))) {
    return { ...base, act: 'list', range: extractRange(text, now) };
  }

  const extras = extractExtras(text, now);
  const schedule = parseSchedule(extras.text, now, 'create');
  // Série nunca começa no passado: "toda quarta às 8h" numa quarta às 13h vai para
  // a próxima quarta; "todo dia 5" no dia 5, depois do horário, para o mês seguinte.
  if (extras.recurrence && !schedule.missing && schedule.startsAt.getTime() <= now.getTime()) {
    const next = nextOccurrence(schedule.startsAt, extras.recurrence, localParts(schedule.startsAt).day);
    const delta = next.getTime() - schedule.startsAt.getTime();
    schedule.startsAt = next;
    if (schedule.endsAt) schedule.endsAt = new Date(schedule.endsAt.getTime() + delta);
    schedule.assumedDate = false;
  }
  return {
    ...base,
    act: 'create',
    schedule,
    recurrence: extras.recurrence,
    recurrenceUntil: extras.recurrenceUntil,
    allDay: extras.allDay,
    location: extras.location,
    remindMinutes: extras.remindMinutes,
    daypart: detectDaypart(f),
  };
}

export { DAYPART_HOURS, DAYPART_LABEL, WEEKDAY_NAMES, dayLabel };
