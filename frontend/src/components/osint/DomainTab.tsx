import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { osintApi } from '../../services/osint.service';
import type { OsintCatalog, OsintCheckResult, OsintTarget } from '../../types/osint';
import { CheckCard, DorkCard, HistoryChips, type OsintRequest } from './Bits';
import { buildInsights, clearHistory, domainDorks, download, loadHistory, pushHistory, stamp } from './utils';

const KIND = 'domain';
const RANK = { ok: 0, pending: 1, error: 2, skipped: 3 } as const;
const kindOf = (r?: OsintCheckResult) => (!r ? 'pending' : r.error ? 'error' : r.skipped ? 'skipped' : 'ok');

export default function DomainTab({ catalog, request }: { catalog: OsintCatalog; request: OsintRequest }) {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<OsintTarget | null>(null);
  const [results, setResults] = useState<Record<string, OsintCheckResult | undefined>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(() => loadHistory(KIND));
  const abortRef = useRef<AbortController | null>(null);

  const scan = async (value: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');
    setTarget(null);
    setResults({});
    setRunning(true);
    setHistory(pushHistory(KIND, value));
    try {
      await osintApi.scanDomain(value, (line) => {
        if (line.type === 'start') setTarget(line.target);
        if (line.type === 'check') setResults((s) => ({ ...s, [line.id]: line.result }));
      }, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  };

  useEffect(() => {
    if (request.nonce > 0 && request.value) {
      setInput(request.value);
      void scan(request.value);
    }
    return () => { if (request.nonce === 0) abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void scan(input.trim());
  };

  const done = Object.keys(results).length;
  const total = catalog.checks.length;
  const started = target !== null || running || done > 0;
  const insights = useMemo(() => buildInsights(results, !running), [results, running]);

  const cards = useMemo(() => {
    const list = [...catalog.checks];
    if (running) return list;
    return list.sort((a, b) => RANK[kindOf(results[a.id])] - RANK[kindOf(results[b.id])]);
  }, [catalog.checks, results, running]);

  const exportJson = () =>
    download(`osint-${target?.hostname ?? 'alvo'}-${stamp()}.json`, JSON.stringify({ alvo: target, geradoEm: new Date().toISOString(), resultados: results }, null, 2), 'application/json');

  return (
    <section>
      <form className="inline osint-form" onSubmit={submit}>
        <input
          placeholder="exemplo.com.br, https://site.com/pagina ou 8.8.8.8"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoCapitalize="off"
          spellCheck={false}
        />
        {running
          ? <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>Parar</button>
          : <button disabled={!input.trim()}>Analisar</button>}
      </form>
      <HistoryChips
        items={history}
        onPick={(v) => { setInput(v); void scan(v); }}
        onClear={() => { clearHistory(KIND); setHistory([]); }}
      />
      {error && <div className="error">{error}</div>}

      {started && (
        <>
          <div className="osint-summary">
            <span>
              {target ? <><b>{target.hostname}</b>{!target.isIp && target.domain !== target.hostname && <> · domínio {target.domain}</>}</> : 'Iniciando…'}
              {' '}<span className="muted">{running ? `${done}/${total} verificações…` : `${done}/${total} concluídas`}</span>
            </span>
            {done > 0 && <button type="button" className="ghost" onClick={exportJson}>Baixar relatório (JSON)</button>}
          </div>
          <div className="osint-progress"><div style={{ width: `${(done / total) * 100}%` }} /></div>

          {(insights.facts.length > 0 || insights.alerts.length > 0) && (
            <div className="card osint-insights">
              {insights.facts.length > 0 && (
                <dl className="osint-facts">
                  {insights.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                </dl>
              )}
              {insights.tech.length > 0 && (
                <div className="osint-tech">
                  {insights.tech.map((t) => <span key={t} className="osint-tag">{t}</span>)}
                </div>
              )}
              {insights.alerts.length > 0 && (
                <ul className="osint-alerts">
                  {insights.alerts.map((a, i) => <li key={i} className={a.level}>{a.text}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="osint-grid">
            {cards.map((c) => <CheckCard key={c.id} info={c} result={results[c.id]} />)}
            {target && <DorkCard title="Buscas prontas (dorks)" dorks={domainDorks(target.domain)} />}
          </div>
        </>
      )}

      {!started && !error && (
        <div className="card osint-empty">
          <p>Informe um domínio, URL ou IP para levantar, só com fontes públicas:</p>
          <ul>{catalog.checks.map((c) => <li key={c.id}><b>{c.label}</b> — <span className="muted">{c.description}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}
