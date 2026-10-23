import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { osintApi } from '../../services/osint.service';
import type { Confidence, OsintCatalog, UsernameHit, UsernameStatus } from '../../types/osint';
import { DorkCard, HistoryChips, type OsintRequest } from './Bits';
import { clearHistory, download, hitsToCsv, loadHistory, pushHistory, stamp, usernameDorks } from './utils';

const KIND = 'username';
const NSFW = 'xx NSFW xx';
const CATEGORY_LABELS: Record<string, string> = {
  archived: 'arquivados', art: 'arte', blog: 'blogs', business: 'negócios', coding: 'programação', dating: 'relacionamento',
  finance: 'finanças', gaming: 'games', health: 'saúde', hobby: 'hobbies', images: 'imagens', misc: 'diversos', music: 'música',
  news: 'notícias', political: 'política', search: 'busca', shopping: 'compras', social: 'redes sociais', tech: 'tecnologia',
  video: 'vídeo', [NSFW]: 'adulto (NSFW)',
};
const CONFIDENCE: Record<Confidence, { text: string; hint: string }> = {
  high: { text: 'confiança alta', hint: 'Código HTTP e texto da página conferem com um perfil real.' },
  medium: { text: 'confiança média', hint: 'A página não mostra a mensagem de "não encontrado".' },
  low: { text: 'confiança baixa', hint: 'Só o código HTTP indica o perfil. Já passou pelo teste com um nome inexistente, mas confirme abrindo.' },
};
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

type View = 'found' | 'unknown' | 'missing' | 'all';

export default function UsernameTab({ catalog, request }: { catalog: OsintCatalog; request: OsintRequest }) {
  const [input, setInput] = useState('');
  const [variations, setVariations] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [hits, setHits] = useState<UsernameHit[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>('found');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(() => loadHistory(KIND));
  const [, forceTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const scan = async (names: string[]) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');
    setHits([]);
    setTotal(0);
    setView('found');
    setFilter('');
    setSearched(names);
    setStartedAt(Date.now());
    setRunning(true);
    setHistory(pushHistory(KIND, names[0]));
    // Resultados chegam aos montes: acumula e atualiza a tela em lotes.
    let buffer: UsernameHit[] = [];
    const flush = () => { if (buffer.length) { const batch = buffer; buffer = []; setHits((h) => [...h, ...batch]); } };
    const timer = window.setInterval(flush, 250);
    try {
      await osintApi.scanUsername({ usernames: names, categories: categories.length ? categories : undefined, nsfw }, (line) => {
        if (line.type === 'start') setTotal(line.total);
        if (line.type === 'result') { const { type: _t, ...hit } = line; buffer.push(hit); }
      }, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      window.clearInterval(timer);
      flush();
      if (abortRef.current === ac) setRunning(false);
    }
  };

  // Pedido de fora (URL, Sano, aba de e-mail): busca direto o nome pedido.
  useEffect(() => {
    if (request.nonce > 0 && request.value) {
      const name = request.value.replace(/^@/, '');
      setInput(name);
      setVariations([]);
      setSelected([name]);
      void scan([name]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Relógio para a estimativa de tempo restante.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = input.trim().replace(/^@/, '');
    if (!name) return;
    const names = selected.length && selected.includes(name) ? selected : [name];
    void scan(names);
  };

  const loadVariations = async () => {
    const name = input.trim().replace(/^@/, '');
    if (!name) return;
    setError('');
    try {
      const r = await osintApi.variations(name);
      setVariations(r.variations);
      setSelected([name]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleSelected = (v: string) =>
    setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const toggleCategory = (id: string) =>
    setCategories((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const counts = useMemo(() => {
    const c: Record<UsernameStatus, number> = { found: 0, missing: 0, unknown: 0, error: 0 };
    for (const h of hits) c[h.status]++;
    return c;
  }, [hits]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = hits.filter((h) => {
      if (view === 'found' && h.status !== 'found') return false;
      if (view === 'unknown' && h.status !== 'unknown' && h.status !== 'error') return false;
      if (view === 'missing' && h.status !== 'missing') return false;
      return !needle || `${h.site} ${h.username} ${h.profile?.title ?? ''} ${h.profile?.description ?? ''}`.toLowerCase().includes(needle);
    });
    return list.sort((a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] || a.site.localeCompare(b.site) || a.username.localeCompare(b.username));
  }, [hits, view, filter]);

  const found = useMemo(() => hits.filter((h) => h.status === 'found'), [hits]);
  const elapsed = (Date.now() - startedAt) / 1000;
  const eta = running && hits.length > 20 ? Math.max(0, Math.round((elapsed / hits.length) * (total - hits.length))) : null;
  const multi = searched.length > 1;
  const visibleCategories = catalog.username.categories.filter((c) => nsfw || c.id !== NSFW);

  const copyFound = async () => {
    await navigator.clipboard.writeText(found.map((h) => `${h.site}\t${h.url}`).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section>
      <form className="inline osint-form" onSubmit={submit}>
        <input
          placeholder="username (sem @)"
          value={input}
          onChange={(e) => { setInput(e.target.value); if (variations.length) { setVariations([]); setSelected([]); } }}
          autoCapitalize="off"
          spellCheck={false}
          maxLength={64}
        />
        <button type="button" className="ghost" onClick={() => void loadVariations()} disabled={!input.trim() || running}>Variações</button>
        {running
          ? <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>Parar</button>
          : <button disabled={!input.trim()}>Buscar{selected.length > 1 ? ` (${selected.length} nomes)` : ''}</button>}
      </form>

      {variations.length > 0 && (
        <div className="osint-chips">
          <span className="muted small">Também procurar por:</span>
          {variations.map((v) => (
            <button
              key={v}
              type="button"
              className={`osint-chip ${selected.includes(v) ? 'on' : ''}`}
              onClick={() => toggleSelected(v)}
              disabled={running}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="osint-chips">
        <span className="muted small">Categorias</span>
        {visibleCategories.map((c) => (
          <button key={c.id} type="button" className={`osint-chip ${categories.includes(c.id) ? 'on' : ''}`} onClick={() => toggleCategory(c.id)} disabled={running}>
            {CATEGORY_LABELS[c.id] ?? c.id} <small>{c.count}</small>
          </button>
        ))}
        <label className="osint-check">
          <input
            type="checkbox"
            checked={nsfw}
            onChange={(e) => { setNsfw(e.target.checked); if (!e.target.checked) setCategories((c) => c.filter((x) => x !== NSFW)); }}
            disabled={running}
          />
          incluir sites adultos
        </label>
      </div>
      <HistoryChips items={history} onPick={(v) => { setInput(v); setVariations([]); setSelected([v]); void scan([v]); }} onClear={() => { clearHistory(KIND); setHistory([]); }} />
      {error && <div className="error">{error}</div>}

      {total > 0 && (
        <>
          <div className="osint-progress" aria-label="Progresso"><div style={{ width: `${(hits.length / total) * 100}%` }} /></div>
          <div className="osint-summary">
            <span>
              <b>{searched.join(', ')}</b> · {hits.length}/{total} consultas · <span className="osint-yes">{counts.found} encontrados</span>
              {eta !== null && <span className="muted"> · ~{eta}s restantes</span>}
            </span>
            <span className="osint-views">
              {found.length > 0 && <button type="button" className="ghost" onClick={() => void copyFound()}>{copied ? 'Copiado' : 'Copiar links'}</button>}
              {found.length > 0 && <button type="button" className="ghost" onClick={() => download(`osint-username-${stamp()}.csv`, hitsToCsv(found), 'text/csv')}>CSV</button>}
              {hits.length > 0 && <button type="button" className="ghost" onClick={() => download(`osint-username-${stamp()}.json`, JSON.stringify({ usernames: searched, resultados: hits }, null, 2), 'application/json')}>JSON</button>}
            </span>
          </div>

          <div className="osint-toolbar">
            <div className="osint-views">
              <ViewButton current={view} id="found" onPick={setView} count={counts.found}>Encontrados</ViewButton>
              <ViewButton current={view} id="unknown" onPick={setView} count={counts.unknown + counts.error}>Inconclusivos</ViewButton>
              <ViewButton current={view} id="missing" onPick={setView} count={counts.missing}>Não existem</ViewButton>
              <ViewButton current={view} id="all" onPick={setView} count={hits.length}>Todos</ViewButton>
            </div>
            <input className="osint-filter" placeholder="filtrar por site, nome ou bio…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>

          <div className="osint-hits">
            {shown.map((h) => (
              <a key={`${h.username}|${h.site}`} className={`osint-hit ${h.status}`} href={h.url} target="_blank" rel="noreferrer noopener">
                {h.status === 'found' && h.profile?.image && (
                  <span className="osint-hit-pic">
                    <img src={h.profile.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).classList.add('empty'); e.currentTarget.remove(); }} />
                  </span>
                )}
                <span className="osint-hit-body">
                  <b>{h.site}{multi && <small className="osint-user"> · {h.username}</small>}</b>
                  <small>{CATEGORY_LABELS[h.category] ?? h.category}</small>
                  {h.status === 'found' && h.profile?.title && <span className="osint-hit-title">{h.profile.title}</span>}
                  {h.status === 'found' && h.profile?.description && <span className="osint-hit-desc">{h.profile.description}</span>}
                  <span className="osint-hit-status">
                    {h.status === 'found' && <span className={`osint-conf ${h.confidence}`} title={CONFIDENCE[h.confidence].hint}>{CONFIDENCE[h.confidence].text}</span>}
                    {h.status === 'missing' && 'não existe'}
                    {(h.status === 'unknown' || h.status === 'error') && (h.detail ?? 'inconclusivo')}
                    {h.http ? ` · HTTP ${h.http}` : ''}
                  </span>
                </span>
              </a>
            ))}
            {!shown.length && <p className="muted">{running ? 'Procurando…' : view === 'found' ? 'Nenhum perfil encontrado com esse filtro. Veja “Inconclusivos” e as buscas prontas abaixo.' : 'Nada nesta visão.'}</p>}
          </div>

          <p className="muted small">
            “Encontrado” segue a regra de cada site (código HTTP + texto da página), e os de confiança baixa só aparecem depois de um teste com um nome inexistente.
            Homônimos são possíveis: confirme abrindo o link. Sites com proteção anti-bot ficam como inconclusivos — abra-os manualmente.
            Base: {catalog.username.sources.wmn} sites do WhatsMyName + {catalog.username.sources.sherlock} do Sherlock.
          </p>
          <div className="osint-grid">
            <DorkCard title={`Buscas prontas para “${searched[0]}”`} dorks={usernameDorks(searched[0])} />
          </div>
        </>
      )}

      {!total && !error && (
        <div className="card osint-empty">
          <p>Procura o username em {catalog.username.total} sites ({catalog.username.sources.wmn} do WhatsMyName + {catalog.username.sources.sherlock} do Sherlock).</p>
          <ul>
            <li><b>Variações</b> — <span className="muted">gera combinações (ana.silva → anasilva, ana_silva…) para procurar vários nomes de uma vez.</span></li>
            <li><b>Perfis enriquecidos</b> — <span className="muted">nome, bio e foto de cada perfil encontrado.</span></li>
            <li><b>Teste de falso positivo</b> — <span className="muted">sites que respondem “existe” para qualquer nome são descartados.</span></li>
          </ul>
        </div>
      )}
    </section>
  );
}

function ViewButton({ current, id, count, onPick, children }: { current: View; id: View; count: number; onPick: (v: View) => void; children: string }) {
  return (
    <button type="button" className={`osint-chip ${current === id ? 'on' : ''}`} onClick={() => onPick(id)}>
      {children} <small>{count}</small>
    </button>
  );
}
