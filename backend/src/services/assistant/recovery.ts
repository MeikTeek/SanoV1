import type { SanoResult, SanoUser } from '../sano/types';

const previousResponses = new Map<string, Map<string, number>>();

export function variedReply(userId: string, key: string, options: string[]): string {
  const previous = previousResponses.get(userId) ?? new Map<string, number>();
  const index = ((previous.get(key) ?? -1) + 1) % options.length;
  previous.set(key, index);
  previousResponses.set(userId, previous);
  return options[index];
}

const SOCIAL: Record<string, string[]> = {
  greeting: ['Oi! Que bom te ver. Quer conferir sua agenda ou abrir algum módulo?', 'Bom dia! Posso adiantar sua agenda de hoje ou abrir o treino.', 'Olá! Estou por aqui. O que você quer resolver primeiro?'],
  thanks: ['Por nada! Quer aproveitar e conferir mais alguma coisa?', 'Sempre à disposição. Posso ajudar com agenda, treino ou perfil.', 'Que bom que ajudou! Quer seguir com mais alguma coisa?'],
  wellbeing: ['Estou bem e pronto para ajudar. Como está seu dia?', 'Tudo certo por aqui! Quer ver o que tem na agenda hoje?', 'Estou funcionando direitinho. Quer abrir agenda ou treino?'],
  identity: ['Sou o Sano, seu assistente para chegar rápido à agenda, treino e ferramentas do hub.', 'Sou o Sano. Organizo seus atalhos e ajudo você a consultar os módulos do hub.', 'Sou o Sano, seu assistente pessoal dentro deste hub. Quer começar pela agenda ou pelo treino?'],
  compliment: ['Valeu! Tento deixar o caminho mais simples. O que vamos resolver?', 'Obrigado! Se quiser, já abro sua agenda ou seu perfil.', 'Fico feliz em ajudar. Quer consultar algum módulo?'],
  joke: ['Prometo não marcar reunião com a cafeteira sem você pedir. Quer ver sua agenda?', 'Meu humor é determinístico, mas a agenda está em dia. Quer conferir?', 'Essa eu guardo para o intervalo do treino. Quer abrir sua missão de hoje?'],
};

export function socialResponse(user: SanoUser, normalized: string): SanoResult | null {
  const key = /^(oi|ola|e ai|bom dia|boa tarde|boa noite|opa)( sano)?$/.test(normalized) ? 'greeting'
    : /^(obrigad[oa]s?|valeu|agradeco)$/.test(normalized) ? 'thanks'
    : /^(tudo bem|como voce esta|como vai)\??$/.test(normalized) ? 'wellbeing'
    : /^(quem e voce|quem e o sano|o que e voce)\??$/.test(normalized) ? 'identity'
    : /^(legal|incrivel|inteligente|bom trabalho|parabens)$/.test(normalized) ? 'compliment'
    : /^(piada|conte uma piada|me faz rir)$/.test(normalized) ? 'joke'
    : null;
  if (!key) return null;

  const reply = variedReply(user.id, `social:${key}`, SOCIAL[key]);
  return {
    reply: key === 'greeting' ? reply.replace('Bom dia!', `Bom dia, ${user.username}!`) : reply,
    ...(key === 'greeting' && { view: moduleSuggestions('agenda', 'treino') }),
  };
}

export function unknownResponse(user: SanoUser, text: string): SanoResult {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const suggestions = relevantModules(normalized, user);
  const reply = variedReply(user.id, 'recovery:unknown', [
    `Ainda estou aprendendo esse tipo de pedido. Posso ajudar com ${suggestions.labels}.`,
    `Esse assunto ainda não está entre as minhas tarefas, mas posso te levar a ${suggestions.labels}.`,
    `Por enquanto não resolvo isso diretamente. Quer seguir por ${suggestions.labels}?`,
  ]);
  return { reply, view: { kind: 'actions', title: 'Atalhos que podem ajudar', items: suggestions.items } };
}

function moduleSuggestions(_normalized: string, _second: string) {
  return {
    kind: 'actions' as const,
    title: 'Atalhos rápidos',
    items: [
      { label: 'Ver agenda', command: 'minha agenda' },
      { label: 'Status do treino', command: 'meu treino' },
      { label: 'Ver perfil', command: 'meu perfil' },
    ],
  };
}

function relevantModules(text: string, user: SanoUser) {
  const options = [
    { key: 'agenda', label: 'a agenda', item: { label: 'Ver agenda', command: 'minha agenda' } },
    { key: 'treino', label: 'o treino', item: { label: 'Ver treino', command: 'meu treino' } },
    { key: 'perfil', label: 'seu perfil', item: { label: 'Ver perfil', command: 'meu perfil' } },
    { key: 'config', label: 'os ajustes', item: { label: 'Abrir ajustes', command: 'abrir ajustes' } },
    { key: 'admin', label: 'o painel administrativo', item: { label: 'Abrir admin', command: 'abrir painel admin' } },
    { key: 'mensagem', label: 'as mensagens', item: { label: 'Abrir mensagens', command: 'abrir mensagens' } },
  ].filter((item) => item.key !== 'admin' || user.role === 'ADMIN');
  const ranked = options
    .map((item) => ({ ...item, score: text.includes(item.key) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, 3);
  return {
    labels: selected.map((item) => item.label).join(', '),
    items: selected.map(({ item }) => item),
  };
}
