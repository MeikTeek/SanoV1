import { z } from 'zod';
import { RECURRENCES } from '../services/agenda/recurrence';

const isoDate = z.string().datetime({ message: 'Data/hora inválida (use ISO 8601)' });

export const createAppointmentSchema = z.object({
  title: z.string().trim().min(1, 'Informe um título').max(140),
  description: z.string().trim().max(1000).nullish(),
  participants: z.string().trim().max(200).nullish(),
  location: z.string().trim().max(200).nullish(),
  startsAt: isoDate,
  endsAt: isoDate.nullish(),
  allDay: z.boolean().optional(),
  remindBefore: z.number().int().min(0).max(60 * 24 * 7).nullish(), // até 7 dias
  recurrence: z.enum(RECURRENCES).nullish(),
  recurrenceUntil: isoDate.nullish(),
});

export const updateAppointmentSchema = createAppointmentSchema
  .omit({ recurrence: true, recurrenceUntil: true })
  .partial()
  .extend({
    status: z.enum(['PENDING', 'DONE', 'CANCELED']).optional(),
    /** Em série: só esta ocorrência ou esta e as próximas. */
    scope: z.enum(['one', 'following']).default('one'),
  });

export const listQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const scopeQuerySchema = z.object({ scope: z.enum(['one', 'following']).default('one') });

export const parseSchema = z.object({ text: z.string().trim().min(1).max(300) });

export const idParamSchema = z.object({ id: z.string().uuid() });
