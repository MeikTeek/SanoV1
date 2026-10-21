import { useEffect, useRef, useState } from 'react';
import { createAppointment, previewAppointment } from '../../services/appointment.service';
import type { AppointmentPreview } from '../../types/appointment';
import { RECURRENCE_LABEL, dayTitle, reminderLabel, timeRange } from './format';

interface Props {
  onCreated: () => Promise<void>;
  /** Frase incompleta (sem dia/hora): abre o editor com o que já foi entendido. */
  onNeedsDetails: (preview: AppointmentPreview) => void;
}

const EXAMPLES = ['dentista sexta às 15h', 'academia toda segunda às 7h', 'reunião com Ana amanhã das 10h às 11h', 'aniversário da Bia dia 15/11'];

/**
 * Criação rápida em linguagem natural — o mesmo entendimento do chat do Sano.
 * Enquanto você digita, a prévia mostra exatamente o que vai ser salvo.
 */
export default function QuickAdd({ onCreated, onNeedsDetails }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<AppointmentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const value = text.trim();
    if (value.length < 3) { setPreview(null); return; }
    const id = ++seq.current;
    const timer = setTimeout(() => {
      previewAppointment(value)
        .then(({ preview: p }) => { if (id === seq.current) setPreview(p); })
        .catch(() => { if (id === seq.current) setPreview(null); });
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const complete = preview && !preview.missing && preview.startsAt;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview) return;
    if (!complete) { onNeedsDetails(preview); setText(''); return; }
    setBusy(true); setError('');
    try {
      await createAppointment({
        title: preview.title,
        startsAt: preview.startsAt!,
        endsAt: preview.endsAt,
        allDay: preview.allDay,
        participants: preview.participants,
        location: preview.location,
        remindBefore: preview.remindBefore,
        recurrence: preview.recurrence,
      });
      setText('');
      setPreview(null);
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ag-quick" onSubmit={submit}>
      <div className="ag-quick-field">
        <span className="ag-quick-plus" aria-hidden="true">+</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Adicionar: "${EXAMPLES[new Date().getMinutes() % EXAMPLES.length]}"`}
          aria-label="Adicionar compromisso por frase"
          maxLength={300}
        />
        <button type="submit" disabled={busy || !preview}>{complete ? 'Adicionar' : preview ? 'Completar…' : 'Adicionar'}</button>
      </div>
      {preview && (
        <div className={`ag-quick-preview ${complete ? '' : 'incomplete'}`} aria-live="polite">
          <strong>{preview.title || 'Sem título'}</strong>
          {preview.startsAt
            ? <span>{dayTitle(new Date(preview.startsAt))} · {preview.missing === 'time' ? 'falta o horário' : timeRange({ startsAt: preview.startsAt, endsAt: preview.endsAt, allDay: preview.allDay } as never)}</span>
            : <span>falta o dia</span>}
          {preview.participants && <span>com {preview.participants}</span>}
          {preview.location && <span>{preview.location}</span>}
          {preview.recurrence && <span>↻ {RECURRENCE_LABEL[preview.recurrence]}</span>}
          {reminderLabel(preview.remindBefore) && <span>🔔 {reminderLabel(preview.remindBefore)}</span>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
