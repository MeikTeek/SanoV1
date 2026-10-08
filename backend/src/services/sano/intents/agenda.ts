import type { Intent, SanoAppointment, SanoContext, SanoResult } from '../types';
import { parseSchedule } from '../../agenda/parse';
import { localDayBounds } from '../../assistant/dateTime';
import { variedReply } from '../../assistant/recovery';
import type { PendingAssistantAction } from '../../assistant/dialog';
import { z } from 'zod';

const TZ = 'America/Sao_Paulo';

const fmtDateTime = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(d);

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' }).format(d);

/**
 * Data no formato que o PARSER entende ("hoje", "amanhã", "15/10").
 * O dia da semana bonito serve para mostrar, mas "domingo, 04 de outubro" não é
 * interpretável — sugerir isso como confirmação faria a confirmação falhar.
 */
const fmtDayCommand = (d: Date, now: Date) => {
  const iso = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const target = iso(d);
  if (target === iso(now)) return 'hoje';
  if (target === iso(new Date(now.getTime() + 86_400_000))) return 'amanhã';
  return target.split('-').reverse().join('/');
};

const fmtReminder = (minutes?: number | null) => {
  if (minutes === 0) return 'na hora';
  if (!minutes) return 'sem lembrete';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h antes`;
  return `${Math.round(minutes / 1440)} dia(s) antes`;
};

const requireAgenda = (ctx: SanoContext) => {
  if (!ctx.deps.agenda) throw new Error('Serviço de agenda indisponível');
  return ctx.deps.agenda;
};

/** Dois compromissos colidem se a diferença for menor que a janela padrão (60 min). */
const CONFLICT_MINUTES = 60;

/**
 * Procura conflitos de horário no dia e devolve suggestions livres próximas.
 *
 * É "inteligência feita em código": o Sano avisa sozinho antes de o usuário
 * criar uma pilha de compromissos sobrepostos, e sugere horários vagos.
 */
async function checkConflicts(
  ctx: SanoContext,
  startsAt: Date,
  endsAt: Date | null,
): Promise<{ conflicts: SanoAppointment[]; freeSlots: string[] }> {
  const agenda = ctx.deps.agenda!;
  const { start: dayStart, end: dayEnd } = localDayBounds(startsAt);
  const day = await agenda.listByDay(ctx.user.id, dayStart, dayEnd);

  const newStart = startsAt.getTime();
  const newEnd = (endsAt ?? new Date(startsAt.getTime() + CONFLICT_MINUTES * 60_000)).getTime();
  const window = CONFLICT_MINUTES * 60_000;

  const conflicts = day.filter((a) => {
    const s = new Date(a.startsAt).getTime();
    const e = a.endsAt ? new Date(a.endsAt).getTime() : s + window;
    return s < newEnd + window && e > newStart - window;
  });

  // Horários livres: começa de hora em hora no dia, pulando os ocupados.
  const busy = day.map((a) => {
    const s = new Date(a.startsAt).getTime();
    return [s, a.endsAt ? new Date(a.endsAt).getTime() : s + window] as const;
  });
  const freeSlots: string[] = [];
  for (let h = 8; h <= 20 && freeSlots.length < 3; h++) {
    const slot = new Date(dayStart.getTime() + h * 60 * 60_000);
    const s = slot.getTime();
    const clash = busy.some(([bs, be]) => s < be + window && s + window > bs - window);
    if (!clash) {
      freeSlots.push(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(slot));
    }
  }

  return { conflicts, freeSlots };
}

const appointmentEntitySchema = z.object({
  title: z.string().trim().min(1).max(160),
  startsAt: z.date().refine((date) => Number.isFinite(date.getTime())),
  participants: z.string().max(500).optional(),
  endsAt: z.date().optional(),
  remindBeforeMinutes: z.number().int().min(0).max(43_200).optional(),
});

function dayText(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

function draftText(draft: Extract<PendingAssistantAction, { type: 'draft' }>, next: string): string {
  const date = draft.date ? dayText(new Date(draft.date)) : '';
  return [draft.title, date, next].filter(Boolean).join(' ');
}

function confirmation(userId: string, key: string, title: string, details: string[]): SanoResult {
  return {
    reply: variedReply(userId, key, [
      `Confere antes de eu salvar: ${title}.`,
      `Deixo ${title} na agenda desse jeito?`,
      `Tudo certo para registrar ${title}?`,
    ]),
    view: {
      kind: 'confirmation',
      title: 'Confirmar compromisso',
      details,
      confirmCommand: 'confirmar',
      cancelCommand: 'cancelar',
    },
  };
}

/** Cria o compromisso a partir da frase interpretada. */
async function create(ctx: SanoContext): Promise<SanoResult> {
  const draft = ctx.memory?.pendingAction?.type === 'draft' ? ctx.memory.pendingAction : null;
  const text = draft ? draftText(draft, ctx.text) : ctx.text;
  const parsed = parseSchedule(text, ctx.now);

  if (parsed.missing === 'title') {
    return { reply: variedReply(ctx.user.id, 'agenda:missing-title', [
      'Posso anotar. O que você quer colocar na agenda?',
      'Claro — qual é o compromisso que devo registrar?',
      'Anoto sim. Que compromisso é esse?',
    ]) };
  }
  if (parsed.missing === 'date') {
    return {
      reply: variedReply(ctx.user.id, 'agenda:missing-date', [
        `Anotei "${parsed.title}". Para qual dia?`,
        `Certo, "${parsed.title}". Quando vai acontecer?`,
        `Já tenho o título "${parsed.title}". Qual é a data?`,
      ]),
      dialog: {
        pendingAction: {
          type: 'draft', title: parsed.title, date: null,
          participants: parsed.participants, remindBefore: parsed.remindBeforeMinutes ?? null,
          createdAt: ctx.now.toISOString(),
        },
      },
    };
  }
  if (parsed.missing === 'time') {
    return {
      reply: variedReply(ctx.user.id, 'agenda:missing-time', [
        `Anotei "${parsed.title}" para ${dayText(parsed.startsAt)}. Que horas?`,
        `Certo, ficou para ${dayText(parsed.startsAt)}. Qual horário?`,
        `O dia de "${parsed.title}" está anotado: ${dayText(parsed.startsAt)}. Que horas marco?`,
      ]),
      dialog: {
        pendingAction: {
          type: 'draft', title: parsed.title, date: parsed.startsAt.toISOString(),
          participants: parsed.participants, remindBefore: parsed.remindBeforeMinutes ?? null,
          createdAt: ctx.now.toISOString(),
        },
      },
    };
  }

  const entity = appointmentEntitySchema.safeParse({
    title: parsed.title,
    startsAt: parsed.startsAt,
    participants: parsed.participants,
    endsAt: parsed.endsAt,
    remindBeforeMinutes: parsed.remindBeforeMinutes,
  });
  if (!entity.success) {
    return { reply: 'Tenho o dia e o horário, mas preciso de um título curto para o compromisso.' };
  }

  const agenda = requireAgenda(ctx);

  const { conflicts } = await checkConflicts(ctx, parsed.startsAt, parsed.endsAt ?? null);
  const details = [
    parsed.title,
    `${fmtDateTime(parsed.startsAt)}${parsed.endsAt ? ` até ${fmtDateTime(parsed.endsAt)}` : ''}`,
    ...(parsed.participants ? [`Com ${parsed.participants}`] : []),
    `Lembrete: ${fmtReminder(parsed.remindBeforeMinutes)}`,
    ...(conflicts.length ? [`Conflito: ${conflicts.map((item) => item.title).join(', ')}`] : []),
  ];
  const pendingAction: PendingAssistantAction = {
    type: 'create',
    title: parsed.title,
    startsAt: parsed.startsAt.toISOString(),
    endsAt: parsed.endsAt?.toISOString() ?? null,
    participants: parsed.participants,
    remindBefore: parsed.remindBeforeMinutes ?? null,
    createdAt: ctx.now.toISOString(),
  };

  return {
    ...confirmation(ctx.user.id, 'agenda:create-confirm', parsed.title, details),
    ...(conflicts.length && { reply: `${conflicts.length === 1 ? 'Encontrei um conflito de horário. ' : `Encontrei ${conflicts.length} conflitos de horário. `}Confirma mesmo assim?` }),
    dialog: { pendingAction },
  };
}

/** Lista os próximos compromissos. */
async function list(ctx: SanoContext): Promise<SanoResult> {
  const agenda = requireAgenda(ctx);
  const parsed = parseSchedule(ctx.text, ctx.now);
  const from = parsed.dayStart ?? ctx.now;
  const to = parsed.dayEnd ?? new Date(ctx.now.getTime() + 30 * 24 * 60 * 60_000);
  const title = parsed.dayStart ? `Agenda de ${dayText(parsed.dayStart)}` : 'Próximos 30 dias';
  const items = await agenda.list(ctx.user.id, from, to);

  if (!items.length) {
    return {
      reply: parsed.dayStart ? `Você não tem nada marcado em ${dayText(parsed.dayStart)}.` : 'Sua agenda está vazia nos próximos 30 dias.',
      view: { kind: 'timeline', title, items: [], emptyText: 'Nada marcado ainda.' },
      actions: [{ type: 'navigate', to: '/agenda' }],
    };
  }

  const timeOf = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

  return {
    reply: items
      .map((a) => `${timeOf(new Date(a.startsAt))} — ${a.title}${a.participants ? ` (com ${a.participants})` : ''}`)
      .join('\n'),
    // Painel de linha do tempo: cada compromisso vira um item com horário.
    view: {
      kind: 'timeline',
      title: parsed.dayStart ? title : `Próximos ${items.length} compromissos`,
      items: items.slice(0, 20).map((a) => ({
        id: a.id,
        time: timeOf(new Date(a.startsAt)),
        title: a.title,
        subtitle: a.participants ? `com ${a.participants}` : undefined,
        badge: fmtDay(new Date(a.startsAt)),
      })),
    },
    actions: [{ type: 'navigate', to: '/agenda' }],
    memory: { appointments: items.map((a) => ({ id: a.id, title: a.title, startsAt: new Date(a.startsAt) })) },
  };
}

/**
 * Escolhe o compromisso mais provável quando a busca traz vários candidatos.
 *
 * O usuário não precisa repetir o título exato: pontua por quantas palavras do
 * termo aparecem no título, com bônus para proximidade de horário. Isso faz
 * "cancela a reunião" funcionar mesmo com o título ligeiramente diferente.
 */
function pickBest(matches: SanoAppointment[], term: string, now: Date): SanoAppointment | null {
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];

  const words = term.split(/\s+/).filter((w) => w.length > 2);
  let best = matches[0];
  let bestScore = -Infinity;

  for (const m of matches) {
    const title = m.title.toLowerCase();
    let score = words.reduce((acc, w) => acc + (title.includes(w) ? 1 : 0), 0);
    // Quanto mais próximo de agora, mais provável que seja o que o usuário quis.
    const hours = Math.abs(new Date(m.startsAt).getTime() - now.getTime()) / 3_600_000;
    score += Math.max(0, 2 - hours / 24);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  // Empate total = ambiguidade real; melhor perguntar do que errar.
  return bestScore > 0 ? best : null;
}

/**
 * Cancela o compromisso cujo título melhor casa com o termo dito.
 *
 * Confirmação: quando há mais de um candidato plausível, o Sano NÃO adivinha —
 * mostra os encontrados e devolve botões "sim/não" para o usuário responder
 * com um toque. Apagar sem certeza é o pior erro possível num assistente.
 */
async function cancel(ctx: SanoContext): Promise<SanoResult> {
  const parsed = parseSchedule(ctx.text, ctx.now);
  // A frase de confirmação ("..., pode cancelar") entra como título; tira para
  // que a busca não procure "reuniao pode cancelar".
  const term = parsed.title
    .toLowerCase()
    .replace(/[,;]?\s*(e\s+)?(pode|confirma|confirmo|agora|vai)\b.*$/, '')
    .trim();
  if (!term) return { reply: 'Qual compromisso devo cancelar? Diga o trecho, por exemplo: "cancelar reunião com João".' };

  const agenda = requireAgenda(ctx);
  const matches = await agenda.findByTitle(ctx.user.id, term);
  const timeOf = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

  if (!matches.length) return { reply: `Não achei nenhum compromisso com "${term}" na sua agenda.` };

  // Vários candidatos → confirmação explícita em vez de chute.
  if (matches.length > 1) {
    const chosen = pickBest(matches, term, ctx.now);
    if (!chosen) {
      return {
        reply: `Achei mais de um com esse nome:\n${matches.map((m) => `  • ${timeOf(new Date(m.startsAt))} — ${m.title}`).join('\n')}\n\nDiga o horário ou o título completo para eu escolher.`,
        view: {
          kind: 'actions',
          title: 'Qual compromisso cancelar?',
          items: matches.map((m) => ({
            label: `${timeOf(new Date(m.startsAt))} — ${m.title}`,
            command: `cancelar ${m.title}`,
          })),
        },
      };
    }
  }

  const target = matches.length === 1 ? matches[0] : pickBest(matches, term, ctx.now)!;

  return {
    reply: variedReply(ctx.user.id, 'agenda:cancel-confirm', [
      `Vou cancelar "${target.title}" (${fmtDateTime(target.startsAt)}).`,
      `Confere o cancelamento de "${target.title}" (${fmtDateTime(target.startsAt)})?`,
      `Quer mesmo remover "${target.title}", marcado para ${fmtDateTime(target.startsAt)}?`,
    ]),
    view: {
      kind: 'confirmation',
      title: 'Confirmar cancelamento',
      details: [target.title, fmtDateTime(target.startsAt)],
      confirmCommand: 'confirmar',
      cancelCommand: 'cancelar',
    },
    dialog: {
      pendingAction: {
        type: 'cancel',
        appointmentId: target.id,
        title: target.title,
        startsAt: new Date(target.startsAt).toISOString(),
        createdAt: ctx.now.toISOString(),
      },
    },
  };
}

/**
 * "cancelar todos os compromissos de amanhã".
 *
 * Apagar vários itens de uma vez é destrutivo, então NUNCA apaga na primeira
 * frase: primeiro mostra o que seria removido e só executa quando o usuário
 * confirma ("pode cancelar"). A confirmação é por palavra — a segunda frase
 * precisa repetir o dia, senão "sim" solto não teria sobre o que agir.
 */
async function cancelAll(ctx: SanoContext): Promise<SanoResult> {
  const parsed = parseSchedule(ctx.text, ctx.now);

  if (parsed.missing === 'date') {
    return {
      reply: 'Qual dia devo limpar? Diga por exemplo: "cancelar todos os compromissos de amanhã".',
    };
  }

  const agenda = requireAgenda(ctx);
  const from = parsed.dayStart!;
  const to = parsed.dayEnd!;

  const pending = await agenda.listByDay(ctx.user.id, from, to);
  const when = fmtDay(from);

  if (!pending.length) return { reply: `Não há compromissos para cancelar em ${when}.` };

  const preview = pending
    .slice(0, 8)
    .map((a) => {
      const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(a.startsAt);
      return `  • ${time} — ${a.title}`;
    })
    .join('\n');

  {
    const rest = pending.length > 8 ? `\n  … e mais ${pending.length - 8}.` : '';
    return {
      reply: variedReply(ctx.user.id, 'agenda:cancel-day-confirm', [
        `Vou cancelar ${pending.length} ${pending.length === 1 ? 'compromisso' : 'compromissos'} de ${when}.`,
        `Confirma o cancelamento de ${pending.length} itens da agenda em ${when}?`,
        `Posso remover esses ${pending.length} compromissos de ${when}?`,
      ]),
      view: {
kind: 'confirmation',
title: 'Confirmar cancelamento',
details: [preview + rest],
confirmCommand: 'confirmar',
cancelCommand: 'cancelar',
      },
      dialog: {
pendingAction: {
  type: 'cancel-day',
  startsAt: from.toISOString(),
  endsAt: to.toISOString(),
  count: pending.length,
  createdAt: ctx.now.toISOString(),
},
      },
    };
  }
}

async function updateAppointment(ctx: SanoContext): Promise<SanoResult> {
  const draft = ctx.memory?.pendingAction?.type === 'draft'
    && ctx.memory.pendingAction.operation === 'update'
    ? ctx.memory.pendingAction
    : null;
  const parsed = parseSchedule(
    draft ? `alterar ${draft.title} ${draft.date ? dayText(new Date(draft.date)) : ''} ${ctx.text}` : ctx.text,
    ctx.now,
  );
  if (parsed.missing === 'title') {
    return { reply: 'Qual compromisso você quer mudar? Diga um trecho do título.' };
  }

  const agenda = requireAgenda(ctx);
  const matches = draft?.appointmentId
    ? (await agenda.findByTitle(ctx.user.id, draft.title)).filter((item) => item.id === draft.appointmentId)
    : await agenda.findByTitle(ctx.user.id, parsed.title);
  if (!matches.length) {
    return { reply: `Não encontrei "${parsed.title}" para alterar. Quer conferir sua agenda?`, view: { kind: 'actions', title: 'Agenda', items: [{ label: 'Ver agenda', command: 'minha agenda' }] } };
  }
  if (matches.length > 1) {
    return {
      reply: `Achei mais de um compromisso parecido com "${parsed.title}". Qual horário você quer alterar?`,
      view: {
        kind: 'actions',
        title: 'Escolha o compromisso',
        items: matches.map((item) => ({
          label: `${fmtDateTime(item.startsAt)} — ${item.title}`,
          command: `alterar ${item.title} ${fmtDayCommand(parsed.startsAt, ctx.now)} às ${new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(parsed.startsAt).replace(':', 'h')}`,
        })),
      },
    };
  }

  const target = matches[0];
  if (parsed.missing === 'date' || parsed.missing === 'time') {
    const missingDate = parsed.missing === 'date';
    return {
      reply: missingDate
        ? `Encontrei "${target.title}". Para qual dia quer mudar?`
        : `Certo, vou mudar "${target.title}" para ${dayText(parsed.startsAt)}. Que horas?`,
      dialog: {
        pendingAction: {
          type: 'draft',
          operation: 'update',
          appointmentId: target.id,
          title: target.title,
          date: missingDate ? null : parsed.startsAt.toISOString(),
          createdAt: ctx.now.toISOString(),
        },
      },
    };
  }

  const pendingAction: PendingAssistantAction = {
    type: 'update',
    appointmentId: target.id,
    title: target.title,
    startsAt: parsed.startsAt.toISOString(),
    endsAt: parsed.endsAt?.toISOString() ?? null,
    participants: parsed.participants,
    remindBefore: parsed.remindBeforeMinutes ?? target.remindBefore ?? null,
    createdAt: ctx.now.toISOString(),
  };
  return {
    ...confirmation(ctx.user.id, 'agenda:update-confirm', target.title, [`De ${fmtDateTime(target.startsAt)}`, `Para ${fmtDateTime(parsed.startsAt)}`]),
    view: {
      kind: 'confirmation',
      title: 'Confirmar alteração',
      details: [target.title, `De ${fmtDateTime(target.startsAt)}`, `Para ${fmtDateTime(parsed.startsAt)}`],
      confirmCommand: 'confirmar',
      cancelCommand: 'cancelar',
    },
    dialog: { pendingAction },
  };
}

/**
 * Trainer (Fase 4) — o Sano como atalho para o módulo de treino.
 *
 * O chat não substitui a tela do Sistema: ele resume e permite marcar blocos.
 * Toda a decisão de treino continua no motor determinístico.
 */
async function trainerStatus(ctx: SanoContext): Promise<SanoResult> {
  if (!ctx.deps.trainer) {
    return {
      reply: 'Posso te levar ao módulo de treino para conferir sua missão e seu progresso.',
      actions: [{ type: 'navigate', to: '/treino' }],
    };
  }

  const s = await ctx.deps.trainer.status(ctx.user.id);
  if (!s.onboarded) {
    return {
      reply: 'Você ainda não criou seu personagem no Sistema. Abra o módulo Treino para fazer o cadastro.',
      actions: [{ type: 'navigate', to: '/treino' }],
    };
  }

  const lines = [
    `Objetivo: ${s.goalLabel} · nível ${s.level} (${s.levelTitle}) · ofensiva ${s.streak}${s.debuffed ? ' · DEBUFF ATIVO' : ''}`,
  ];
  if (s.mission) {
    lines.push(
      `Missão de hoje: ${s.mission.title}`,
      `Progresso: ${s.mission.done}/${s.mission.total} blocos (${s.mission.plannedMinutes} min planejados).`,
    );
    if (s.mission.done === s.mission.total) lines.push('Missão concluída. Bom trabalho.');
  } else {
    lines.push('Nenhuma missão gerada ainda.');
  }

  return { reply: lines.join('\n'), actions: [{ type: 'navigate', to: '/treino' }] };
}

const normalizeWord = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "completei flexão", "fiz agachamento na caixa". */
async function trainerComplete(ctx: SanoContext): Promise<SanoResult> {
  if (!ctx.deps.trainer) {
    return {
      reply: 'Anoto isso quando o módulo de treino estiver conectado. Quer abrir a tela do treino?',
      actions: [{ type: 'navigate', to: '/treino' }],
    };
  }

  const verb = /\b(complet[ei]|fiz|treinei|conclui|realizei)\b/.exec(ctx.normalized);
  if (!verb) return { reply: 'Diga o que você concluiu, por exemplo: "completei flexão".' };

  // Recorta pelo índice do texto normalizado (mesmo comprimento do original).
  const raw = ctx.text.slice(verb.index + verb[0].length).trim();
  const wanted = normalizeWord(raw).replace(/\b(reps|repeticoes|vezes|series|trilha|etapa|hoje)\b/g, '').trim();

  const r = await ctx.deps.trainer.completeByName(ctx.user.id, wanted);
  return {
    reply: r.message,
    ...(r.ok && { actions: [{ type: 'navigate' as const, to: '/treino' }] }),
  };
}

/**
 * Trainer (Fase 4) — o Sano como atalho para o módulo de treino.
 *
 * O chat não substitui a tela do Sistema: ele resume o status e permite marcar
 * blocos. Toda a decisão de treino continua no motor determinístico.
 */
export const trainerIntent: Intent = {
  name: 'treino',
  description: 'Missões e status do treino',
  examples: ['meu treino', 'completei flexão'],
  patterns: [
    /\b(treino|treinar|treinei|treine|treinamento|missao|missoes|exercicio|exercicios|workout|musculo|musculos|personagem|academia)\b/,
  ],
  handle: async (ctx) => {
    if (!ctx.deps.trainer) {
      return {
        reply: 'Posso abrir o treino para você consultar a missão e o progresso.',
        actions: [{ type: 'navigate', to: '/treino' }],
      };
    }
    // "completei/fiz X" marca um bloco; qualquer outra coisa é status.
    if (/\b(complet[ei]|fiz|treinei|conclui|realizei)\b/.test(ctx.normalized)) return trainerComplete(ctx);
    return trainerStatus(ctx);
  },
};

/**
 * Perguntas livres para a IA (tira-dúvidas, "como faço X", "qual é melhor").
 *
 * Fica como intenção PRÓPRIA, e não no `unknown`, porque assim a agenda e o
 * treino continuam respondendo instantaneamente por regra — só a dúvida real
 * é que vai para a IA.
 */
export const aiIntent: Intent = {
  name: 'pergunta',
  description: 'Pergunta sobre técnica e treino',
  examples: ['como faço flexão diamante?'],
  patterns: [
    // Não pode usar /\?$/: o normalize remove a pontuação antes do casamento.
    /\b(como (faz|faco|fazer|executo|executar|feito|explicado)|qual (a|o) (melhor|forma|posicao)|posicao correta|postura|qual a diferenca|explic[aa]|por que|porque)\b/,
    /\b(dica|duvida|ajuda com|tutorial)\b/,
  ],
  handle: async (ctx) => {
    const asker = ctx.deps.trainer?.ask;
    if (!asker) {
      return {
        reply: 'Posso mostrar sua missão de hoje ou abrir o treino para você conferir os exercícios.',
        view: {
          kind: 'actions',
          title: 'Atalhos do treino',
          items: [
            { label: 'Ver missão e status', command: 'meu treino' },
            { label: 'Abrir treino', command: 'abrir treino' },
          ],
        },
      };
    }

    const answer = await asker(ctx.user.id, ctx.text);
    return {
      reply: answer,
      actions: [{ type: 'navigate', to: '/treino' }],
    };
  },
};

/**
 * Intenção da agenda (Fase 3). Não está mais em `planned`: cria, lista e
 * cancela compromissos de verdade.
 */
export const agendaIntent: Intent = {
  name: 'agenda',
  description: 'Compromissos e lembretes',
  examples: ['agendar reunião amanhã às 14h', 'cancelar todos de amanhã'],
  patterns: [
    /\b(agenda|agendar|agende|agendo|compromisso|compromissos|lembrete|lembrar|lembre|lembra|reuniao|reunioes|calendario|marcar|marque|marca|adicionar|adiciona|adicione|anotar|anote|anota|registrar|registre|registra|cancelar|cancele|cancela|apagar|apague|remover|remova|remarcar|remarque|reagendar|reagende|alterar|altere|altera|mudar|muda|marcado|marcada)\b/,
    /\b(o que tenho|tem algo marcado|minha agenda)\b/,
  ],
  handle: async (ctx) => {
    if (ctx.memory?.pendingAction?.type === 'draft' && ctx.memory.pendingAction.operation === 'update') {
      return updateAppointment(ctx);
    }
    const parsed = parseSchedule(ctx.text, ctx.now);
    if (parsed.action === 'list') return list(ctx);
    if (parsed.action === 'cancel_all') return cancelAll(ctx);
    if (parsed.action === 'cancel') return cancel(ctx);
    if (parsed.action === 'update') return updateAppointment(ctx);
    return create(ctx);
  },
};