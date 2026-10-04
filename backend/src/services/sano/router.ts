import { createHelpIntent, baseIntents } from './intents';
import { normalize, stripWakeWord } from './normalize';
import { loadMemory, saveMemory, type SanoMemory } from './context.service';
import { interpretUnknown } from './interpret';
import type { Intent, SanoDeps, SanoResponse, SanoUser } from './types';

const help = createHelpIntent(() => intents);
export const intents: Intent[] = [help, ...baseIntents];

export function matchIntent(normalized: string): Intent | null {
  return intents.find((i) => i.patterns.some((p) => p.test(normalized))) ?? null;
}

/**
 * Referencia a conversa anterior: "e amanhã?", "cancela essa", "e depois?".
 *
 * Reescreve o texto para uma frase completa que a intenção anterior entende.
 * Devolve null quando a frase não depende do histórico — assim o roteador
 * normal segue o fluxo sem custo.
 */
export function resolveContinuation(normalized: string, memory: SanoMemory): string | null {
  if (!normalized) return null;

  // "e amanhã?" / "e o dia seguinte?" — pergunta de período, não comando.
  const period = /^(?:e\s+)?(?:o\s+)?(?:dia\s+)?(depois|amanha|anteontem|hoje|essa\s+semana|proxima\s+semana|semana\s+que\s+vem)\b/.exec(normalized);
  if (period && (memory.lastIntent === 'agenda' || memory.lastIntent === 'briefing')) {
    return `mostrar agenda ${period[1]}`;
  }

  // "cancela essa" / "apaga essa" — precisa da última lista na memória.
  if (/^(e\s+)?(cancela|apaga|remove|apagar|delete)\s+(essa|esse|o\s+ultimo|a\s+ultima)(.*)$/.test(normalized)) {
    const last = memory.lastAppointments[memory.lastAppointments.length - 1];
    return last ? `cancelar ${last.title}` : null;
  }

  // "confirma" / "pode cancelar" — retoma um pedido de confirmação pendente.
  if (/^(pode|confirma|confirmo|pode\s+cancelar|isso|essa\s+essa)$/.test(normalized)) {
    if (memory.lastIntent === 'agenda') return `cancelar todos os compromissos de ${memory.focusDay ?? 'hoje'}, pode cancelar`;
  }

  return null;
}

/**
 * Ponto de entrada do Sano.
 *
 * Ordem: memória → regra → IA. O código resolve primeiro (rápido e previsível);
 * a IA só entra quando nada casa, para converter frase livre em uma das
 * intenções existentes. A IA nunca executa nada por conta própria.
 */
export async function handleCommand(
  user: SanoUser,
  text: string,
  deps: SanoDeps,
  now: Date = new Date(),
): Promise<SanoResponse> {
  const memory = await loadMemory(user.id);
  let normalized = stripWakeWord(normalize(text));

  // 1) Conversa com referência ao turno anterior.
  const continuation = resolveContinuation(normalized, memory);
  if (continuation) normalized = continuation;

  // 2) Regra determinística.
  let intent = matchIntent(normalized);

  // 3) IA como interpretador (não como executor).
  if (!intent) {
    const catalog = intents
      .filter((i) => !i.hidden)
      .map((i) => ({ name: i.name, description: i.description, example: i.examples[0] ?? '' }));
    const guessed = await interpretUnknown(normalized, text, catalog, intents.map((i) => i.name));
    if (guessed) intent = matchIntent(guessed);
  }

  if (!intent) {
    return {
      intent: 'unknown',
      reply: 'Não entendi essa frase ainda. Tente "ajuda" — ou pergunte direto ("como faço flexão?").',
    };
  }
  if (intent.adminOnly && user.role !== 'ADMIN') {
    return { intent: intent.name, reply: 'Acesso negado: comando restrito a administradores.' };
  }

  const result = await intent.handle({ user, text, normalized, now, deps, memory });

  // Atualiza a memória com o que foi exibido, para o próximo turno.
  const appts = result.memory?.appointments;
  if (appts?.length) {
    await saveMemory(user.id, {
      lastIntent: intent.name,
      lastAppointments: appts.map((a) => ({ id: a.id, title: a.title, startsAt: new Date(a.startsAt).toISOString() })),
      focusDay: result.memory?.focusDay ?? memory.focusDay,
    });
  } else if (intent.name !== 'greeting') {
    await saveMemory(user.id, { lastIntent: intent.name });
  }

  return { intent: intent.name, ...result };
}