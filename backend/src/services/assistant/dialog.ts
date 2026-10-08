export type PendingAssistantAction =
  | {
      type: 'draft';
      operation?: 'create' | 'update';
      appointmentId?: string;
      title: string;
      date: string | null;
      participants?: string;
      remindBefore?: number | null;
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
      createdAt: string;
    }
  | {
      type: 'cancel';
      appointmentId: string;
      title: string;
      startsAt: string;
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
    createdAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('cancel'),
    appointmentId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime(),
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
  if (/^(sim|confirmar|confirmo|confirma|isso|isso mesmo|pode|pode sim|pode cancelar|vai|autorizo)$/.test(normalized)) return 'confirm';
  return 'other';
}
import { z } from 'zod';
