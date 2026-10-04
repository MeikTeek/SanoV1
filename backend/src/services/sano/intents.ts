import type { Intent } from './types';
import { agendaIntent, trainerIntent, aiIntent } from './intents/agenda';

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min ${Math.floor(s % 60)}s`;
};

const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }).format(d);

/* ------------------------------ Intenções do núcleo ------------------------------ */

const greeting: Intent = {
  name: 'greeting',
  description: 'Cumprimentos',
  examples: ['oi'],
  hidden: true,
  patterns: [/^$/, /^(oi|ola|e ai|bom dia|boa tarde|boa noite)$/],
  handle: ({ user }) => ({ reply: `Às ordens, ${user.username}. Digite "ajuda" para ver o que posso fazer.` }),
};

const admin: Intent = {
  name: 'admin',
  description: 'Abre o painel administrativo',
  examples: ['painel adm'],
  adminOnly: true,
  patterns: [/^(admin|adm|painel adm|painel admin)$/, /\b(abrir?|abra|ir para|va para)\b.*\b(adm|admin|administrativo)\b/],
  handle: () => ({
    reply: 'Abrindo o painel administrativo…',
    actions: [{ type: 'navigate', to: '/admin' }],
  }),
};

const whoami: Intent = {
  name: 'whoami',
  description: 'Mostra seu perfil de acesso',
  examples: ['quem sou eu'],
  patterns: [/^(whoami|perfil|meu perfil)$/, /\bquem (sou|e) eu\b/],
  handle: ({ user }) => ({
    reply: [
      `Usuário: ${user.username}`,
      `Cargo: ${user.role}`,
      `Último login: ${user.lastLoginAt ? fmtDate(user.lastLoginAt, { dateStyle: 'short', timeStyle: 'short' }) : '—'}`,
    ].join('\n'),
  }),
};

const status: Intent = {
  name: 'status',
  description: 'Diagnóstico do sistema',
  examples: ['status do sistema'],
  patterns: [/^(status|sistema|diagnostico)$/, /\bstatus (do )?(sistema|servidor|api)\b/],
  async handle({ deps }) {
    let dbMs: number | null = null;
    try {
      dbMs = await deps.pingDb();
    } catch {
      dbMs = null;
    }

    const items: { label: string; value: string; percent?: number; tone?: 'ok' | 'warn' | 'bad' }[] = [
      { label: 'API', value: 'online', percent: 100, tone: 'ok' },
      {
        label: 'Banco de dados',
        value: dbMs === null ? 'indisponível' : `online · ${dbMs} ms`,
        percent: dbMs === null ? 0 : Math.max(10, 100 - dbMs),
        tone: dbMs === null ? 'bad' : dbMs > 200 ? 'warn' : 'ok',
      },
      { label: 'Sessão', value: 'ativa', percent: 100, tone: 'ok' },
    ];

    return {
      reply: ['Sistema operacional.', `Banco de dados: ${dbMs === null ? 'INDISPONÍVEL' : `online (${dbMs} ms)`}`, `Uptime: ${fmtUptime(process.uptime())}`].join('\n'),
      view: { kind: 'meters', title: 'Status do sistema', items },
    };
  },
};

/**
 * Briefing proativo: um resumo do dia montado por código.
 *
 * É o que o Sano mostra ao entrar e o que responde a "como está meu dia?".
 * Reúne agenda, missão pendente e ofensiva — o usuário não precisa perguntar.
 */
const briefing: Intent = {
  name: 'briefing',
  description: 'Resumo do seu dia',
  examples: ['briefing', 'como está meu dia?'],
  patterns: [/^(briefing|resumo|panorama|situacao)\b/, /\b(como (esta|esta|foi) (meu|o) dia|briefing de hoje|meu dia)\b/],
  async handle(ctx) {
    const blocks: { title: string; lines: string[]; tone?: 'ok' | 'warn' | 'bad' }[] = [];
    const fmtTime = (d: Date) =>
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d);

    // Agenda de hoje.
    const dayStart = new Date(ctx.now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    let today = ctx.deps.agenda ? await ctx.deps.agenda.listByDay(ctx.user.id, dayStart, dayEnd) : [];
    if (today.length) {
      blocks.push({
        title: `Agenda · ${today.length} ${today.length === 1 ? 'compromisso' : 'compromissos'}`,
        lines: today.map((a) => `${fmtTime(new Date(a.startsAt))} — ${a.title}`),
      });
    } else {
      blocks.push({ title: 'Agenda', lines: ['Dia livre, nada marcado.'], tone: 'ok' });
    }

    // Treino.
    if (ctx.deps.trainer) {
      const s = await ctx.deps.trainer.status(ctx.user.id);
      if (s.onboarded) {
        const done = s.mission && s.mission.total > 0 && s.mission.done >= s.mission.total;
        blocks.push({
          title: 'Treino',
          lines: [
            `Nível ${s.level ?? 1} · ofensiva ${s.streak ?? 0} ${s.streak === 1 ? 'dia' : 'dias'}`,
            done ? 'Missão de hoje concluída.' : s.mission ? `Pendente: ${s.mission.title}` : 'Nenhuma missão gerada.',
          ],
          tone: done ? 'ok' : 'warn',
        });
      }
    }

    return {
      reply: blocks.map((b) => `${b.title}\n${b.lines.join('\n')}`).join('\n\n'),
      view: { kind: 'briefing', headline: 'Resumo do seu dia', blocks },
      memory: {
        appointments: today.map((a) => ({ id: a.id, title: a.title, startsAt: new Date(a.startsAt) })),
        focusDay: dayStart.toISOString().slice(0, 10),
      },
    };
  },
};

const time: Intent = {
  name: 'time',
  description: 'Data e hora atuais',
  examples: ['que horas são?'],
  patterns: [/\bque horas?\b/, /^(hora|horas|data|hoje|dia)$/, /\bque dia\b/, /\bdata de hoje\b/],
  handle: ({ now }) => ({ reply: `Agora: ${fmtDate(now, { dateStyle: 'full', timeStyle: 'short' })}` }),
};

/* ---------------------- Módulo 1 (implementado) ---------------------- */

const messages: Intent = {
  name: 'messages',
  description: 'Bate-papo criptografado (mensagens, grupos e perfis)',
  examples: ['abrir mensagens'],
  patterns: [
    /\b(bate ?papo|mensagens?|conversas?)\b/,
    /\b(mensagem|conversa|chat)\s+(com|para|pra|do|da)\s+\w+/,
  ],
  handle: () => ({
    reply: 'Abrindo suas mensagens… Tudo aqui é criptografado de ponta a ponta.',
    actions: [{ type: 'navigate', to: '/mensagens' }],
  }),
};

const people: Intent = {
  name: 'people',
  description: 'Perfis e pessoas do hub',
  examples: ['ver perfis'],
  patterns: [/\b(perfis|pessoas|diret[oó]rio|seguidores|seguindo)\b/],
  handle: () => ({
    reply: 'Abrindo os perfis…',
    actions: [{ type: 'navigate', to: '/pessoas' }],
  }),
};

/* --------------------- Módulos futuros (já mapeados) --------------------- */

const planned = (
  name: string, label: string, phase: string, example: string, patterns: RegExp[], adminOnly = false,
): Intent => ({
  name,
  description: `${label} (Fase ${phase})`,
  examples: [example],
  patterns,
  adminOnly,
  planned: true,
  handle: () => ({
    reply: `O módulo de ${label} ainda não está disponível (planejado para a Fase ${phase}). O comando já está mapeado.`,
  }),
});

const plannedIntents: Intent[] = [
  planned('jogos', 'jogos cognitivos', '3', 'jogar memória', [/\b(jogo|jogos|jogar|memoria|reflexo|reflexos)\b/]),
  planned('arquivos', 'utilitários de arquivos', '3', 'converter pdf', [/\b(pdf|converter|compactar|arquivos?)\b/]),
  planned('musica', 'player de música', '4', 'tocar música', [/\b(musica|musicas|tocar|toque|inicie a musica|playlist|spotify)\b/]),
  planned('osint', 'terminal OSINT', '4', 'abrir terminal osint', [/\b(osint|varredura|scan)\b/], true),
];

/* ------------------------------------- Ajuda ------------------------------------- */

export const createHelpIntent = (list: () => Intent[]): Intent => ({
  name: 'help',
  description: 'Lista os comandos',
  examples: ['ajuda'],
  patterns: [/^(ajuda|help|comandos)$/, /\bo que (voce|vc) (faz|sabe)\b/],
  handle: ({ user }) => {
    const visible = list().filter((i) => !i.hidden && (!i.adminOnly || user.role === 'ADMIN'));
    const ready = visible.filter((i) => !i.planned);
    const soon = visible.filter((i) => i.planned);

    // Grade de botões: cada comando pronto vira um cartão clicável. O texto de
    // apoio lista os módulos futuros em uma linha, sem colunas desalinhadas.
    return {
      reply: [
        ...ready.map((i) => `${i.description} — ex.: "${i.examples[0]}"`),
        ...(soon.length ? ['', `Em breve: ${soon.map((i) => i.name).join(', ')}`] : []),
      ].join('\n'),
      view: {
        kind: 'actions',
        title: 'O que posso fazer',
        subtitle: 'Toque em um comando para executá-lo',
        // Sem o nome interno (help, time, briefing): é detalhe técnico e só
        // polui o cartão.
        items: ready.map((i) => ({ label: i.description, command: i.examples[0] ?? i.name })),
      },
    };
  },
});

// A ORDEM importa: a primeira intenção que casar vence.
// A IA fica por último de propósito: agenda e treino respondem por regra em
// milissegundos; só o que sobrou (dúvida real) chega ao modelo.
// As intenções do módulo de mensagens vêm ANTES da IA: "abrir mensagens" é
// comando de navegação, não pergunta.
export const baseIntents: Intent[] = [
  greeting, admin, whoami, status, briefing, time, agendaIntent, trainerIntent,
  messages, people, aiIntent, ...plannedIntents,
];