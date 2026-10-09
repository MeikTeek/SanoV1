import type { Intent } from './types';
import { agendaIntent, trainerIntent, aiIntent } from './intents/agenda';
import { localDayBounds } from '../assistant/dateTime';
import { listLearningPhrases } from '../assistant/learning';
import { variedReply } from '../assistant/recovery';
import { buildInfo } from '../../build-info';

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min ${Math.floor(s % 60)}s`;
};

const settings: Intent = {
  name: 'settings',
  description: 'Abre os ajustes',
  examples: ['abrir ajustes'],
  patterns: [/^(ajustes|configuracoes|config|preferencias)$/, /\b(abre|abrir|abra|quero ver|quero abrir|ir para|va para)\b.*\b(ajustes|configuracoes|preferencias)\b/],
  handle: () => ({
    reply: 'Abrindo seus ajustes…',
    actions: [{ type: 'navigate', to: '/config' }],
  }),
};

const learning: Intent = {
  name: 'assistant_learning',
  description: 'Frases que o assistente ainda está aprendendo',
  examples: ['ver frases para melhorar o Sano'],
  adminOnly: true,
  hidden: true,
  patterns: [/\b(frases|pedidos)\b.*\b(aprender|melhorar|revisar|nao reconhecid[oa]s?)\b/, /\baprendizado do assistente\b/],
  async handle() {
    const items = await listLearningPhrases();
    return {
      reply: items.length
        ? `Separei ${items.length} frases para revisão.`
        : 'Ainda não há frases aguardando revisão.',
      view: {
        kind: 'briefing',
        headline: 'Frases para revisar',
        blocks: items.map((item, index) => ({
          title: `${index + 1}. Nível ${item.level}`,
          lines: [item.phrase],
        })),
      },
    };
  },
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
  handle: ({ user }) => ({
    reply: variedReply(user.id, 'social:wake-word', [
      `Estou aqui, ${user.username}. Quer ver a agenda ou abrir algum módulo?`,
      `Pode falar, ${user.username}. Posso ajudar com agenda, treino ou perfil.`,
      `À disposição, ${user.username}. O que você quer resolver?`,
    ]),
  }),
};

const admin: Intent = {
  name: 'admin',
  description: 'Abre o painel administrativo',
  examples: ['painel adm'],
  adminOnly: true,
  patterns: [/^(admin|adm|painel adm|painel admin)$/, /\b(abre|abrir|abra|ir para|va para|ir ao|quero ver|quero abrir|entrar no)\b.*\b(adm|admin|administrativo)\b/],
  handle: () => ({
    reply: 'Abrindo o painel administrativo…',
    actions: [{ type: 'navigate', to: '/admin' }],
  }),
};

const whoami: Intent = {
  name: 'whoami',
  description: 'Mostra seu perfil de acesso',
  examples: ['quem sou eu'],
  patterns: [/^(whoami|perfil|meu perfil)$/, /\bquem (sou|e) eu\b/, /\b(quero ver|quero abrir|abre|abrir|abra|mostra|ver)\s+(o\s+)?(meu )?perfil\b/],
  handle: ({ user }) => ({
    reply: [
      `Usuário: ${user.username}`,
      `Cargo: ${user.role}`,
      `Último login: ${user.lastLoginAt ? fmtDate(user.lastLoginAt, { dateStyle: 'short', timeStyle: 'short' }) : '—'}`,
    ].join('\n'),
    actions: [{ type: 'navigate', to: `/perfil/${encodeURIComponent(user.username)}` }],
  }),
};

const status: Intent = {
  name: 'status',
  description: 'Diagnóstico do sistema',
  examples: ['status do sistema'],
  patterns: [/^(status|sistema|diagnostico)$/, /\b(status|diagnostico|saude)\s+(?:(?:do|da|de) )?(sistema|servidor|api)\b/, /\bsistema funcionando\b/, /\bcomo (esta|anda) o sistema\b/],
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
  patterns: [/^(briefing|resumo|panorama|situacao)\b/, /\b(como (esta|vai ser|foi) (meu|o) dia|briefing de hoje|meu dia|resumo do dia)\b/],
  async handle(ctx) {
    const blocks: { title: string; lines: string[]; tone?: 'ok' | 'warn' | 'bad' }[] = [];
    const fmtTime = (d: Date) =>
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d);

    // Agenda de hoje.
    const { start: dayStart, end: dayEnd } = localDayBounds(ctx.now);
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
  patterns: [/\bque horas?\b/, /\bqual (a )?hora\b/, /^(hora|horas|data|hoje|dia)$/, /\bque dia\b/, /\bdata de hoje\b/, /\bdata e hora atuais?\b/],
  handle: ({ now, user }) => ({
    reply: variedReply(user.id, 'time:now', [
      `Agora são ${fmtDate(now, { dateStyle: 'full', timeStyle: 'short' })}.`,
      `Neste momento: ${fmtDate(now, { dateStyle: 'full', timeStyle: 'short' })}.`,
      `A data e hora em São Paulo são ${fmtDate(now, { dateStyle: 'full', timeStyle: 'short' })}.`,
    ]),
  }),
};

const version: Intent = {
  name: 'version',
  description: 'Versão do site',
  examples: ['versão do site'],
  patterns: [
    /^(versao|versao do site|qual versao|qual e a versao|versao atual)$/,
    /\b(versao|release)\s+(do\s+)?(site|sano|sistema)\b/,
  ],
  handle: () => ({
    reply: [
      `Versão publicada: ${buildInfo.commit}`,
      `Build: ${buildInfo.builtAt}`,
    ].join('\n'),
  }),
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
  {
    ...planned('musica', 'player de música', '4', 'tocar música', [/\b(musica|musicas|tocar|toque|inicie a musica|playlist|spotify)\b/]),
    handle: ({ user }) => ({
      reply: variedReply(user.id, 'music:planned', [
        'Música ainda não está disponível, mas já deixei esse pedido no meu radar. Posso abrir outro módulo enquanto isso.',
        'Ainda não consigo tocar músicas, mas reconheci o que você quer. Quer ir para a agenda ou para o treino?',
        'O player de música ainda vem pela frente. Enquanto isso, posso abrir outro espaço do Sano.',
      ]),
      view: {
        kind: 'actions',
        title: 'O que posso abrir agora',
        items: [
          { label: 'Agenda', command: 'minha agenda' },
          { label: 'Treino', command: 'meu treino' },
          { label: 'Mensagens', command: 'abrir mensagens' },
        ],
      },
    }),
  },
  planned('osint', 'terminal OSINT', '4', 'abrir terminal osint', [/\b(osint|varredura|scan)\b/], true),
];

/* ------------------------------------- Ajuda ------------------------------------- */

export const createHelpIntent = (list: () => Intent[]): Intent => ({
  name: 'help',
  description: 'Lista os comandos',
  examples: ['ajuda'],
  patterns: [/^(ajuda|help|comandos|lista de comandos|me ajuda|preciso de ajuda)$/, /\bo que (voce|vc|o sano) (faz|sabe|posso pedir)\b/, /\bcomo posso pedir\b/, /\bme mostra (a )?ajuda\b/],
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
  greeting, admin, whoami, status, briefing, time, version, agendaIntent, trainerIntent,
  messages, people, settings, learning, aiIntent, ...plannedIntents,
];