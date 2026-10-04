import { z } from 'zod';

const isoDate = z.string().datetime({ message: 'Data/hora inválida (use ISO 8601)' });

export const createAppointmentSchema = z.object({
  title: z.string().trim().min(1, 'Informe um título').max(140),
  description: z.string().trim().max(1000).optional(),
  participants: z.string().trim().max(200).optional(),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  remindBefore: z.number().int().min(0).max(60 * 24 * 7).nullish(), // até 7 dias
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(['PENDING', 'DONE', 'CANCELED']).optional(),
});

export const listQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });