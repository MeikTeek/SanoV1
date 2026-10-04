import { api } from './api';
import type { Appointment, AppointmentInput } from '../types/appointment';

export const listAppointments = (from?: string, to?: string) => {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return api.get<{ appointments: Appointment[] }>(`/appointments${qs ? `?${qs}` : ''}`);
};

export const createAppointment = (data: AppointmentInput) =>
  api.post<{ appointment: Appointment }>('/appointments', data);

export const updateAppointment = (id: string, data: Partial<AppointmentInput> & { status?: string }) =>
  api.patch<{ appointment: Appointment }>(`/appointments/${id}`, data);

export const deleteAppointment = (id: string) => api.delete<{ ok: true }>(`/appointments/${id}`);

/** Lembretes vencidos; o servidor os marca como enviados ao responder. */
export const fetchDueReminders = () =>
  api.get<{ reminders: Appointment[] }>('/appointments/due');