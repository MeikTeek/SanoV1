import { createHelpIntent, baseIntents } from './intents';
import { normalize, stripWakeWord } from './normalize';
import { loadMemory, saveMemory, type SanoMemory } from './context.service';
import type { Intent, SanoDeps, SanoResponse, SanoUser } from './types';
import { detectIntent, listRegisteredIntents } from '../assistant/registry';
import { normalizeMessage } from '../assistant/normalize';
import { classifyDialogReply, classifySeriesScope, type PendingAssistantAction } from '../assistant/dialog';
import { socialResponse, unknownResponse, variedReply } from '../assistant/recovery';
import { recordLearningPhrase } from '../assistant/learning';
import { registerSanoIntents } from '../assistant/intents';
import { agendaIntent, executeAgendaPending } from './intents/schedule';
import { failureMessage } from './ai.errors';
import { fillsDraft, scheduleEvidence, wantsToDropDraft } from './agendaGate';

const help = createHelpIntent(() => intents);
export const intents: Intent[] = [help, ...baseIntents];
registerSanoIntents(intents);

export function matchIntent(normalized: string): Intent | null {
  return matchIntentScored(normalized)?.intent ?? null;
}

/** Abaixo disso o casamento veio da tolerância a erros, não de uma regra explícita. */
const CONFIDENT_SCORE = 3;

function matchIntentScored(normalized: string): { intent: Intent; score: number } | null {
  const match = detectIntent(normalized, listRegisteredIntents<Intent>());
  return match ? { intent: match.intent.handler, score: match.score } : null;
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
  const period = /^(?:e\s+)?(?:na\s+|no\s+)?(?:o\s+)?((?:dia\s+)?\d{1,2}|depois|amanha|anteontem|hoje|essa\s+semana|proxima\s+semana|semana\s+que\s+vem|segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/.exec(normalized);
  if (period && (memory.lastIntent === 'agenda' || memory.lastIntent === 'briefing')) {
    return `mostrar agenda ${period[1]}`;
  }

  // "cancela essa" / "apaga essa" — precisa da última lista na memória.
  if (/^(e\s+)?(cancela|apaga|remove|apagar|delete)\s+(essa|esse|o\s+ultimo|a\s+ultima)(.*)$/.test(normalized)) {
    const last = memory.lastAppointments[memory.lastAppointments.length - 1];
    return last ? `cancelar ${last.title}` : null;
  }

  if (/^(muda|mudar|altera|alterar)\s+(pra|para)\s+\d{1,2}(?:h|:\d{2})?$/.test(normalized)
    && memory.lastIntent === 'agenda') {
    const last = memory.lastAppointments[memory.lastAppointments.length - 1];
    if (last) {
      const at = new Date(last.startsAt);
      const day = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(at);
      return `alterar ${last.title} para ${day} ${normalized.replace(/^(muda|mudar|altera|alterar)\s+(pra|para)\s+/, 'as ')}`;
    }
  }

  if (/^(de novo|novamente|repete|repetir)$/.test(normalized)) {
    if (memory.lastIntent === 'agenda') {
      const lastAppointment = memory.lastAppointments[memory.lastAppointments.length - 1];
      const lastDate = memory.focusDay
        ?? (lastAppointment ? localDateKey(new Date(lastAppointment.startsAt)) : null);
      return `mostrar agenda ${lastDate ? lastDate.split('-').reverse().join('/') : 'hoje'}`;
    }
    if (memory.lastIntent === 'briefing') return 'resumo do dia';
    if (memory.lastIntent === 'treino') return 'meu treino';
    if (memory.lastIntent === 'status') return 'status do sistema';
    if (memory.lastIntent === 'time') return 'que horas são';
  }

  return null;
}

const PENDING_TTL_MS = 15 * 60_000;
const localDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

function pendingIsFresh(action: PendingAssistantAction, now: Date): boolean {
  const createdAt = Date.parse(action.createdAt);
  const age = now.getTime() - createdAt;
  return Number.isFinite(createdAt) && age >= 0 && age <= PENDING_TTL_MS;
}

/** A confirmação ("sim") executa a ação guardada; a lógica vive no módulo da agenda. */
function executePendingAction(
  user: SanoUser,
  action: PendingAssistantAction,
  deps: SanoDeps,
  now: Date,
  scope: 'one' | 'series' = 'one',
): Promise<SanoResponse> {
  return executeAgendaPending(user, action, deps, now, scope);
}

/** Comandos que o navegador resolve sozinho (player de música). */
const CLIENT_COMMANDS: { name: string; description: string; examples: string[] }[] = [
  { name: 'musica', description: 'tocar, pausar e mudar o volume das músicas do usuário', examples: ['tocar favoritas', 'tocar Coldplay', 'pausar música', 'aumentar volume'] },
];
const CLIENT_COMMAND = /^(?:tocar|toque|reproduzir|pausar|pausa|pause|aumentar|diminuir|subir|baixar)\b/;

/** A frase parece conversa, não compromisso: pergunta antes de abrir um rascunho. */
function askIfAgenda(user: SanoUser, text: string): SanoResponse {
  return {
    intent: 'agenda-confirm',
    reply: variedReply(user.id, 'agenda:is-it-schedule', [
      'Isso é um compromisso para a agenda ou só estamos conversando?',
      'Quer que eu anote isso na agenda, ou foi só um comentário?',
      'Não tenho certeza se isso é para a agenda. Quer que eu anote?',
    ]),
    view: { kind: 'actions', title: 'Agenda', items: [{ label: 'Anotar na agenda', command: `anotar ${text.trim()}` }] },
  };
}

/**
 * Sem regra que entenda a frase e com chave configurada: a IA reescreve como
 * comando (que roda aqui, com as confirmações de sempre) ou conversa.
 * Devolve null para seguir o "não entendi" normal.
 */
async function askAi(
  user: SanoUser,
  text: string,
  deps: SanoDeps,
  now: Date,
  /** false quando ainda existe uma regra de reserva: falhas ficam em silêncio. */
  reportFailure = true,
): Promise<SanoResponse | null> {
  if (!deps.ai) return null;
  const catalog = [
    ...intents
      .filter((i) => !i.hidden && !i.planned && (!i.adminOnly || user.role === 'ADMIN'))
      .map((i) => ({ name: i.name, description: i.description, examples: i.examples })),
    ...CLIENT_COMMANDS,
  ];
  const outcome = await deps.ai({ text, now, catalog });
  if (!outcome) return null;

  if (!outcome.ok && outcome.reason === 'client') {
    return { intent: 'ai-pending', reply: '', aiRequest: { messages: outcome.messages } };
  }
  if (!outcome.ok) {
    // Falha passageira com regra de reserva: segue em silêncio. Problema de
    // configuração (chave, cota, bloqueio) aparece sempre, senão nunca é corrigido.
    const transient = outcome.reason === 'unavailable' || outcome.reason === 'rate' || outcome.reason === 'local';
    if (!reportFailure && transient) return null;
    return { intent: 'unknown', ...unknownResponse(user, text), reply: failureMessage(outcome) };
  }

  if ('reply' in outcome) return { intent: 'ai', reply: outcome.reply };

  const command = normalizeMessage(normalize(outcome.command));
  if (CLIENT_COMMAND.test(command)) {
    return { intent: 'ai', reply: '', actions: [{ type: 'run', command: outcome.command }] };
  }
  // A IA às vezes transforma desabafo em "anotar ...". Se a frase original não
  // tem nada de agenda (verbo, dia ou hora), pergunta em vez de abrir rascunho.
  if (matchIntent(command)?.name === 'agenda' && scheduleEvidence(text, now) === 'none') {
    return askIfAgenda(user, text);
  }
  // Sem `ai` no segundo passe: uma tradução que ainda não casa não volta à IA.
  const result = await handleCommand(user, outcome.command, { ...deps, ai: undefined }, now);
  return result.intent === 'unknown' ? null : result;
}

/**
 * Ponto de entrada do Sano.
 *
 * Ordem: memória → regra determinística → IA do usuário (opcional) →
 * recuperação conversacional. As regras nunca dependem de IA; ela só entra
 * quando nenhuma entendeu a frase e o usuário cadastrou a própria chave.
 */
export async function handleCommand(
  user: SanoUser,
  text: string,
  deps: SanoDeps,
  now: Date = new Date(),
): Promise<SanoResponse> {
  let memory = await loadMemory(user.id);
  let normalized = stripWakeWord(normalizeMessage(normalize(text)));
  let pending = memory.pendingAction && pendingIsFresh(memory.pendingAction, now)
    ? memory.pendingAction
    : null;
  if (memory.pendingAction && !pending) {
    await saveMemory(user.id, { pendingAction: null });
    if (classifyDialogReply(normalized) !== 'other') {
      return {
        intent: 'agenda',
        reply: 'Essa confirmação expirou para evitar uma alteração fora de hora. Posso preparar o compromisso novamente quando você quiser.',
        view: { kind: 'actions', title: 'Agenda', items: [{ label: 'Ver agenda', command: 'minha agenda' }] },
      };
    }
  }
  if (pending?.type === 'draft') {
    const decision = classifyDialogReply(normalized);
    if (decision === 'cancel') {
      await saveMemory(user.id, { pendingAction: null });
      return { intent: 'agenda', reply: 'Tudo bem, descartei esse rascunho; nada foi salvo.' };
    }
    if (decision === 'confirm') {
      return {
        intent: 'agenda',
        reply: pending.date
          ? `Só falta o horário de "${pending.title}". Que horas?`
          : `Só falta a data de "${pending.title}". Para qual dia?`,
      };
    }
    if (wantsToDropDraft(normalized)) {
      await saveMemory(user.id, { pendingAction: null });
      return { intent: 'agenda', reply: `Sem problema, não anotei "${pending.title}".` };
    }
    // Não respondeu à pergunta (nem data, nem horário): era outro assunto.
    // O rascunho cai e a frase segue o fluxo normal.
    if (!fillsDraft(text, now)) {
      await saveMemory(user.id, { pendingAction: null });
      memory = { ...memory, pendingAction: null };
      pending = null;
    }
  }

  // 1) Conversa com referência ao turno anterior.
  const continuation = pending ? null : resolveContinuation(normalized, memory);
  let effectiveText = continuation ?? text;
  if (continuation) normalized = stripWakeWord(normalizeMessage(continuation));

  const social = socialResponse(user, normalized);
  if (social) return { intent: 'greeting', ...social };

  if (pending && pending.type !== 'draft') {
    // Ocorrência de série: "só essa" / "todas as próximas" também respondem.
    const scope = pending.type === 'cancel' && pending.seriesId ? classifySeriesScope(normalized) : null;
    const decision = scope ? 'confirm' : classifyDialogReply(normalized);
    if (decision === 'confirm') {
      const result = await executePendingAction(user, pending, deps, now, scope ?? 'one');
      await saveMemory(user.id, {
        lastIntent: 'agenda',
        ...(result.memory?.appointments && {
          lastAppointments: result.memory.appointments.map((item) => ({
            id: item.id, title: item.title, startsAt: new Date(item.startsAt).toISOString(),
          })),
          focusDay: localDateKey(new Date(result.memory.appointments[0].startsAt)),
        }),
        ...result.dialog,
        pendingAction: null,
      });
      const { memory: _memory, dialog: _dialog, ...publicResult } = result;
      return publicResult;
    }
    if (decision === 'cancel') {
      await saveMemory(user.id, { pendingAction: null });
      return {
        intent: 'agenda',
        reply: variedReply(user.id, 'agenda:confirmation-canceled', [
          'Tudo bem, não fiz nenhuma alteração.',
          'Certo, deixei a agenda como estava.',
          'Combinado — nada foi salvo nem removido.',
        ]),
      };
    }
  }

  // 2) Regras determinísticas e referências de preenchimento de dados.
  const scored = matchIntentScored(normalized);
  let intent = scored?.intent ?? null;
  // Com IA: casamento fraco ("qual a capital da austrália" → agenda) ou dúvida
  // livre vão primeiro para ela; se a IA falhar, a regra segue valendo.
  if (intent && !pending && deps.ai && (scored!.score < CONFIDENT_SCORE || intent.name === 'pergunta')) {
    const viaAi = await askAi(user, text, deps, now, false);
    if (viaAi) return viaAi;
  }
  // Regra explícita de agenda, mas a frase só cita um dia no meio de uma conversa.
  if (intent?.name === 'agenda' && !pending && scored!.score >= CONFIDENT_SCORE) {
    const evidence = scheduleEvidence(text, now);
    if (evidence !== 'strong') {
      const viaAi = deps.ai ? await askAi(user, text, deps, now, false) : null;
      if (viaAi) return viaAi;
      if (evidence === 'weak') return askIfAgenda(user, text);
      intent = null;
    }
  }
  if (pending?.type === 'draft' && !intent) intent = agendaIntent;
  if (pending?.type === 'draft' && intent?.name === 'agenda') {
    effectiveText = text;
  }

  if (!intent) {
    const viaAi = await askAi(user, text, deps, now);
    if (viaAi) return viaAi;
    await recordLearningPhrase(user.id, text, 7);
    return { intent: 'unknown', ...unknownResponse(user, text) };
  }
  if (intent.adminOnly && user.role !== 'ADMIN') {
    return { intent: intent.name, reply: 'Esse painel fica disponível apenas para administradores.' };
  }

  if (intent.planned) {
    await recordLearningPhrase(user.id, text, 5);
  } else if (/^(agenda|treino|perfil|admin|ajustes|musica)$/.test(normalized)) {
    await recordLearningPhrase(user.id, text, 4);
  }
  const result = await intent.handle({ user, text: effectiveText, normalized, now, deps, memory });

  // Atualiza a memória com o que foi exibido, para o próximo turno.
  const { dialog, memory: responseMemory, ...publicResult } = result;
  const appts = responseMemory?.appointments;
  if (appts?.length) {
    await saveMemory(user.id, {
      lastIntent: intent.name,
      lastAppointments: appts.map((a) => ({ id: a.id, title: a.title, startsAt: new Date(a.startsAt).toISOString() })),
      focusDay: responseMemory?.focusDay ?? memory.focusDay,
      ...dialog,
    });
  } else if (intent.name !== 'greeting' || dialog) {
    await saveMemory(user.id, { lastIntent: intent.name, ...dialog });
  }

  return { intent: intent.name, ...publicResult };
}