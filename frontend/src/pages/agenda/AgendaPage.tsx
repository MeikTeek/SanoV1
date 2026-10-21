import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import ReminderWatcher from '../../components/agenda/ReminderWatcher';
import MiniCalendar from '../../components/agenda/MiniCalendar';
import EventEditor from '../../components/agenda/EventEditor';
import QuickAdd from '../../components/agenda/QuickAdd';
import {
  RECURRENCE_LABEL, addDays, dayKey, dayTitle, fromDayKey, reminderLabel, relativeLabel, startOfWeek, timeRange,
} from '../../components/agenda/format';
import { ApiError } from '../../services/api';
import {
  createAppointment, deleteAppointment, listAppointments, updateAppointment, type SeriesScope,
} from '../../services/appointment.service';
import type { Appointment, AppointmentInput } from '../../types/appointment';
import '../../styles/agenda.css';

/**
 * Agenda:
 *
 *   ┌ calendário ┐ ┌ criação rápida por frase ───────────────┐
 *   │ próximos   │ │ [Lista | Semana]  compromissos do período │
 *   └────────────┘ └──────────────────────────────────────────┘   [editor]
 *
 * O dia escolhido no calendário guia as duas visões.
 */
type View = 'list' | 'week';
type Editing = { kind: 'new'; initial?: Partial<AppointmentInput> } | { kind: 'edit'; appointment: Appointment } | null;

const VIEW_KEY = 'sano:agenda:view';

export default function AgendaPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(dayKey(new Date()));
  const [month, setMonth] = useState(() => new Date());
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || 'list'; } catch { return 'list'; }
  });
  const [editing, setEditing] = useState<Editing>(null);
  const [showDone, setShowDone] = useState(false);
  // Quantas semanas a lista mostra a partir do dia escolhido; "Mostrar mais" soma 8.
  const [listWeeks, setListWeeks] = useState(8);
  useEffect(() => { setListWeeks(8); }, [selected]);

  // Janela carregada: o calendário exibido e a lista inteira (o servidor estende as
  // séries recorrentes até o fim dessa janela — não há limite de ocorrências).
  const from = useMemo(() => {
    const calendarStart = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
    const listStart = fromDayKey(selected);
    return calendarStart < listStart ? calendarStart : listStart;
  }, [month, selected]);
  const listEnd = useMemo(() => addDays(fromDayKey(selected), listWeeks * 7), [selected, listWeeks]);
  const to = useMemo(() => {
    const monthEnd = addDays(startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1)), 42);
    return monthEnd > listEnd ? monthEnd : listEnd;
  }, [month, listEnd]);

  const load = useCallback(async () => {
    try {
      const { appointments } = await listAppointments(from.toISOString(), to.toISOString());
      setItems(appointments);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const chooseView = (next: View) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* só não lembra a escolha */ }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of items) if (a.status === 'PENDING') map.set(dayKey(new Date(a.startsAt)), (map.get(dayKey(new Date(a.startsAt))) ?? 0) + 1);
    return map;
  }, [items]);

  const visible = items.filter((a) => showDone || a.status !== 'DONE');
  const now = new Date();
  const todayKey = dayKey(now);
  const upcoming = items.filter((a) => a.status === 'PENDING' && new Date(a.endsAt ?? a.startsAt) >= now).slice(0, 5);
  const todayCount = counts.get(todayKey) ?? 0;

  // Lista: do dia escolhido em diante, agrupada por dia.
  const listDays = useMemo(() => {
    const startKey = selected;
    const groups = new Map<string, Appointment[]>();
    const endKey = dayKey(listEnd);
    for (const a of visible) {
      const key = dayKey(new Date(a.startsAt));
      if (key < startKey || key >= endKey) continue;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    if (!groups.has(startKey)) groups.set(startKey, []);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible, selected, listEnd]);

  const weekStart = startOfWeek(fromDayKey(selected));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { await load(); return; }
      setError((e as Error).message);
    }
  };

  const toggleDone = (a: Appointment) => run(() => updateAppointment(a.id, { status: a.status === 'DONE' ? 'PENDING' : 'DONE' }));

  const save = async (input: AppointmentInput, scope: SeriesScope) => {
    if (editing?.kind === 'edit') await updateAppointment(editing.appointment.id, { ...input, scope });
    else await createAppointment(input);
    setEditing(null);
    setSelected(dayKey(new Date(input.startsAt)));
    await load();
  };

  const remove = async (scope: SeriesScope) => {
    if (editing?.kind !== 'edit') return;
    await deleteAppointment(editing.appointment.id, scope);
    setEditing(null);
    await load();
  };

  const card = (a: Appointment, compact = false) => {
    const rel = a.status === 'PENDING' ? relativeLabel(a.startsAt, now) : '';
    const past = new Date(a.endsAt ?? a.startsAt) < now;
    return (
      <article key={a.id} className={`ag-item ${a.status === 'DONE' ? 'done' : ''} ${past ? 'past' : ''} ${compact ? 'compact' : ''}`}>
        <button type="button" className={`ag-check-btn ${a.status === 'DONE' ? 'on' : ''}`} aria-pressed={a.status === 'DONE'}
          title={a.status === 'DONE' ? 'Reabrir' : 'Marcar como feito'} onClick={() => void toggleDone(a)}>✓</button>
        <button type="button" className="ag-item-main" onClick={() => setEditing({ kind: 'edit', appointment: a })}>
          <span className="ag-item-time">{timeRange(a)}</span>
          <span className="ag-item-body">
            <b>{a.title}</b>
            {!compact && (
              <span className="ag-item-meta">
                {a.participants && <span>com {a.participants}</span>}
                {a.location && <span>{a.location}</span>}
                {a.recurrence && <span>↻ {RECURRENCE_LABEL[a.recurrence]}</span>}
                {reminderLabel(a.remindBefore) && <span>🔔 {reminderLabel(a.remindBefore)}</span>}
              </span>
            )}
          </span>
          {rel && <span className="ag-item-rel">{rel}</span>}
        </button>
      </article>
    );
  };

  return (
    <AppShell title="Agenda" status={todayCount ? `${todayCount} hoje` : 'dia livre hoje'} flush>
      <ReminderWatcher onReminder={() => void load()} />
      <div className={`ag-page ${editing ? 'with-editor' : ''}`}>
        <aside className="ag-side">
          <MiniCalendar
            month={month}
            selected={selected}
            counts={counts}
            onSelect={(key) => { setSelected(key); const d = fromDayKey(key); if (d.getMonth() !== month.getMonth()) setMonth(d); }}
            onMonth={(delta) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))}
          />
          <section className="ag-next">
            <h3>Próximos</h3>
            {upcoming.length === 0 && <p className="muted">Nada pela frente.</p>}
            {upcoming.map((a) => (
              <button key={a.id} type="button" className="ag-next-item" onClick={() => setEditing({ kind: 'edit', appointment: a })}>
                <span className="ag-next-day">{dayTitle(new Date(a.startsAt))}</span>
                <b>{a.title}</b>
                <small>{timeRange(a)}{relativeLabel(a.startsAt, now) && ` · ${relativeLabel(a.startsAt, now)}`}</small>
              </button>
            ))}
          </section>
          <p className="ag-tip">Dica: no chat, diga “marca dentista sexta às 15h” ou “o que tenho essa semana?”.</p>
        </aside>

        <main className="ag-main">
          <QuickAdd
            onCreated={load}
            onNeedsDetails={(p) => setEditing({
              kind: 'new',
              initial: {
                title: p.title, participants: p.participants, location: p.location, allDay: p.allDay,
                remindBefore: p.remindBefore, recurrence: p.recurrence, recurrenceUntil: p.recurrenceUntil,
                ...(p.startsAt && { startsAt: p.startsAt }),
              },
            })}
          />

          <div className="ag-toolbar">
            <div className="ag-seg" role="tablist" aria-label="Visão">
              <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => chooseView('list')}>Lista</button>
              <button type="button" role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => chooseView('week')}>Semana</button>
            </div>
            <div className="ag-nav">
              <button type="button" className="ag-icon-btn" aria-label={view === 'week' ? 'Semana anterior' : 'Dia anterior'}
                onClick={() => setSelected(dayKey(addDays(fromDayKey(selected), view === 'week' ? -7 : -1)))}>‹</button>
              <button type="button" className="ghost small" disabled={selected === todayKey} onClick={() => { setSelected(todayKey); setMonth(new Date()); }}>Hoje</button>
              <button type="button" className="ag-icon-btn" aria-label={view === 'week' ? 'Próxima semana' : 'Próximo dia'}
                onClick={() => setSelected(dayKey(addDays(fromDayKey(selected), view === 'week' ? 7 : 1)))}>›</button>
            </div>
            <label className="ag-check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Mostrar concluídos</label>
            <button type="button" onClick={() => setEditing({ kind: 'new' })}>+ Novo</button>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {view === 'list' ? (
            <div className="ag-list">
              {listDays.map(([key, list]) => {
                const d = fromDayKey(key);
                return (
                  <section key={key} className={`ag-day ${key === todayKey ? 'is-today' : ''}`}>
                    <header>
                      <span className="ag-day-num">{d.getDate()}</span>
                      <div>
                        <h3>{dayTitle(d)}</h3>
                        <small>{list.length ? `${list.length} compromisso${list.length > 1 ? 's' : ''}` : 'Livre'}</small>
                      </div>
                      <button type="button" className="ag-icon-btn" aria-label={`Novo em ${dayTitle(d)}`}
                        onClick={() => { setSelected(key); setEditing({ kind: 'new' }); }}>+</button>
                    </header>
                    {list.length === 0
                      ? <p className="ag-empty">Nada marcado. Que tal aproveitar o tempo livre?</p>
                      : list.map((a) => card(a))}
                  </section>
                );
              })}
              <button type="button" className="ghost ag-more" onClick={() => setListWeeks((w) => w + 8)}>
                Mostrar mais (até {dayTitle(addDays(listEnd, 8 * 7 - 1)).toLowerCase()})
              </button>
            </div>
          ) : (
            <div className="ag-week">
              {weekDays.map((d) => {
                const key = dayKey(d);
                const list = visible.filter((a) => dayKey(new Date(a.startsAt)) === key);
                return (
                  <section key={key} className={`ag-week-col ${key === todayKey ? 'is-today' : ''} ${key === selected ? 'is-selected' : ''}`}>
                    <header onClick={() => setSelected(key)}>
                      <span>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '')}</span>
                      <strong>{d.getDate()}</strong>
                    </header>
                    <div className="ag-week-items">
                      {list.map((a) => card(a, true))}
                      <button type="button" className="ag-week-add" aria-label={`Novo em ${dayTitle(d)}`}
                        onClick={() => { setSelected(key); setEditing({ kind: 'new' }); }}>+</button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>

        {editing && (
          <EventEditor
            key={editing.kind === 'edit' ? editing.appointment.id : `new-${selected}-${editing.initial?.title ?? ''}`}
            appointment={editing.kind === 'edit' ? editing.appointment : null}
            initial={editing.kind === 'new' ? editing.initial : undefined}
            defaultDay={fromDayKey(selected)}
            onSave={save}
            onDelete={editing.kind === 'edit' ? remove : undefined}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
