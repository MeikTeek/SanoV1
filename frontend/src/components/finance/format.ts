const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos → "R$ 1.234,56". */
export const money = (cents: number) => brl.format(cents / 100);
/** Centavos → "1.234,56" (para campos editáveis). */
export const moneyPlain = (cents: number) => plain.format(cents / 100);

/** "1.234,56", "12.5", "-3" → centavos. null quando não é número. */
export function parseMoneyInput(raw: string): number | null {
  let text = raw.replace(/[R$\s ]/g, '');
  const negative = text.startsWith('-');
  text = text.replace(/^[-+]/, '');
  if (!text) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return negative ? -cents : cents;
}

/** Data local (não UTC): à noite no Brasil o UTC já é o dia seguinte. */
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const currentMonth = () => today().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string, style: 'long' | 'short' = 'long') {
  const [year, mon] = month.split('-').map(Number);
  const text = new Intl.DateTimeFormat('pt-BR', { month: style, ...(style === 'long' && { year: 'numeric' }) })
    .format(new Date(year, mon - 1, 1));
  return text.charAt(0).toUpperCase() + text.slice(1).replace('.', '');
}

export const dayLabel = (date: string) => date.split('-').reverse().join('/');

export const ACCOUNT_TYPE_LABEL = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CREDIT: 'Cartão de crédito',
  CASH: 'Dinheiro',
  INVESTMENT: 'Investimento',
  OTHER: 'Outra',
} as const;

/** Separa um CSV em linhas/células, detectando `;` ou `,` e respeitando aspas. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (char === '\n') {
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else if (char !== '\r') cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  date: ['data', 'date', 'data lançamento', 'data lancamento', 'dt'],
  payee: ['descrição', 'descricao', 'description', 'histórico', 'historico', 'beneficiário', 'beneficiario', 'payee', 'estabelecimento', 'título', 'titulo', 'lançamento', 'lancamento'],
  amount: ['valor', 'amount', 'valor (r$)', 'quantia'],
  category: ['categoria', 'category'],
  notes: ['notas', 'notes', 'observação', 'observacao', 'memo'],
} as const;

export type CsvColumn = keyof typeof HEADER_ALIASES;

/** Adivinha qual coluna é qual pelo cabeçalho; o usuário pode corrigir na tela. */
export function guessColumns(headers: string[]): Record<CsvColumn, number> {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const find = (key: CsvColumn) => normalized.findIndex((h) => (HEADER_ALIASES[key] as readonly string[]).includes(h));
  return { date: find('date'), payee: find('payee'), amount: find('amount'), category: find('category'), notes: find('notes') };
}
