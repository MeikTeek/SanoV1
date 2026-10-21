/**
 * Treino e perguntas livres pelo chat. A agenda mora em ./schedule.ts
 * (reexportada aqui para manter os imports existentes).
 */
import type { Intent, SanoContext, SanoResult } from '../types';
export { agendaIntent } from './schedule';

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
