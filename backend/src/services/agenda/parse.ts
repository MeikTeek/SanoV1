/**
 * Interpretação de frases de agenda ("agendar reunião com João amanhã às 14h").
 *
 * Ideia central: `fold()` produz uma versão minúscula, sem acentos e sem
 * pontuação **com o mesmo comprimento do texto original** (1 caractere → 1
 * caractere). Assim os índices de qualquer regex casada sobre o texto dobrado
 * valem para o texto original, e o título guardado sai com a grafia correta
 * ("Reunião", não "Reuniao") sem dicionário de acentos.
 *
 * É puro e determinístico: sem IA e sem banco — barato e testável. Se um dia
 * entrar LLM, o ponto de troca é o intent 'agenda' em services/sano/intents.ts.
 */
import { extractDateTime, localDayBounds } from '../assistant/dateTime';

export interface ParsedSchedule {
  action: 'create' | 'list' | 'cancel' | 'cancel_all' | 'update';
  title: string;
  participants?: string;
  /** Início em UTC. */
  startsAt: Date;
  endsAt?: Date;
  /** No `cancel_all`: o dia inteiro a ser limpo, do primeiro ao último minuto. */
  dayStart?: Date;
  dayEnd?: Date;
  /** No `cancel_all`: o usuário já confirmou ("pode cancelar", "confirmo"). */
  confirmed?: boolean;
  /** Minutos de antecedência do lembrete, quando pedido. */
  remindBeforeMinutes?: number;
  /** Motivo da recusa, quando a frase não tem título ou data utilizável. */
  missing?: 'title' | 'date' | 'time';
}

export interface Span { start: number; end: number }

/** Fuso local (Brasil). Datas "wall clock" são resolvidas em São Paulo e gravadas em UTC. */
/**
 * Minúsculo, sem acento e sem pontuação — **preservando o comprimento**.
 * A decomposição NFD + descarte dos diacríticos garante 1 caractere por caractere.
 * `/`, `-` e `:` são mantidos porque fazem parte dos padrões de data e hora.
 */
function fold(input: string): string {
  let out = '';
  for (const ch of input) {
    const base = ch.normalize('NFD')[0] ?? ch;
    const c = base.toLowerCase();
    out += /[a-z0-9/:,-]/.test(c) ? c : ' ';
  }
  return out;
}

/** Remove do texto original os trechos mapeados pelo texto dobrado. */
function cutOut(original: string, spans: Span[]): string {
  const keep = new Set<number>();
  for (const s of spans) for (let i = s.start; i < s.end; i++) keep.add(i);
  let out = '';
  for (let i = 0; i < original.length; i++) if (!keep.has(i)) out += original[i];
  return out;
}

/** Ajusta a base (meio-dia local) para a hora pedida. */
const atLocal = (base: Date, h: number, m: number) => {
  const bounds = localDayBounds(base);
  return new Date(bounds.start.getTime() + (h * 60 + m) * 60_000);
};

const spanOf = (m: RegExpExecArray): Span => ({ start: m.index, end: m.index + m[0].length });

/* --------------------------------- ação --------------------------------- */

const CREATE_WORDS = /\b(agendar|agende|agendo|criar|crie|marcar|marque|coloca|coloque|lembrar|lembre|lembra|anote|anota|cadastrar|registrar|registre)\b/;
const LIST_WORDS = /\b(quais|listar|lista|listagem|mostrar|mostre|ver|tenho|minha agenda|tem algo|marcado|marcada|o que tenho)\b/;
const OPEN_AGENDA_WORDS = /\b(abre|abrir|abra|acessar|acessa|consultar|consulta|ver|mostrar|mostra|ir para|ir ao)\b/;
const AGENDA_NOUNS = /\b(agenda|calendario|compromissos?)\b/;
const CANCEL_WORDS = /\b(cancelar|cancele|cancela|apagar|apague|remover|remova)\b/;
const UPDATE_WORDS = /\b(mudar|muda|alterar|altere|altera|remarcar|remarque|reagendar|reagende)\b/;

const detectAction = (t: string): ParsedSchedule['action'] => {
  if (UPDATE_WORDS.test(t) && !CANCEL_WORDS.test(t)) return 'update';
  if (CANCEL_WORDS.test(t)) return ALL_WORDS.test(t) ? 'cancel_all' : 'cancel';
  const listing = LIST_WORDS.test(t)
    || /^\s*agenda\s*$/.test(t)
    || (OPEN_AGENDA_WORDS.test(t) && AGENDA_NOUNS.test(t));
  return listing && !CREATE_WORDS.test(t) ? 'list' : 'create';
};

/** "todos/tudo/todas" transforma o cancelamento em limpeza do dia. */
const ALL_WORDS = /\b(todos|todas|tudo|inteira|inteiro|completo|completa)\b/;

/** Confirmação explícita exigida antes de apagar vários compromissos. */
const CONFIRM_WORDS = /\b(confirmo|confirmar|pode cancelar|pode sim|autorizo|vai|pode|sim)\b/;

type DateHit = { startsAt: Date; span: Span; hasTime?: boolean };
type TimeHit = { hours: number; minutes: number; span: Span };

function resolveDate(t: string, now: Date): DateHit | null {
  const date = extractDateTime(t, now).date;
  return date ? { startsAt: date.value, span: date.span, hasTime: date.hasTime } : null;
}

function resolveTime(t: string): TimeHit | null {
  return extractDateTime(t, new Date()).time;
}

/* --------------------------------- lembrete --------------------------------- */

/**
 * "me lembre 15 minutos antes" → 15; "com lembrete de 1 hora" → 60.
 * O teto é por unidade: 15 minutos é normal, 15 horas já parece horário.
 */
function resolveReminder(t: string): { minutes?: number; span?: Span } {
  const m = /\b(?:me\s+)?lembre(?:te)?\s+(?:de\s+)?(\d{1,4})\s*(minuto|minutos|min|hora|horas|h|dia|dias)\b/.exec(t);
  if (m) {
    const n = Number(m[1]);
    const u = m[2];
    const minutes = u.startsWith('min') ? (n <= 720 ? n : undefined)
      : u.startsWith('hora') || u === 'h' ? (n <= 72 ? n * 60 : undefined)
      : n <= 30 ? n * 1440 : undefined;
    return { minutes, span: { start: m.index, end: t.length } };
  }

  const when = /\b(?:me\s+)?lembre(?:te)?\s+(?:quando|na\s+hora)\b/.exec(t);
  if (when) return { minutes: 0, span: { start: when.index, end: t.length } };

  return {};
}
/* ------------------------------ montagem final ------------------------------ */

/** Ruído de comando que nunca faz parte do título. "de/do/da" ficam de fora: são comuns em títulos ("Aula de História"). */
const NOISE = /\b(por favor|favor|por gentileza|entao|nao|preciso|quero|um|uma|novo|nova|meu|minha|ate|pra|para|proxim[ao])\b/gi;

const TITLE_TRIM = /\b(agendar|agende|agendo|criar|crie|marcar|marque|coloca|coloque|lembrar|lembre|lembra|anote|anota|cadastrar|registrar|registre|mudar|muda|alterar|altere|altera|remarcar|remarque|reagendar|reagende)\b/gi;

function tidy(s: string): string {
  const cleaned = s
    .replace(/\b(?:na|pela|para a) agenda\b/gi, ' ')
    .replace(/\b(?:me lembra(?:r)?|me avisa|por favor|por gentileza)\b/gi, ' ')
    .replace(TITLE_TRIM, ' ')
    .replace(/^\s*de\s+/i, ' ')
    .replace(NOISE, ' ')
    .replace(/\b(?:de|do|da)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

/**
 * Ponto de entrada. `now` é injetável para testes determinísticos.
 * `text` é o texto ORIGINAL digitado, com acentos.
 */
export function parseSchedule(text: string, now: Date = new Date()): ParsedSchedule {
  const f = fold(text);
  const action = detectAction(f);

  if (action === 'list') {
    const date = resolveDate(f, now);
    const bounds = date ? localDayBounds(date.startsAt) : undefined;
    return {
      action,
      title: '',
      startsAt: date?.startsAt ?? new Date(now),
      ...(bounds && { dayStart: bounds.start, dayEnd: bounds.end }),
    };
  }

  if (action === 'cancel' || action === 'cancel_all') {
    // Em "list" o título não importa; em "cancel" ele É o termo de busca
    // ("cancelar reunião com João" → procurar "reuniao").
    // "cancelar todos os compromissos de amanhã" → limpeza do dia inteiro.
    if (action === 'cancel_all') {
      const day = resolveDate(f, now);
      if (!day) {
        return { action, title: '', startsAt: new Date(now), missing: 'date' };
      }
      const start = atLocal(day.startsAt, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60_000); // [00:00, 24:00)
      return { action, title: '', startsAt: start, dayStart: start, dayEnd: end, confirmed: CONFIRM_WORDS.test(f) };
    }

    // `fold` preserva comprimento, então o índice vale para o texto original.
    const verb = /\b(cancelar|cancele|apagar|apague|remover|remova)\b/.exec(f);
    let term = verb ? text.slice(verb.index + verb[0].length) : text;
    // "com João" é participante, não parte do termo de busca.
    const com = /\bcom\s+/.exec(fold(term));
    if (com) term = term.slice(0, com.index);
    return { action, title: tidy(term), startsAt: new Date(now) };
  }

  const dateHit = resolveDate(f, now);
  const timeHit = resolveTime(f);
  const reminder = resolveReminder(f);

  // Participantes: do "com" até o fim, tirando data/hora/lembrete.
  const withCom = /\bcom\s+(?!(?:o\s+)?(?:time|equipe|grupo|pessoal|todo mundo)\b)/.exec(f);
  // "das 14h às 15h30" tem precedência sobre o horário solto, e o título precisa
  // cortar o intervalo inteiro — não só a primeira hora.
  const range = /\b(?:das|de|as)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:as|ate)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\b/.exec(f);
  const timeSpan = range ? spanOf(range) : timeHit?.span;

  let participants: string | undefined;
  if (withCom) {
    const from = withCom.index + withCom[0].length; // início do nome, no texto dobrado
    // Converte os trechos para índices relativos à cauda "com ...".
    const rel = [dateHit?.span, timeSpan, reminder.span]
      .filter((s): s is Span => Boolean(s) && s!.start >= from)
      .map((s) => ({ start: s.start - from, end: s.end - from }));
    participants = tidy(cutOut(text.slice(from), rel)) || undefined;
  }

  // Título: original menos data, hora, participantes e lembrete.
  const title = tidy(cutOut(text, [
    dateHit?.span,
    timeSpan,
    reminder.span,
    withCom ? { start: withCom.index, end: text.length } : undefined,
  ].filter((s): s is Span => Boolean(s))));

  if (!title) return { action, title: '', startsAt: new Date(now), missing: 'title' };
  if (!dateHit) return { action, title, participants, startsAt: new Date(now), missing: 'date' };

  let startsAt: Date;
  let endsAt: Date | undefined;
  if (range && Number(range[1]) <= 23 && Number(range[3]) <= 23) {
    startsAt = atLocal(dateHit.startsAt, Number(range[1]), range[2] ? Number(range[2]) : 0);
    endsAt = atLocal(dateHit.startsAt, Number(range[3]), range[4] ? Number(range[4]) : 0);
    if (endsAt <= startsAt) endsAt = undefined; // fim antes do início: melhor ignorar
  } else if (dateHit.hasTime) {
    startsAt = dateHit.startsAt; // "em 10 minutos": a hora já veio resolvida
  } else {
    if (!timeHit) return { action, title, participants, startsAt: dateHit.startsAt, missing: 'time' };
    startsAt = atLocal(dateHit.startsAt, timeHit.hours, timeHit.minutes);
  }

  return { action, title, participants, startsAt, endsAt, remindBeforeMinutes: reminder.minutes };
}