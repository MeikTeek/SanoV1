import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import {
  createAppointmentSchema, updateAppointmentSchema, listQuerySchema, idParamSchema,
} from '../validators/appointment.validator';
import {
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  findDueReminders, markReminded,
} from '../services/agenda/service';
import { logAudit } from '../services/audit.service';

export async function list(req: Request, res: Response) {
  const { from, to } = listQuerySchema.parse(req.query);
  res.json({
    appointments: await listAppointments(req.user!.id, from ? new Date(from) : undefined, to ? new Date(to) : undefined),
  });
}

export async function create(req: Request, res: Response) {
  const data = createAppointmentSchema.parse(req.body);

  // Coerção de tipos: o body chega como string.
  if (data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
    throw new AppError(400, 'O término deve ser depois do início');
  }

  const appointment = await createAppointment(req.user!.id, {
    ...data,
    startsAt: new Date(data.startsAt),
    endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
  });

  await logAudit(req, 'AGENDA_CREATED', req.user!.id, { id: appointment.id });
  res.status(201).json({ appointment });
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const data = updateAppointmentSchema.parse(req.body);

  const appointment = await updateAppointment(req.user!.id, id, {
    ...data,
    startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
    endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
  }).catch(() => { throw new AppError(404, 'Compromisso não encontrado'); });

  await logAudit(req, 'AGENDA_UPDATED', req.user!.id, { id, fields: Object.keys(data) });
  res.json({ appointment });
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await deleteAppointment(req.user!.id, id).catch(() => { throw new AppError(404, 'Compromisso não encontrado'); });
  await logAudit(req, 'AGENGA_DELETED', req.user!.id, { id });
  res.json({ ok: true });
}

/**
 * Lembretes que já venceram. Marca como avisados antes de responder, para que
 * dois polling simultâneos não gerem a mesma notificação duas vezes.
 */
export async function due(req: Request, res: Response) {
  const pending = await findDueReminders(req.user!.id);
  const marked = await Promise.all(pending.map((a) => markReminded(req.user!.id, a.id)));
  res.json({ reminders: marked.map((_, i) => pending[i]) });
}