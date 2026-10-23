import { useEffect, useRef, useState, type FormEvent } from 'react';
import { osintApi } from '../../services/osint.service';
import type { OsintCatalog, OsintCheckResult } from '../../types/osint';
import { CheckCard, HistoryChips, type OsintRequest } from './Bits';
import { clearHistory, download, loadHistory, pushHistory, stamp } from './utils';

const KIND = 'email';

export default function EmailTab({ catalog, request, onSearchUsername }: {
  catalog: OsintCatalog;
  request: OsintRequest;
  onSearchUsername: (username: string) => void;
}) {
  const [input, setInput] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarOk, setAvatarOk] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
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
    setEmail('');
    setResults({});
    setSuggestions([]);
    setAvatarOk(true);
    setRunning(true);
    setHistory(pushHistory(KIND, value));
    try {
      await osintApi.scanEmail(value, (line) => {
        if (line.type === 'start') { setEmail(line.email); setAvatar(line.avatar); setSuggestions(line.suggestions); }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void scan(input.trim());
  };

  const gravatar = results.gravatar;
  const profileName = typeof gravatar?.nome === 'string' ? gravatar.nome : '';

  return (
    <section>
      <form className="inline osint-form" onSubmit={submit}>
        <input
          type="email"
          placeholder="pessoa@exemplo.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoCapitalize="off"
          spellCheck={false}
        />
        {running
          ? <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>Parar</button>
          : <button disabled={!input.trim()}>Investigar</button>}
      </form>
      <HistoryChips
        items={history}
        onPick={(v) => { setInput(v); void scan(v); }}
        onClear={() => { clearHistory(KIND); setHistory([]); }}
      />
      {error && <div className="error">{error}</div>}

      {email && (
        <>
          <div className="card osint-person">
            {avatar && avatarOk
              ? <img src={avatar} alt="" className="osint-avatar" onError={() => setAvatarOk(false)} />
              : <div className="osint-avatar fallback" aria-hidden="true">{email[0].toUpperCase()}</div>}
            <div>
              <b>{profileName || email}</b>
              {profileName && <div className="muted small">{email}</div>}
              {suggestions.length > 0 && (
                <div className="osint-chips">
                  <span className="muted small">Continuar no username:</span>
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="osint-chip" onClick={() => onSearchUsername(s)}>{s} →</button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="ghost"
              disabled={!Object.keys(results).length}
              onClick={() => download(`osint-email-${stamp()}.json`, JSON.stringify({ email, resultados: results }, null, 2), 'application/json')}
            >
              Baixar JSON
            </button>
          </div>
          <div className="osint-grid">
            {catalog.emailChecks.map((c) => <CheckCard key={c.id} info={c} result={results[c.id]} />)}
          </div>
        </>
      )}

      {!email && !error && (
        <div className="card osint-empty">
          <p>Informe um e-mail para verificar, só com fontes públicas:</p>
          <ul>{catalog.emailChecks.map((c) => <li key={c.id}><b>{c.label}</b> — <span className="muted">{c.description}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}
