import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api';
import { fetchDueReminders } from '../../services/appointment.service';
import { useAuth } from '../../context/AuthContext';
import type { Appointment } from '../../types/appointment';

const POLL_MS = 30_000;

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

const leadText = (minutes: number | null) =>
  minutes === 0 ? 'agora' : minutes ? `em ${minutes} min` : '';

interface Props {
  /** Avisa a página de agenda que a lista mudou (para recarregar). */
  onReminder?: (a: Appointment) => void;
}

/**
 * Fica ouvindo os lembretes enquanto o app estiver aberto.
 *
 * O push com o navegador fechado (Service Worker) fica para a Fase 5; aqui é
 * polling — o servidor marca o lembrete como enviado ao responder, então cada
 * lembrete é sempre entregue uma única vez, mesmo com várias abas abertas.
 */
export default function ReminderWatcher({ onReminder }: Props) {
  const { setUser } = useAuth();
  const [active, setActive] = useState<Appointment[]>([]);
  const timer = useRef<number>();
  const fired = useRef(new Set<string>()); // evita repetir o mesmo lembrete na tela

  const show = useCallback((reminders: Appointment[]) => {
    if (!reminders.length) return;
    setActive((prev) => [...prev, ...reminders]);

    // Notificação do navegador, se o usuário já autorizou.
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const a of reminders) {
        const lead = leadText(a.remindBefore);
        try {
          new Notification(`Sano · ${a.title}`, {
            body: `${lead ? `${lead} · ` : ''}${fmt(a.startsAt)}${a.participants ? ` · com ${a.participants}` : ''}`,
            tag: a.id, // substitui a notificação anterior do mesmo compromisso
          });
        } catch {
          /* alguns navegadores exigem service worker; o aviso na tela já apareceu */
        }
      }
    }

    onReminder?.(reminders[reminders.length - 1]);
  }, [onReminder]);

  const poll = useCallback(async () => {
    try {
      const { reminders } = await fetchDueReminders();
      const fresh = reminders.filter((a) => !fired.current.has(a.id));
      fresh.forEach((a) => fired.current.add(a.id));
      if (fresh.length) show(fresh);
    } catch (err) {
      // 401 = sessão expirou: deixa o ProtectedRoute levar ao login.
      if (err instanceof ApiError && err.status === 401) setUser(null);
    }
  }, [show, setUser]);

  useEffect(() => {
    poll();
    timer.current = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer.current);
  }, [poll]);

  const dismiss = (id: string) => setActive((prev) => prev.filter((a) => a.id !== id));

  if (!active.length) return null;

  return (
    <div className="reminders" role="status" aria-live="polite">
      {active.map((a) => (
        <div key={a.id} className="reminder">
          <span className="bell">⏰</span>
          <div>
            <b>{a.title}</b>
            <span className="muted">
              {' · '}{fmt(a.startsAt)}
              {a.remindBefore ? ` · avisei ${leadText(a.remindBefore)} antes` : ''}
              {a.participants ? ` · com ${a.participants}` : ''}
            </span>
          </div>
          <button className="ghost" onClick={() => dismiss(a.id)} aria-label="Dispensar lembrete">OK</button>
        </div>
      ))}
    </div>
  );
}