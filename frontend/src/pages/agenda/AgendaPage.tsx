import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import AppShell from '../../components/layout/AppShell';
import { ApiError } from '../../services/api';
import { createAppointment, deleteAppointment, listAppointments, updateAppointment } from '../../services/appointment.service';
import type { Appointment } from '../../types/appointment';
import '../../styles/agenda.css';

/** Converte "2026-10-04T09:00" (horário local do navegador) em ISO UTC. */
const toIso = (local: string) => new Date(local).toISOString();

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(iso));

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const remindLabel = (m: number | null) =>
  m === 0 ? 'na hora' : m === null ? 'sem lembrete' : m < 60 ? `${m} min antes` : `${Math.round(m / 60)}h antes`;

/** Default do formulário: amanhã, 09:00. */
const defaultStart = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AgendaPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', participants: '', start: defaultStart(), remindBefore: '15' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { appointments } = await listAppointments();
      setItems(appointments);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const upcoming = useMemo(() => items.filter((a) => new Date(a.startsAt).getTime() >= now), [items, now]);
  const past = useMemo(() => items.filter((a) => new Date(a.startsAt).getTime() < now).reverse(), [items, now]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const a of upcoming) {
      const key = fmtDay(a.startsAt);
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    return [...groups.entries()];
  }, [upcoming]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const remind = form.remindBefore === '' ? null : Number(form.remindBefore);
      await createAppointment({
        title: form.title,
        participants: form.participants || undefined,
        startsAt: toIso(form.start),
        remindBefore: remind,
      });
      setForm((f) => ({ ...f, title: '', participants: '' }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Appointment) => {
    if (!confirm(`Apagar "${a.title}"?`)) return;
    try {
      await deleteAppointment(a.id);
      // Sai da lista na hora, sem esperar a ida ao servidor.
      setItems((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      // 404 = já não existe mais; a lista local estava desatualizada, não é erro.
      if (err instanceof ApiError && err.status === 404) {
        setItems((prev) => prev.filter((x) => x.id !== a.id));
        return;
      }
      setError((err as Error).message);
    }
  };

  const toggleDone = async (a: Appointment) => {
    try {
      await updateAppointment(a.id, { status: a.status === 'DONE' ? 'PENDING' : 'DONE' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
return (
    <AppShell title="Agenda" status={`${upcoming.length} próximos`}>
      <section className="card">
        <h2>Novo compromisso</h2>
        <form className="inline agenda-form" onSubmit={submit}>
          <input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={140} />
          <input placeholder="Com quem (opcional)" value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} maxLength={200} />
          <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          <select value={form.remindBefore} onChange={(e) => setForm({ ...form, remindBefore: e.target.value })}>
            <option value="">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="10">10 min antes</option>
            <option value="15">15 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">1h antes</option>
            <option value="120">2h antes</option>
            <option value="1440">1 dia antes</option>
          </select>
          <button disabled={saving}>{saving ? 'Salvando…' : 'Adicionar'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        <small className="muted">Dica: no chat, o Sano entende frases como “agendar reunião com João amanhã às 14h”.</small>
      </section>

      {byDay.length === 0 && (
        <section className="card"><p className="muted">Nenhum compromisso futuro. Agenda livre.</p></section>
      )}

      {byDay.map(([day, list]) => (
        <section className="card" key={day}>
          <h2 style={{ textTransform: 'capitalize' }}>{day}</h2>
          {list.map((a) => <AppointmentRow key={a.id} a={a} onDelete={remove} onToggle={toggleDone} />)}
        </section>
      ))}

      {past.length > 0 && (
        <section className="card">
          <h2>Anteriores</h2>
          {past.slice(0, 10).map((a) => <AppointmentRow key={a.id} a={a} onDelete={remove} onToggle={toggleDone} past />)}
        </section>
      )}
    </AppShell>
  );
}

function AppointmentRow({ a, onDelete, onToggle, past }: {
  a: Appointment; onDelete: (a: Appointment) => void; onToggle: (a: Appointment) => void; past?: boolean;
}) {
  return (
    <div className={`appt ${a.status === 'DONE' ? 'done' : ''} ${past ? 'past' : ''}`}>
      <span className="appt-time">
        {fmtTime(a.startsAt)}{a.endsAt && `–${fmtTime(a.endsAt)}`}
      </span>
      <div className="appt-body">
        <b>{a.title}</b>
        <span className="muted">
          {a.participants && ` · com ${a.participants}`}
          {` · ${remindLabel(a.remindBefore)}`}
        </span>
      </div>
      <div className="appt-actions">
        <button className="ghost" onClick={() => onToggle(a)}>{a.status === 'DONE' ? 'Reabrir' : 'Feito'}</button>
        <button className="ghost" onClick={() => onDelete(a)}>Apagar</button>
      </div>
    </div>
  );
}