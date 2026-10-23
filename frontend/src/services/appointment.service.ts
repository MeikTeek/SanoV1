import { api } from './api';
import { notifyAgendaChanged } from '../native/bridge';
import type { Appointment, AppointmentInput, AppointmentPreview } from '../types/appointment';

export type SeriesScope = 'one' | 'following';

export const listAppointments = (from?: string, to?: string) => {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return api.get<{ appointments: Appointment[] }>(`/appointments${qs ? `?${qs}` : ''}`);
};

/** Repassa o resultado e avisa quem acompanha a agenda (app Android). */
const changed = <T,>(p: Promise<T>) => p.then((r) => { notifyAgendaChanged(); return r; });

export const createAppointment = (data: AppointmentInput) =>
  changed(api.post<{ appointment: Appointment }>('/appointments', data));

export const updateAppointment = (id: string, data: Partial<AppointmentInput> & { status?: string; scope?: SeriesScope }) =>
  changed(api.patch<{ appointment: Appointment }>(`/appointments/${id}`, data));

export const deleteAppointment = (id: string, scope: SeriesScope = 'one') =>
  changed(api.delete<{ ok: true }>(`/appointments/${id}${scope === 'following' ? '?scope=following' : ''}`));

/** Interpreta a frase da criação rápida sem salvar. */
export const previewAppointment = (text: string) =>
  api.post<{ preview: AppointmentPreview | null }>('/appointments/parse', { text });

/** Lembretes vencidos; o servidor os marca como enviados ao responder. */
export const fetchDueReminders = () =>
  api.get<{ reminders: Appointment[] }>('/appointments/due');
