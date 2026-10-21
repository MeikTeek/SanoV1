export type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';
export type Recurrence = 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Appointment {
  id: string;
  title: string;
  description: string | null;
  participants: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay?: boolean;
  remindBefore: number | null;
  reminderSentAt: string | null;
  status: AppointmentStatus;
  seriesId?: string | null;
  recurrence?: Recurrence | null;
  createdAt: string;
}

export interface AppointmentInput {
  title: string;
  description?: string | null;
  participants?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  remindBefore?: number | null;
  recurrence?: Recurrence | null;
}

/** Prévia da criação rápida ("dentista sexta às 15h"), interpretada pelo servidor. */
export interface AppointmentPreview {
  title: string;
  participants: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  recurrence: Recurrence | null;
  remindBefore: number | null;
  missing: 'title' | 'date' | 'time' | null;
}
