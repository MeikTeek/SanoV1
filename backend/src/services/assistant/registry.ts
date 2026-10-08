import { normalizeMessage } from './normalize';

export interface IntentDefinition<THandler = unknown> {
  id: string;
  module: string;
  patterns: (string | RegExp)[];
  entities?: string[];
  handler: THandler;
  threshold?: number;
}

export interface IntentMatch<THandler = unknown> {
  intent: IntentDefinition<THandler>;
  score: number;
  ambiguousWith?: IntentDefinition<THandler>;
}

export function createIntentRegistry<THandler = unknown>() {
  const definitions = new Map<string, IntentDefinition<THandler>>();
  return {
    registerIntent(definition: IntentDefinition<THandler>): IntentDefinition<THandler> {
      if (!definition.id.trim() || !definition.module.trim() || !definition.patterns.length) {
        throw new Error('Intenções precisam de id, módulo e ao menos um padrão.');
      }
      definitions.set(definition.id, definition);
      return definition;
    },
    listIntents(): IntentDefinition<THandler>[] {
      return [...definitions.values()];
    },
    detectIntent(text: string): IntentMatch<THandler> | null {
      return detectIntent(text, [...definitions.values()]);
    },
  };
}

export function registerIntent<THandler>(definition: IntentDefinition<THandler>): IntentDefinition<THandler> {
  return defaultRegistry.registerIntent(definition) as IntentDefinition<THandler>;
}

export function listRegisteredIntents<THandler = unknown>(): IntentDefinition<THandler>[] {
  return defaultRegistry.listIntents() as IntentDefinition<THandler>[];
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function scorePattern(text: string, pattern: string | RegExp): number {
  if (typeof pattern !== 'string') {
    pattern.lastIndex = 0;
    return pattern.test(text) ? 4 : 0;
  }
  const phrase = normalizeMessage(pattern);
  if (!phrase) return 0;
  if (text.includes(phrase)) return Math.min(4, 1 + phrase.split(' ').length);
  const tokens = text.split(' ');
  const phraseTokens = phrase.split(' ');
  const hits = phraseTokens.filter((word) => tokens.some((token) => {
    if (token === word) return true;
    return word.length >= 4 && levenshtein(token, word) <= Math.max(1, Math.floor(word.length / 4));
  })).length;
  return hits ? (hits / phraseTokens.length) * Math.min(3, phraseTokens.length) : 0;
}

export function detectIntent<THandler>(
  text: string,
  definitions: IntentDefinition<THandler>[],
): IntentMatch<THandler> | null {
  const normalized = normalizeMessage(text);
  const scored = definitions
    .map((intent) => ({
      intent,
      score: Math.max(0, ...intent.patterns.map((pattern) => scorePattern(normalized, pattern))),
    }))
    .filter(({ intent, score }) => score >= (intent.threshold ?? 1.5))
    .sort((left, right) => right.score - left.score);

  if (!scored.length) return null;
  return {
    intent: scored[0].intent,
    score: scored[0].score,
    ambiguousWith: scored[1] && scored[0].score - scored[1].score < 0.75 ? scored[1].intent : undefined,
  };
}

const defaultRegistry = createIntentRegistry();
