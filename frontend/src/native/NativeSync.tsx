import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { listAppointments } from '../services/appointment.service';
import type { Appointment } from '../types/appointment';
import {
  isNativeApp, nativeLogout, onAgendaChanged, syncNativeReminders, updateNativeWidget,
  type NativeReminder, type WidgetData,
} from './bridge';

/** Janela de lembretes entregues ao Android para agendar. */
const AHEAD_DAYS = 14;
/** Limite de lembretes agendados de uma vez (o Android tem teto por app). */
const MAX_REMINDERS = 60;
const REFRESH_MS = 5 * 60_000;
/** Evita sincronizar várias vezes seguidas (ex.: várias edições em sequência). */
const MIN_GAP_MS = 4_000;

const hhmm = (d: Date) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function whenLabel(a: Appointment, now: Date) {
  const d = new Date(a.startsAt);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day = sameDay(d, now) ? 'Hoje'
    : sameDay(d, tomorrow) ? 'Amanhã'
      : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  return a.allDay ? `${day} · dia todo` : `${day} às ${hhmm(d)}`;
}

/** Lembretes futuros, no formato que o app agenda. */
function toReminders(list: Appointment[], now: Date): NativeReminder[] {
  return list
    .filter((a) => a.status === 'PENDING' && a.remindBefore !== null)
    .map((a) => {
      const start = new Date(a.startsAt);
      const at = start.getTime() - (a.remindBefore ?? 0) * 60_000;
      const lead = a.remindBefore ? `em ${a.remindBefore} min` : 'agora';
      return {
        at,
        title: `Sano · ${a.title}`,
        body: `${lead} · ${a.allDay ? 'dia todo' : hhmm(start)}${a.participants ? ` · com ${a.participants}` : ''}${a.location ? ` · ${a.location}` : ''}`,
        path: '/agenda',
      };
    })
    .filter((r) => r.at > now.getTime())
    .sort((x, y) => x.at - y.at)
    .slice(0, MAX_REMINDERS);
}

function toWidget(list: Appointment[], now: Date): WidgetData {
  const pending = list
    .filter((a) => a.status === 'PENDING')
    .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
  const today = pending.filter((a) => sameDay(new Date(a.startsAt), now));
  const next = pending.find((a) => new Date(a.endsAt ?? a.startsAt).getTime() >= now.getTime()) ?? null;
  const dayLabel = `Hoje · ${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(now)}`;
  return {
    dayLabel,
    next: next ? { title: next.title, when: whenLabel(next, now) } : null,
    items: today.slice(0, 5).map((a) => ({ time: a.allDay ? 'Dia todo' : hhmm(new Date(a.startsAt)), title: a.title })),
  };
}

/**
 * Só existe dentro do app Android: mantém os lembretes agendados no sistema e
 * o widget da tela inicial em dia com a agenda. Roda ao abrir, a cada 5 min,
 * quando a agenda muda e quando o app volta ao primeiro plano.
 */
export default function NativeSync() {
  const { user } = useAuth();
  const last = useRef(0);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!user) {
      // Saiu da conta: nada de lembretes de outra pessoa no aparelho.
      if (wasSignedIn.current) void nativeLogout();
      wasSignedIn.current = false;
      return;
    }
    wasSignedIn.current = true;

    let alive = true;
    const sync = async (force = false) => {
      if (!force && Date.now() - last.current < MIN_GAP_MS) return;
      last.current = Date.now();
      const now = new Date();
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      const to = new Date(now.getTime() + AHEAD_DAYS * 86_400_000);
      try {
        const { appointments } = await listAppointments(from.toISOString(), to.toISOString());
        if (!alive) return;
        await syncNativeReminders(toReminders(appointments, now));
        await updateNativeWidget(toWidget(appointments, now));
      } catch {
        // Sem rede: os lembretes já agendados continuam valendo.
      }
    };

    void sync(true);
    const timer = window.setInterval(() => void sync(true), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    document.addEventListener('visibilitychange', onVisible);
    const offAgenda = onAgendaChanged(() => void sync(true));
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      offAgenda();
    };
  }, [user?.id]);

  return null;
}
