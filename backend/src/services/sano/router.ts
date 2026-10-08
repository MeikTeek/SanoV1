import { createHelpIntent, baseIntents } from './intents';
import { normalize, stripWakeWord } from './normalize';
import { loadMemory, saveMemory, type SanoMemory } from './context.service';
import type { Intent, SanoDeps, SanoResponse, SanoUser } from './types';
import { detectIntent, listRegisteredIntents } from '../assistant/registry';
import { normalizeMessage } from '../assistant/normalize';
import { classifyDialogReply, type PendingAssistantAction } from '../assistant/dialog';
import { socialResponse, unknownResponse, variedReply } from '../assistant/recovery';
import { recordLearningPhrase } from '../assistant/learning';
import { registerSanoIntents } from '../assistant/intents';
import { agendaIntent } from './intents/agenda';

const help = createHelpIntent(() => intents);
export const intents: Intent[] = [help, ...baseIntents];
registerSanoIntents(intents);

export function matchIntent(normalized: string): Intent | null {
  const match = detectIntent(normalized, listRegisteredIntents<Intent>());
  return match?.intent.handler ?? null;
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

async function executePendingAction(
  user: SanoUser,
  action: PendingAssistantAction,
  deps: SanoDeps,
): Promise<SanoResponse> {
  const agenda = deps.agenda;
  if (!agenda) throw new Error('O serviço de agenda não está disponível para concluir essa ação.');

  if (action.type === 'create') {
    const saved = await agenda.create(user.id, {
      title: action.title,
      startsAt: new Date(action.startsAt),
      endsAt: action.endsAt ? new Date(action.endsAt) : undefined,
      participants: action.participants,
      remindBefore: action.remindBefore ?? null,
    });
    return {
      intent: 'agenda',
      reply: variedReply(user.id, 'agenda:created', [
        `Pronto, ${saved.title} está na agenda para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
        `Anotado! ${saved.title} ficou marcado para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
        `Fechado: ${saved.title} foi agendado para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
      ]),
      actions: [{ type: 'navigate', to: '/agenda' }],
      memory: { appointments: [{ id: saved.id, title: saved.title, startsAt: saved.startsAt }] },
    };
  }

  if (action.type === 'cancel') {
    await agenda.cancel(user.id, action.appointmentId);
    return {
      intent: 'agenda',
      reply: variedReply(user.id, 'agenda:canceled', [
        `Pronto, cancelei "${action.title}".`,
        `"${action.title}" foi removido da sua agenda.`,
        `Feito — "${action.title}" está cancelado.`,
      ]),
      actions: [{ type: 'navigate', to: '/agenda' }],
    };
  }

  if (action.type === 'cancel-day') {
    const count = await agenda.cancelDay(user.id, new Date(action.startsAt), new Date(action.endsAt));
    return {
      intent: 'agenda',
      reply: `Pronto, cancelei ${count} ${count === 1 ? 'compromisso' : 'compromissos'} desse dia.`,
      actions: [{ type: 'navigate', to: '/agenda' }],
    };
  }

  if (action.type === 'draft') {
    throw new Error('A ação da agenda ainda precisa de informações antes da confirmação.');
  }
  if (action.type !== 'update') {
    throw new Error('Tipo de ação pendente não é compatível com atualização.');
  }
  if (!action.appointmentId) throw new Error('A alteração pendente não tem compromisso associado.');
  const saved = await agenda.update(user.id, action.appointmentId, {
    title: action.title,
    startsAt: new Date(action.startsAt),
    endsAt: action.endsAt ? new Date(action.endsAt) : undefined,
    participants: action.participants,
    remindBefore: action.remindBefore,
  });
  return {
    intent: 'agenda',
    reply: variedReply(user.id, 'agenda:updated', [
      `Atualizei "${saved.title}" para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
      `"${saved.title}" ficou remarcado para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
      `Feito — a nova data de "${saved.title}" é ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(saved.startsAt)}.`,
    ]),
    actions: [{ type: 'navigate', to: '/agenda' }],
    memory: { appointments: [{ id: saved.id, title: saved.title, startsAt: saved.startsAt }] },
  };
}

/**
 * Ponto de entrada do Sano.
 *
 * Ordem: memória → regra determinística → recuperação conversacional.
 * A classificação e a extração nunca dependem de IA ou rede externa.
 */
export async function handleCommand(
  user: SanoUser,
  text: string,
  deps: SanoDeps,
  now: Date = new Date(),
): Promise<SanoResponse> {
  const memory = await loadMemory(user.id);
  let normalized = stripWakeWord(normalizeMessage(normalize(text)));
  const pending = memory.pendingAction && pendingIsFresh(memory.pendingAction, now)
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
  }

  // 1) Conversa com referência ao turno anterior.
  const continuation = pending ? null : resolveContinuation(normalized, memory);
  let effectiveText = continuation ?? text;
  if (continuation) normalized = stripWakeWord(normalizeMessage(continuation));

  const social = socialResponse(user, normalized);
  if (social) return { intent: 'greeting', ...social };

  if (pending && pending.type !== 'draft') {
    const decision = classifyDialogReply(normalized);
    if (decision === 'confirm') {
      const result = await executePendingAction(user, pending, deps);
      await saveMemory(user.id, {
        lastIntent: 'agenda',
        ...(result.memory?.appointments && {
          lastAppointments: result.memory.appointments.map((item) => ({
            id: item.id, title: item.title, startsAt: new Date(item.startsAt).toISOString(),
          })),
          focusDay: localDateKey(new Date(result.memory.appointments[0].startsAt)),
        }),
        pendingAction: null,
      });
      const { memory: _memory, ...publicResult } = result;
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
  let intent = matchIntent(normalized);
  if (pending?.type === 'draft' && !intent) intent = agendaIntent;
  if (pending?.type === 'draft' && intent?.name === 'agenda') {
    effectiveText = text;
  }

  if (!intent) {
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