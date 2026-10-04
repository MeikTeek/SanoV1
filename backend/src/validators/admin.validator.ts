import { z } from 'zod';

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.-]{3,32}$/, 'Use 3-32 caracteres: letras, números, _ . -'),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
});

export const setActiveSchema = z.object({ active: z.boolean() });

export const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  userId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
