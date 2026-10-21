import { useState } from 'react';
import type { Appointment, AppointmentInput, Recurrence } from '../../types/appointment';
import type { SeriesScope } from '../../services/appointment.service';
import { RECURRENCE_LABEL, REMINDER_OPTIONS, combine, toDateInput, toTimeInput } from './format';

interface Props {
  /** Existente = edição; null = novo (com o dia sugerido). */
  appointment: Appointment | null;
  defaultDay: Date;
  /** Pré-preenchimento de um novo compromisso (criação rápida incompleta). */
  initial?: Partial<AppointmentInput>;
  onSave: (input: AppointmentInput, scope: SeriesScope) => Promise<void>;
  onDelete?: (scope: SeriesScope) => Promise<void>;
  onClose: () => void;
}

/** Formulário completo de um compromisso, em painel lateral. */
export default function EventEditor({ appointment, defaultDay, initial, onSave, onDelete, onClose }: Props) {
  const source = appointment ?? initial;
  const start = source?.startsAt ? new Date(source.startsAt) : new Date(defaultDay.getFullYear(), defaultDay.getMonth(), defaultDay.getDate(), 9, 0);
  const end = source?.endsAt ? new Date(source.endsAt) : null;
  const [title, setTitle] = useState(source?.title ?? '');
  const [date, setDate] = useState(toDateInput(start));
  const [time, setTime] = useState(toTimeInput(start));
  const [endTime, setEndTime] = useState(end ? toTimeInput(end) : '');
  const [allDay, setAllDay] = useState(source?.allDay ?? false);
  const [location, setLocation] = useState(source?.location ?? '');
  const [participants, setParticipants] = useState(source?.participants ?? '');
  const [remind, setRemind] = useState(source && source.remindBefore !== undefined ? (source.remindBefore === null ? '' : String(source.remindBefore)) : '15');
  const [recurrence, setRecurrence] = useState<Recurrence | ''>(source?.recurrence ?? '');
  const [notes, setNotes] = useState(appointment?.description ?? '');
  const [scope, setScope] = useState<SeriesScope>('one');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inSeries = !!appointment?.seriesId;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const startsAt = allDay ? combine(date, '00:00') : combine(date, time);
    const endsAt = !allDay && endTime ? combine(date, endTime) : null;
    if (endsAt && endsAt <= startsAt) { setError('O término precisa ser depois do início.'); return; }
    setBusy(true); setError('');
    try {
      await onSave({
        title: title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        allDay,
        location: location.trim() || null,
        participants: participants.trim() || null,
        remindBefore: remind === '' ? null : Number(remind),
        description: notes.trim() || null,
        ...(!appointment && { recurrence: recurrence || null }),
      }, scope);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try { await onDelete(scope); } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <aside className="ag-editor" aria-label={appointment ? 'Editar compromisso' : 'Novo compromisso'}>
      <header>
        <h2>{appointment ? 'Editar compromisso' : 'Novo compromisso'}</h2>
        <button type="button" className="ag-icon-btn" aria-label="Fechar" onClick={onClose}>✕</button>
      </header>
      <form onSubmit={submit}>
        <input className="ag-title-input" value={title} required maxLength={140} autoFocus placeholder="Título"
          onChange={(e) => setTitle(e.target.value)} />

        <div className="ag-row ag-row-dates">
          <label>Dia<input type="date" value={date} required onChange={(e) => setDate(e.target.value)} /></label>
          {!allDay && <label>Início<input type="time" value={time} required onChange={(e) => setTime(e.target.value)} /></label>}
          {!allDay && <label>Fim<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>}
        </div>
        <label className="ag-check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Dia inteiro</label>

        <label>Local<input value={location} maxLength={200} placeholder="Ex.: Consultório, Sala 3, link da call" onChange={(e) => setLocation(e.target.value)} /></label>
        <label>Com quem<input value={participants} maxLength={200} placeholder="Ex.: Ana e Pedro" onChange={(e) => setParticipants(e.target.value)} /></label>

        <div className="ag-row">
          <label>Lembrete
            <select value={remind} onChange={(e) => setRemind(e.target.value)}>
              {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {appointment ? (
            inSeries && <label>Repete<input value={RECURRENCE_LABEL[appointment.recurrence!] ?? ''} disabled /></label>
          ) : (
            <label>Repetir
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence | '')}>
                <option value="">Não repete</option>
                {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
              </select>
            </label>
          )}
        </div>

        <label>Notas<textarea value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} /></label>

        {inSeries && (
          <fieldset className="ag-scope">
            <legend>Aplicar a</legend>
            <label className="ag-check"><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> Só este</label>
            <label className="ag-check"><input type="radio" name="scope" checked={scope === 'following'} onChange={() => setScope('following')} /> Este e os próximos</label>
          </fieldset>
        )}

        {error && <p className="error">{error}</p>}

        <footer>
          {appointment && onDelete && (confirmDelete ? (
            <span className="ag-confirm">
              Excluir{inSeries && scope === 'following' ? ' este e os próximos' : ''}?
              <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>Excluir</button>
              <button type="button" className="ghost" onClick={() => setConfirmDelete(false)}>Não</button>
            </span>
          ) : (
            <button type="button" className="ghost ag-delete" onClick={() => setConfirmDelete(true)}>Excluir</button>
          ))}
          <span className="ag-spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={busy || !title.trim()}>{appointment ? 'Salvar' : 'Criar'}</button>
        </footer>
      </form>
    </aside>
  );
}
