import type { Request, Response } from 'express';
import { AppError } from '../utils/errors';
import {
  createAppointmentSchema, updateAppointmentSchema, listQuerySchema, idParamSchema, parseSchema, scopeQuerySchema,
} from '../validators/appointment.validator';
import {
  listAppointments, createAppointment, updateAppointment, updateFollowing, deleteAppointment, deleteFollowing,
  findDueReminders, markReminded,
} from '../services/agenda/service';
import { understandAgenda } from '../services/agenda/nlu';
import { localDayBounds } from '../services/assistant/dateTime';
import { logAudit } from '../services/audit.service';

const toDate = (value?: string | null) => (value === null ? null : value ? new Date(value) : undefined);

export async function list(req: Request, res: Response) {
  const { from, to } = listQuerySchema.parse(req.query);
  res.json({
    appointments: await listAppointments(req.user!.id, from ? new Date(from) : undefined, to ? new Date(to) : undefined),
  });
}

export async function create(req: Request, res: Response) {
  const data = createAppointmentSchema.parse(req.body);
  if (data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
    throw new AppError(400, 'O término deve ser depois do início');
  }

  const appointment = await createAppointment(req.user!.id, {
    ...data,
    startsAt: new Date(data.startsAt),
    endsAt: toDate(data.endsAt),
    recurrenceUntil: toDate(data.recurrenceUntil),
  });

  await logAudit(req, 'AGENDA_CREATED', req.user!.id, { id: appointment.id });
  res.status(201).json({ appointment });
}

/**
 * Interpreta uma frase ("dentista sexta às 15h") e devolve a prévia, sem
 * salvar. É o que alimenta a criação rápida da tela: o mesmo entendimento do chat.
 */
export async function parse(req: Request, res: Response) {
  const { text } = parseSchema.parse(req.body);
  const now = new Date();
  const r = understandAgenda(text, now);
  const s = r.schedule;
  if (r.act !== 'create' || !s) return res.json({ preview: null });
  const allDay = !!r.allDay;
  const startsAt = allDay ? localDayBounds(s.startsAt).start : s.startsAt;
  res.json({
    preview: {
      title: s.title,
      participants: s.participants ?? null,
      location: r.location ?? null,
      startsAt: s.missing === 'date' || s.missing === 'title' ? null : startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
      allDay,
      recurrence: r.recurrence ?? null,
      remindBefore: r.remindMinutes !== undefined ? r.remindMinutes : s.remindBeforeMinutes ?? (allDay ? null : 15),
      missing: allDay && s.missing === 'time' ? null : s.missing ?? null,
    },
  });
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const { scope, ...data } = updateAppointmentSchema.parse(req.body);
  const input = { ...data, startsAt: toDate(data.startsAt) ?? undefined, endsAt: toDate(data.endsAt) };
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new AppError(400, 'O término deve ser depois do início');
  }

  const appointment = await (scope === 'following' ? updateFollowing(req.user!.id, id, input) : updateAppointment(req.user!.id, id, input))
    .catch(() => { throw new AppError(404, 'Compromisso não encontrado'); });

  await logAudit(req, 'AGENDA_UPDATED', req.user!.id, { id, fields: Object.keys(data), scope });
  res.json({ appointment });
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const { scope } = scopeQuerySchema.parse(req.query);
  if (scope === 'following') {
    const { count } = await deleteFollowing(req.user!.id, id);
    if (!count) throw new AppError(404, 'Compromisso não encontrado');
  } else {
    await deleteAppointment(req.user!.id, id).catch(() => { throw new AppError(404, 'Compromisso não encontrado'); });
  }
  await logAudit(req, 'AGENDA_DELETED', req.user!.id, { id, scope });
  res.json({ ok: true });
}

/**
 * Lembretes que já venceram. Marca como avisados antes de responder, para que
 * dois polling simultâneos não gerem a mesma notificação duas vezes.
 */
export async function due(req: Request, res: Response) {
  const pending = await findDueReminders(req.user!.id);
  const marked = await Promise.all(pending.map((a) => markReminded(req.user!.id, a.id)));
  // Só devolve o que ESTA chamada marcou: outra aba pode ter levado o mesmo lembrete.
  res.json({ reminders: pending.filter((_, i) => marked[i].count > 0) });
}
