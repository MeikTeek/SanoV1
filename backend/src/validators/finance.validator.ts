import { z } from 'zod';
import { ACCOUNT_TYPES } from '../services/finance/service';

/** Valores trafegam em centavos inteiros: 12,50 → 1250. */
const cents = z.number().int().min(-99_999_999_999).max(99_999_999_999);
const name = z.string().trim().min(1, 'Informe um nome').max(100);
const id = z.string().uuid();

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mês no formato AAAA-MM.');
export const daySchema = z.string().date('Data inválida (AAAA-MM-DD).');
export const idSchema = id;

export const accountCreateSchema = z.object({
  name,
  type: z.enum(ACCOUNT_TYPES).default('CHECKING'),
  offBudget: z.boolean().default(false),
  balance: cents.default(0),
  date: daySchema.default(() => new Date().toISOString().slice(0, 10)),
});

export const accountUpdateSchema = z.object({
  name: name.optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  closed: z.boolean().optional(),
});

export const groupCreateSchema = z.object({ name, isIncome: z.boolean().default(false) });
export const groupUpdateSchema = z.object({ name: name.optional(), hidden: z.boolean().optional() });

export const categoryCreateSchema = z.object({ groupId: id, name });
export const categoryUpdateSchema = z.object({
  name: name.optional(),
  hidden: z.boolean().optional(),
  groupId: id.optional(),
});
export const categoryDeleteSchema = z.object({ transferTo: id.optional() });

export const budgetSchema = z.object({
  month: monthSchema,
  categoryId: id,
  budgeted: cents.min(0, 'O valor orçado não pode ser negativo.').optional(),
  carryover: z.boolean().optional(),
});

export const transactionSchema = z.object({
  accountId: id,
  date: daySchema,
  amount: cents.refine((value) => value !== 0, 'O valor não pode ser zero.'),
  payee: z.string().trim().max(200).nullish(),
  categoryId: id.nullish(),
  notes: z.string().trim().max(500).nullish(),
  cleared: z.boolean().optional(),
  transferAccountId: id.nullish(),
});

export const clearedSchema = z.object({ cleared: z.boolean() });

export const transactionQuerySchema = z.object({
  accountId: id.optional(),
  month: monthSchema.optional(),
  search: z.string().max(100).optional(),
  categoryId: id.optional(),
  uncategorized: z.enum(['1', 'true']).optional().transform(Boolean),
});

export const importSchema = z.object({
  accountId: id,
  commit: z.boolean().default(false),
  rows: z.array(z.object({
    line: z.number().int().positive(),
    date: z.string().max(30),
    amount: z.string().max(40),
    payee: z.string().max(200),
    notes: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
  })).min(1, 'O arquivo não tem linhas.').max(5000, 'Importe no máximo 5.000 linhas por vez.'),
});
