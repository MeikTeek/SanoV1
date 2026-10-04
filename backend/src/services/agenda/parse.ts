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

export interface ParsedSchedule {
  action: 'create' | 'list' | 'cancel' | 'cancel_all';
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
  missing?: 'title' | 'date';
}

export interface Span { start: number; end: number }

/** Fuso local (Brasil). Datas "wall clock" são resolvidas em São Paulo e gravadas em UTC. */
const TZ_OFFSET_MIN = -180; // America/Sao_Paulo não observa DST desde 2019

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

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

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monta um Date UTC a partir de hora/data locais de São Paulo. */
const fromLocal = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, d, h, min) - TZ_OFFSET_MIN * 60_000);

/** Ajusta a base (meio-dia local) para a hora pedida. */
const atLocal = (base: Date, h: number, m: number) => {
  const local = new Date(base.getTime() + TZ_OFFSET_MIN * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - TZ_OFFSET_MIN * 60_000);
};

const spanOf = (m: RegExpExecArray): Span => ({ start: m.index, end: m.index + m[0].length });

/* --------------------------------- ação --------------------------------- */

const CREATE_WORDS = /\b(agendar|agende|agendo|criar|crie|marcar|marque|lembrar|lembre|anote|anota|cadastrar|registrar|registre)\b/;
const LIST_WORDS = /\b(quais|listar|lista|listagem|mostrar|mostre|ver|tenho|minha agenda)\b/;
const CANCEL_WORDS = /\b(cancelar|cancele|apagar|apague|remover|remova)\b/;

const detectAction = (t: string): ParsedSchedule['action'] => {
  if (CANCEL_WORDS.test(t)) return ALL_WORDS.test(t) ? 'cancel_all' : 'cancel';
  return LIST_WORDS.test(t) && !CREATE_WORDS.test(t) ? 'list' : 'create';
};

/** "todos/tudo/todas" transforma o cancelamento em limpeza do dia. */
const ALL_WORDS = /\b(todos|todas|tudo|inteira|inteiro|completo|completa)\b/;

/** Confirmação explícita exigida antes de apagar vários compromissos. */
const CONFIRM_WORDS = /\b(confirmo|confirmar|pode cancelar|pode sim|autorizo|vai|pode|sim)\b/;
/* ---------------------------------- data ---------------------------------- */

interface DateHit { startsAt: Date; span: Span; /** Datas relativas ("em 10 minutos") já têm hora — não pode ser sobrescrita. */ hasTime?: boolean }

function resolveDate(t: string, now: Date): DateHit | null {
  const today = startOfDay(now);
  const at = (d: Date, m: RegExpExecArray): DateHit => ({
    startsAt: fromLocal(d.getFullYear(), d.getMonth(), d.getDate()),
    span: spanOf(m),
  });
  const shifted = (days: number, m: RegExpExecArray) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return at(d, m);
  };

  // Ordem importa: "depois de amanhã" contém "amanhã".
  const depois = /\bdepois\s+de\s+amanha\b/.exec(t);
  if (depois) return shifted(2, depois);

  const hoje = /\bhoje\b/.exec(t);
  if (hoje) return shifted(0, hoje);

  const amanha = /\bamanha\b/.exec(t);
  if (amanha) return shifted(1, amanha);

  // "daqui a 2 horas" / "em 3 dias"
  const rel = /\b(?:daqui a|em)\s+(\d{1,2})\s*(hora|horas|dia|dias|minuto|minutos)\b/.exec(t);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date(now);
    if (rel[2].startsWith('min')) d.setMinutes(d.getMinutes() + n);
    else if (rel[2].startsWith('hora')) d.setHours(d.getHours() + n);
    else d.setDate(d.getDate() + n);
    return { startsAt: d, span: spanOf(rel), hasTime: true };
  }

  // "sexta", "proxima segunda"
  const wd = /\b(?:(proxim[ao])\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.exec(t);
  if (wd) {
    const d = new Date(today);
    let delta = (WEEKDAYS[wd[2]] - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "sexta" numa sexta = a próxima
    d.setDate(d.getDate() + delta);
    return at(d, wd);
  }

  // "15/10/2026"
  const br = /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/.exec(t);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    let year = br[3] ? Number(br[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!br[3] && d.getTime() < startOfDay(now).getTime()) d.setFullYear(year + 1);
    return at(d, br);
  }

  // "dia 15 de outubro"
  const long = /\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/.exec(t);
  if (long && MONTHS[long[2]] !== undefined) {
    const year = long[3] ? Number(long[3]) : now.getFullYear();
    return { startsAt: fromLocal(year, MONTHS[long[2]], Number(long[1])), span: spanOf(long) };
  }

  // "dia 15" (sem mês) — próximo dia do mês corrente
  const onlyDay = /\bdia\s+(\d{1,2})\b/.exec(t);
  if (onlyDay) {
    const d = new Date(now.getFullYear(), now.getMonth(), Number(onlyDay[1]));
    if (d.getTime() < startOfDay(now).getTime()) d.setMonth(d.getMonth() + 1);
    return at(d, onlyDay);
  }

  return null;
}

/* ---------------------------------- hora ---------------------------------- */

interface TimeHit { hours: number; minutes: number; span: Span }

function resolveTime(t: string): TimeHit | null {
  // "14h", "14:30", "14h30", "às 14h", "as 9" — a preposição entra no casamento
  // para não sobrar um "às" órfão no título ou nos participantes.
  const re = /\b(?:as|à|ao)?\s*(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/;
  const hm = re.exec(t);
  if (hm && Number(hm[1]) <= 23) {
    return { hours: Number(hm[1]), minutes: hm[2] ? Number(hm[2]) : 0, span: spanOf(hm) };
  }

  // "as 9" sem sufixo de hora
  const bare = /\b(?:as|à|ao)\s+(\d{1,2})\b/.exec(t);
  if (bare && Number(bare[1]) <= 23) {
    return { hours: Number(bare[1]), minutes: 0, span: spanOf(bare) };
  }

  return null;
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
const NOISE = /\b(por favor|favor|por gentileza|entao|nao|preciso|quero|um|uma|novo|nova|meu|minha|com|ate|proxim[ao])\b/gi;

const TITLE_TRIM = /\b(agendar|agende|agendo|criar|crie|marcar|marque|lembrar|lembre|anote|anota|cadastrar|registrar|registre)\b/gi;

function tidy(s: string): string {
  const cleaned = s
    .replace(TITLE_TRIM, ' ')
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

  if (action !== 'create') {
    // Em "list" o título não importa; em "cancel" ele É o termo de busca
    // ("cancelar reunião com João" → procurar "reuniao").
    if (action === 'list') return { action, title: '', startsAt: new Date(now) };

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
  const withCom = /\bcom\s+/.exec(f);
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
    startsAt = timeHit ? atLocal(dateHit.startsAt, timeHit.hours, timeHit.minutes) : atLocal(dateHit.startsAt, 9, 0);
  }

  return { action, title, participants, startsAt, endsAt, remindBeforeMinutes: reminder.minutes };
}