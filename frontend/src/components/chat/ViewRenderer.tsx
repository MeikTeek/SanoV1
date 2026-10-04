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

    default:
      return null;
  }
}