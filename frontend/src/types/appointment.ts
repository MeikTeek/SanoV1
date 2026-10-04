export type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';

export interface Appointment {
  id: string;
  title: string;
  description: string | null;
  participants: string | null;
  startsAt: string;
  endsAt: string | null;
  remindBefore: number | null;
  reminderSentAt: string | null;
  status: AppointmentStatus;
  createdAt: string;
}

export interface AppointmentInput {
  title: string;
  description?: string;
  participants?: string;
  startsAt: string;
  endsAt?: string;
  remindBefore?: number | null;
}