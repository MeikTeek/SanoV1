import { z } from 'zod';

export type PendingAssistantAction =
  | {
      type: 'draft';
      operation?: 'create' | 'update';
      appointmentId?: string;
      title: string;
      date: string | null;
      participants?: string;
      remindBefore?: number | null;
      location?: string;
      allDay?: boolean;
      recurrence?: 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
      createdAt: string;
    }
  | {
      type: 'create' | 'update';
      title: string;
      startsAt: string;
      endsAt?: string | null;
      participants?: string;
      remindBefore?: number | null;
      appointmentId?: string;
      location?: string;
      allDay?: boolean;
      recurrence?: 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
      recurrenceUntil?: string;
      createdAt: string;
    }
  | {
      type: 'cancel';
      appointmentId: string;
      title: string;
      startsAt: string;
      /** Ocorrência de série: a resposta escolhe "só essa" ou "todas as próximas". */
      seriesId?: string;
      createdAt: string;
    }
  | {
      type: 'cancel-day';
      startsAt: string;
      endsAt: string;
      count: number;
      createdAt: string;
    };

export type DialogReply = 'confirm' | 'cancel' | 'other';

export const pendingAssistantActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('draft'),
    operation: z.enum(['create', 'update']).optional(),
    appointmentId: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(160),
    date: z.string().datetime().nullable(),
    participants: z.string().max(500).optional(),
    remindBefore: z.number().int().min(0).max(43_200).nullable().optional(),
    location: z.string().max(200).optional(),
    allDay: z.boolean().optional(),
    recurrence: z.enum(['DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    type: z.enum(['create', 'update']),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    participants: z.string().max(500).optional(),
    remindBefore: z.number().int().min(0).max(43_200).nullable().optional(),
    appointmentId: z.string().min(1).optional(),
    location: z.string().max(200).optional(),
    allDay: z.boolean().optional(),
    recurrence: z.enum(['DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    recurrenceUntil: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('cancel'),
    appointmentId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime(),
    seriesId: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('cancel-day'),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    count: z.number().int().positive(),
    createdAt: z.string().datetime(),
  }),
]);

export function isPendingAssistantAction(value: unknown): value is PendingAssistantAction {
  return pendingAssistantActionSchema.safeParse(value).success;
}

export function classifyDialogReply(text: string): DialogReply {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(nao|cancela|cancele|cancelar|cancela essa|cancela isso|cancelar acao|deixa|deixa pra la|volta|desiste)$/.test(normalized)) return 'cancel';
  if (/^(sim|s|confirmar|confirmo|confirma|isso|isso mesmo|pode|pode sim|pode cancelar|pode marcar|pode salvar|vai|manda|beleza|ok|claro|com certeza|autorizo|marca mesmo assim|mesmo assim)$/.test(normalized)) return 'confirm';
  // "sim, marca mesmo assim", "ok pode cancelar": confirmação com o verbo junto.
  if (/^(?:sim|s|ok|pode|beleza|claro)?\s*(?:pode\s+)?(?:marcar|marca|marque|salvar|salva|confirmar|confirma|cancelar|cancela|apagar|apaga)?\s*(?:mesmo assim|sim)?$/.test(normalized)
    && /^(sim|s|ok|pode|beleza|claro)\b|mesmo assim$/.test(normalized)) return 'confirm';
  return 'other';
}

/** Ocorrência de série: "só essa" ou "todas as próximas"? */
export function classifySeriesScope(text: string): 'one' | 'series' | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(so )?(essa|esta|a proxima|a de [\w ]+|apenas essa|so a proxima|so uma|uma)( mesmo| so)?$/.test(normalized)) return 'one';
  if (/\b(todas|todos|tudo|a serie|serie toda|serie inteira|todas as proximas|sempre)\b/.test(normalized)) return 'series';
  return null;
}
