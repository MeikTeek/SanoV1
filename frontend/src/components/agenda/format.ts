import type { Appointment, Recurrence } from '../../types/appointment';

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  DAILY: 'Todo dia',
  WEEKDAYS: 'Dias úteis',
  WEEKLY: 'Toda semana',
  MONTHLY: 'Todo mês',
  YEARLY: 'Todo ano',
};

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sem lembrete' },
  { value: '0', label: 'Na hora' },
  { value: '5', label: '5 min antes' },
  { value: '15', label: '15 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '1440', label: '1 dia antes' },
  { value: '2880', label: '2 dias antes' },
];

export function reminderLabel(minutes: number | null) {
  if (minutes === null) return null;
  return REMINDER_OPTIONS.find((o) => o.value === String(minutes))?.label
    ?? (minutes < 60 ? `${minutes} min antes` : minutes < 1440 ? `${Math.round(minutes / 60)}h antes` : `${Math.round(minutes / 1440)} dias antes`);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Chave local do dia (AAAA-MM-DD) — o navegador já está no fuso do usuário. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDayKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // segunda

export const hm = (iso: string) => {
  const d = new Date(iso);
  return d.getMinutes() ? `${d.getHours()}h${pad(d.getMinutes())}` : `${d.getHours()}h`;
};

export function timeRange(a: Appointment) {
  if (a.allDay) return 'Dia inteiro';
  return a.endsAt ? `${hm(a.startsAt)} – ${hm(a.endsAt)}` : hm(a.startsAt);
}

export function dayTitle(d: Date, today = new Date()) {
  const key = dayKey(d);
  if (key === dayKey(today)) return 'Hoje';
  if (key === dayKey(addDays(today, 1))) return 'Amanhã';
  if (key === dayKey(addDays(today, -1))) return 'Ontem';
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-10-23T15:00" para <input type="datetime-local"> / date / time. */
export const toDateInput = (d: Date) => dayKey(d);
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const combine = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
};

/** Até quando falta: "em 20 min", "em 3h", "amanhã". */
export function relativeLabel(iso: string, now = new Date()) {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff < 0) return diff > -3_600_000 ? 'agora' : '';
  if (diff < 3_600_000) return `em ${Math.max(1, Math.round(diff / 60_000))} min`;
  if (dayKey(new Date(iso)) === dayKey(now)) return `em ${Math.round(diff / 3_600_000)}h`;
  return '';
}
