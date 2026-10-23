import type { OsintCheckInfo, OsintCheckResult } from '../../types/osint';
import ValueView from './ValueView';
import type { Dork } from './utils';

/** Pedido vindo de fora da aba (URL, comando do Sano, outra aba). `nonce` muda a cada pedido. */
export interface OsintRequest { value: string; nonce: number }

export function HistoryChips({ items, onPick, onClear }: { items: string[]; onPick: (v: string) => void; onClear: () => void }) {
  if (!items.length) return null;
  return (
    <div className="osint-history" aria-label="Pesquisas recentes">
      <span className="muted small">Recentes</span>
      {items.map((v) => (
        <button key={v} type="button" className="osint-chip" onClick={() => onPick(v)}>{v}</button>
      ))}
      <button type="button" className="link-btn" onClick={onClear}>limpar</button>
    </div>
  );
}

export function CheckCard({ info, result }: { info: OsintCheckInfo; result?: OsintCheckResult }) {
  const kind = !result ? 'pending' : result.error ? 'error' : result.skipped ? 'skipped' : 'ok';
  return (
    <article className={`card osint-card ${kind}`}>
      <header>
        <h3>{info.label}</h3>
        <span className={`osint-badge ${kind}`}>
          {kind === 'pending' ? 'consultando…' : kind === 'ok' ? 'ok' : kind === 'skipped' ? 'sem dados' : 'falhou'}
        </span>
      </header>
      {!result && <p className="muted small">{info.description}</p>}
      {result?.error && <p className="osint-msg bad">{result.error}</p>}
      {result?.skipped && <p className="osint-msg muted">{result.skipped}</p>}
      {result && !result.error && !result.skipped && <ValueView value={result} />}
    </article>
  );
}

export function DorkCard({ title, dorks }: { title: string; dorks: Dork[] }) {
  return (
    <article className="card osint-card">
      <header><h3>{title}</h3><span className="osint-badge">links</span></header>
      <p className="muted small">Abrem a pesquisa no buscador, em nova aba. Nada é consultado pelo servidor do Sano.</p>
      <ul className="osint-list osint-dorks">
        {dorks.map((d) => (
          <li key={d.label}><a href={d.url} target="_blank" rel="noreferrer noopener">{d.label}</a></li>
        ))}
      </ul>
    </article>
  );
}
