import { addDays, dayKey, startOfWeek } from './format';

interface Props {
  month: Date;           // qualquer dia do mês exibido
  selected: string;      // dayKey
  counts: Map<string, number>;
  onSelect: (key: string) => void;
  onMonth: (delta: number) => void;
}

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Mês compacto: o ponto embaixo do dia mostra que há compromisso. */
export default function MiniCalendar({ month, selected, counts, onSelect, onMonth }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const today = dayKey(new Date());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const title = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(first);

  return (
    <section className="ag-cal" aria-label="Calendário">
      <header>
        <button type="button" className="ag-icon-btn" aria-label="Mês anterior" onClick={() => onMonth(-1)}>‹</button>
        <strong>{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
        <button type="button" className="ag-icon-btn" aria-label="Próximo mês" onClick={() => onMonth(1)}>›</button>
      </header>
      <div className="ag-cal-grid" role="grid">
        {WEEKDAYS.map((w, i) => <span key={i} className="ag-cal-wd">{w}</span>)}
        {cells.map((d) => {
          const key = dayKey(d);
          const n = counts.get(key) ?? 0;
          const outside = d.getMonth() !== first.getMonth();
          return (
            <button
              key={key}
              type="button"
              className={['ag-cal-day', outside && 'outside', key === today && 'today', key === selected && 'selected'].filter(Boolean).join(' ')}
              aria-label={`${d.getDate()}${n ? `, ${n} compromisso(s)` : ''}`}
              aria-pressed={key === selected}
              onClick={() => onSelect(key)}
            >
              {d.getDate()}
              {n > 0 && <i className={n > 2 ? 'busy' : ''} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
