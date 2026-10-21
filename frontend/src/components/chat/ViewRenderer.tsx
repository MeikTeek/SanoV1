import type { SanoView } from '../../types/sano';

interface Props {
  view: SanoView;
  /** Executa um comando de um botão clicável (grade de ações). */
  onCommand: (command: string) => void;
}

/**
 * Renderiza a resposta estruturada do Sano como painel, não como texto.
 *
 * Cada `kind` do backend tem um componente aqui. Se aparecer um `kind`
 * desconhecido, cai no texto — nunca quebra a tela.
 */
export default function ViewRenderer({ view, onCommand }: Props) {
  switch (view.kind) {
    case 'timeline':
      return (
        <section className="hud-card">
          <h4 className="hud-title">{view.title}</h4>
          {view.items.length === 0 ? (
            <p className="muted">{view.emptyText ?? 'Nada por aqui.'}</p>
          ) : (
            <ol className="hud-timeline">
              {view.items.map((i) => (
                <li key={i.id} className="hud-tl-item">
                  <span className="hud-tl-dot" aria-hidden="true" />
                  <span className="hud-tl-time">{i.time}</span>
                  <span className="hud-tl-body">
                    <b>{i.title}</b>
                    {i.subtitle && <span className="hud-tl-sub">{i.subtitle}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      );

    case 'meters':
      return (
        <section className="hud-card">
          <h4 className="hud-title">{view.title}</h4>
          <div className="hud-meters">
            {view.items.map((m) => (
              <div className={`hud-meter tone-${m.tone ?? 'ok'}`} key={m.label}>
                <div className="hud-meter-head">
                  <span>{m.label}</span>
                  <b>{m.value}</b>
                </div>
                <div className="hud-meter-track">
                  <div style={{ width: `${Math.max(0, Math.min(100, m.percent ?? 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      );

    case 'actions':
      return (
        <section className="hud-card">
          <h4 className="hud-title">{view.title}</h4>
          {view.subtitle && <p className="hud-sub">{view.subtitle}</p>}
          <div className="hud-actions">
            {view.items.map((a) => (
              <button className="hud-btn" key={`${a.label}-${a.command}`} onClick={() => onCommand(a.command)}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
      );

    case 'profile':
      return (
        <section className="hud-card">
          <dl className="hud-profile">
            {view.items.map((i) => (
              <div key={i.label}>
                <dt>{i.label}</dt>
                <dd>{i.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );

    case 'briefing':
      return (
        <section className="hud-card">
          <h4 className="hud-title">{view.headline}</h4>
          <div className="hud-blocks">
            {view.blocks.map((b) => (
              <div className={`hud-block tone-${b.tone ?? 'ok'}`} key={b.title}>
                <b>{b.title}</b>
                <ul>
                  {b.lines.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );

    case 'confirmation':
      return (
        <section className="hud-card" aria-label={view.title}>
          <h4 className="hud-title">{view.title}</h4>
          <ul className="hud-side-list">
            {view.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
          <div className="hud-actions">
            <button className="hud-btn" onClick={() => onCommand(view.confirmCommand)}>Confirmar</button>
            <button className="hud-btn" onClick={() => onCommand(view.cancelCommand)}>Cancelar</button>
          </div>
        </section>
      );

    case 'event': {
      const badge = { created: 'Marcado', updated: 'Alterado', canceled: 'Cancelado', done: 'Concluído', info: '' }[view.state ?? 'info'];
      return (
        <section className={`hud-card hud-event state-${view.state ?? 'info'}`}>
          <div className="hud-event-head">
            <span className="hud-event-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
              </svg>
            </span>
            <div className="hud-event-main">
              <b>{view.title}</b>
              <span>{view.when}{view.relative && view.state !== 'canceled' ? ` · ${view.relative}` : ''}</span>
            </div>
            {badge && <span className="hud-event-badge">{badge}</span>}
          </div>
          {view.details.length > 0 && (
            <ul className="hud-event-details">{view.details.map((d) => <li key={d}>{d}</li>)}</ul>
          )}
          {view.actions && view.actions.length > 0 && (
            <div className="hud-event-actions">
              {view.actions.map((a) => (
                <button key={a.label} type="button" className="hud-chip" onClick={() => onCommand(a.command)}>{a.label}</button>
              ))}
            </div>
          )}
        </section>
      );
    }

    case 'agenda':
      return (
        <section className="hud-card hud-agenda">
          <div className="hud-agenda-head">
            <h4 className="hud-title">{view.title}</h4>
            {view.footer && <span>{view.footer}</span>}
          </div>
          {view.days.length === 0 ? (
            <p className="muted">{view.emptyText ?? 'Nada marcado.'}</p>
          ) : view.days.map((day) => (
            <div key={day.label} className="hud-agenda-day">
              {/* Um dia só: o título já diz qual é. */}
              {view.days.length > 1 && <span className="hud-agenda-label">{day.label}</span>}
              <ol>
                {day.items.map((i) => (
                  <li key={i.id}>
                    <span className="hud-agenda-time">{i.time}</span>
                    <span className="hud-agenda-body">
                      <b>{i.title}{i.tag && <i aria-label="recorrente"> {i.tag}</i>}</b>
                      {i.subtitle && <small>{i.subtitle}</small>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      );

    default:
      return null;
  }
}