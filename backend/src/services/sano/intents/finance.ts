import type { Intent, SanoContext, SanoResult } from '../types';

/**
 * Finanças pelo chat:
 *
 *   gastei 45,90 no mercado          → saída na conta principal, categoria Mercado
 *   paguei 120 de luz pelo nubank    → saída na conta "Nubank"
 *   recebi 6500 de salário           → entrada, categoria Salário
 *   quanto sobrou de lazer?          → saldo do envelope
 *   resumo financeiro / meu orçamento → painel do mês
 *
 * O valor é lido do texto ORIGINAL: o normalize remove a vírgula e "45,90"
 * viraria "45 90".
 */

const deaccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const EXPENSE = /\b(gastei|paguei|comprei|torrei|transferi pra|transferi para)\b/;
const INCOME = /\b(recebi|ganhei|entrou|caiu)\b/;
const AMOUNT = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|real|contos?|pila))?/;
const ACCOUNT_HINT = /\s+(?:pelo|pela|via|usando(?: o| a)?|na conta(?: do| da)?|no cartao(?: do| da)?|do cartao(?: do| da)?)\s+(.+)$/;
const LEADING_PREP = /^(?:no|na|nos|nas|em|com|de|do|da|dos|das|pro|pra|para|pelo|pela|um|uma)\s+/;

export interface ParsedEntry {
  amount: number; // centavos, com sinal
  description: string;
  accountHint?: string;
}

/** Interpreta "gastei 45,90 no mercado pelo nubank". null quando não é lançamento. */
export function parseFinanceEntry(text: string): ParsedEntry | null {
  const t = deaccent(text).replace(/[?!]/g, ' ').replace(/\s+/g, ' ').trim();
  const verb = EXPENSE.exec(t) ?? INCOME.exec(t);
  if (!verb) return null;
  const sign = EXPENSE.test(verb[0]) ? -1 : 1;
  const after = t.slice(verb.index + verb[0].length);
  const amountMatch = AMOUNT.exec(after);
  if (!amountMatch) return null;

  const raw = amountMatch[1];
  const decimal = /,\d{1,2}$/.test(raw) || (/\.\d{1,2}$/.test(raw) && !/\.\d{3}/.test(raw));
  const number = Number(decimal ? raw.replace(/\.(?=\d{3})/g, '').replace(',', '.') : raw.replace(/[.,]/g, ''));
  const cents = Math.round(number * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;

  let rest = (after.slice(0, amountMatch.index) + ' ' + after.slice(amountMatch.index + amountMatch[0].length))
    .replace(/[.,;]+$/, '').trim();
  let accountHint: string | undefined;
  const account = ACCOUNT_HINT.exec(` ${rest}`);
  if (account) {
    accountHint = account[1].trim();
    rest = ` ${rest}`.slice(0, account.index).trim();
  }
  let description = rest;
  while (LEADING_PREP.test(description)) description = description.replace(LEADING_PREP, '');
  description = description.replace(/\b(hoje|agora|agorinha)\b/g, '').trim();

  return { amount: sign * cents, description, accountHint };
}

/** "quanto sobrou de lazer", "quanto posso gastar com restaurante" → "lazer". */
export function parseCategoryQuestion(normalized: string): string | null {
  const match = /\bquanto (?:sobrou|resta|falta|tenho|posso gastar|ainda tenho|ainda posso gastar)(?: ainda)?(?: (?:para|pra|de|do|da|em|no|na|com))? (.+)$/.exec(normalized);
  if (!match) return null;
  const term = match[1].replace(/\b(esse mes|este mes|no mes|no orcamento)\b/g, '').trim();
  return term && !/^(gastar|no total|ao todo)$/.test(term) ? term : null;
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
const tone = (value: number) => (value < 0 ? 'bad' as const : value === 0 ? 'warn' as const : 'ok' as const);
const OPEN = { type: 'navigate' as const, to: '/financas' };

async function record(ctx: SanoContext, entry: ParsedEntry): Promise<SanoResult> {
  const finance = ctx.deps.finance!;
  if (!entry.description) {
    return { reply: entry.amount < 0 ? 'Gastou com o quê? Ex.: "gastei 45,90 no mercado".' : 'Recebeu de quê? Ex.: "recebi 6500 de salário".' };
  }
  const saved = await finance.record(ctx.user.id, entry);
  if (!saved.ok) return { reply: saved.message, actions: [OPEN] };
  const lines = [
    `${entry.amount < 0 ? 'Saída' : 'Entrada'} de ${brl(Math.abs(entry.amount))} em ${saved.accountName}: ${saved.payee}.`,
    saved.categoryName
      ? `Categoria: ${saved.categoryName}${saved.categoryBalance !== undefined ? ` · restam ${brl(saved.categoryBalance)} no envelope.` : '.'}`
      : 'Ficou sem categoria — escolha uma na tela de finanças para entrar no orçamento.',
  ];
  return {
    reply: lines.join('\n'),
    view: {
      kind: 'meters',
      title: 'Lançado',
      items: [
        { label: saved.payee, value: brl(entry.amount), tone: entry.amount < 0 ? 'warn' : 'ok' },
        ...(saved.categoryName && saved.categoryBalance !== undefined
          ? [{ label: `Envelope ${saved.categoryName}`, value: brl(saved.categoryBalance), tone: tone(saved.categoryBalance) }]
          : []),
      ],
    },
  };
}

/** Fica no chat (sem navegar): o painel de medidores já é a resposta. */
async function summary(ctx: SanoContext): Promise<SanoResult> {
  const s = await ctx.deps.finance!.summary(ctx.user.id);
  if (!s.hasAccounts) {
    return { reply: 'Você ainda não cadastrou contas. Abra Finanças e informe o saldo de cada uma.', actions: [OPEN] };
  }
  const worst = s.categories.filter((c) => c.balance < 0).slice(0, 3);
  const lines = [
    `A orçar: ${brl(s.toBudget)} · receitas do mês ${brl(s.income)} · gastos ${brl(s.spent)}.`,
    worst.length ? `Estourados: ${worst.map((c) => `${c.name} (${brl(c.balance)})`).join(', ')}.` : 'Nenhum envelope estourado.',
    ...(s.upcoming.length ? [`Próximos vencimentos: ${s.upcoming.map((u) => `${u.name} ${brl(Math.abs(u.amount))} em ${u.nextDate.split('-').reverse().slice(0, 2).join('/')}`).join(', ')}.`] : []),
  ];
  return {
    reply: lines.join('\n'),
    view: {
      kind: 'meters',
      title: 'Finanças do mês',
      items: [
        { label: 'A orçar', value: brl(s.toBudget), tone: tone(s.toBudget === 0 ? 1 : s.toBudget) },
        { label: 'Gasto do orçado', value: `${brl(s.spent)} de ${brl(s.budgeted)}`, percent: s.budgeted ? Math.min(100, Math.round((s.spent / s.budgeted) * 100)) : 0, tone: s.spent > s.budgeted ? 'bad' : 'ok' },
        ...worst.map((c) => ({ label: c.name, value: brl(c.balance), tone: 'bad' as const })),
        ...s.upcoming.slice(0, 2).map((u) => ({ label: `Vence ${u.nextDate.split('-').reverse().slice(0, 2).join('/')}`, value: `${u.name} ${brl(Math.abs(u.amount))}`, tone: 'warn' as const })),
      ],
    },
  };
}

async function categoryBalance(ctx: SanoContext, term: string): Promise<SanoResult> {
  const s = await ctx.deps.finance!.summary(ctx.user.id);
  const needle = deaccent(term);
  const category = s.categories.find((c) => deaccent(c.name) === needle)
    ?? s.categories.find((c) => deaccent(c.name).includes(needle) || needle.includes(deaccent(c.name)));
  if (!category) {
    return { reply: `Não achei a categoria "${term}". Suas categorias: ${s.categories.slice(0, 8).map((c) => c.name).join(', ')}…` };
  }
  return {
    reply: category.balance >= 0
      ? `Restam ${brl(category.balance)} em ${category.name} (orçado ${brl(category.budgeted)}, gasto ${brl(category.spent)}).`
      : `${category.name} está estourado em ${brl(-category.balance)} (orçado ${brl(category.budgeted)}, gasto ${brl(category.spent)}).`,
    view: {
      kind: 'meters',
      title: category.name,
      items: [{
        label: 'Disponível',
        value: brl(category.balance),
        percent: category.budgeted ? Math.min(100, Math.round((category.spent / category.budgeted) * 100)) : undefined,
        tone: tone(category.balance),
      }],
    },
  };
}

export const financeIntent: Intent = {
  name: 'financas',
  description: 'Lançar gastos e consultar o orçamento',
  examples: ['gastei 45,90 no mercado', 'quanto sobrou de lazer', 'resumo financeiro'],
  patterns: [
    /\b(gastei|paguei|comprei|torrei|recebi|ganhei)\b.*\d/,
    /\b(entrou|caiu)\b.*\d.*\b(conta|salario|pix)\b/,
    /\bquanto (sobrou|resta|falta|gastei|posso gastar|tenho|ainda tenho|ainda posso gastar)\b/,
    /\b(financas|financeiro|orcamento|meu dinheiro|minhas contas|saldo das contas|saldo bancario|a orcar)\b/,
  ],
  handle: async (ctx) => {
    if (!ctx.deps.finance) return { reply: 'Abrindo suas finanças.', actions: [OPEN] };
    const entry = parseFinanceEntry(ctx.text);
    if (entry) return record(ctx, entry);
    const term = parseCategoryQuestion(ctx.normalized);
    if (term) return categoryBalance(ctx, term);
    if (/\b(abrir|abre|abra|ir para|mostrar tela)\b/.test(ctx.normalized)) return { reply: 'Abrindo Finanças.', actions: [OPEN] };
    return summary(ctx);
  },
};
