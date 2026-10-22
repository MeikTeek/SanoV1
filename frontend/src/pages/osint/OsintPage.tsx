import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import { osintApi } from '../../services/osint.service';
import type { OsintCatalog, OsintCheckResult, OsintTarget, UsernameHit, UsernameStatus } from '../../types/osint';
import '../../styles/osint.css';

/**
 * Painel OSINT (só ADMIN): análise de domínio/IP (base do web-check) e busca de
 * username em centenas de sites (base do WhatsMyName). `?alvo=` e `?username=`
 * — vindos do comando do Sano — já disparam a varredura ao abrir.
 */
export default function OsintPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'domain' | 'username'>(params.get('username') ? 'username' : 'domain');
  const [catalog, setCatalog] = useState<OsintCatalog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    osintApi.catalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  return (
    <AppShell title="OSINT" status="área restrita · fontes abertas">
      <div className="tabs">
        <button className={tab === 'domain' ? 'active' : ''} onClick={() => setTab('domain')}>Domínio / IP</button>
        <button className={tab === 'username' ? 'active' : ''} onClick={() => setTab('username')}>Username</button>
      </div>
      {error && <div className="error">{error}</div>}
      {catalog && (
        <>
          <div hidden={tab !== 'domain'}><DomainTab catalog={catalog} initial={params.get('alvo') ?? ''} /></div>
          <div hidden={tab !== 'username'}><UsernameTab catalog={catalog} initial={params.get('username') ?? ''} /></div>
        </>
      )}
      <p className="osint-legal muted">
        Use apenas em alvos seus ou com autorização. Toda varredura fica registrada nos logs de segurança.
        Dados de usernames: WhatsMyName (CC BY-SA 4.0). Verificações de domínio adaptadas do web-check (MIT).
      </p>
    </AppShell>
  );
}

/* ─────────────────────────────── Domínio / IP ─────────────────────────────── */

type CheckState = { status: 'pending' } | { status: 'done'; result: OsintCheckResult };

function DomainTab({ catalog, initial }: { catalog: OsintCatalog; initial: string }) {
  const [input, setInput] = useState(initial);
  const [target, setTarget] = useState<OsintTarget | null>(null);
  const [states, setStates] = useState<Record<string, CheckState>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const scan = async (value: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');
    setTarget(null);
    setStates(Object.fromEntries(catalog.checks.map((c) => [c.id, { status: 'pending' } as CheckState])));
    setRunning(true);
    try {
      await osintApi.scanDomain(value, (line) => {
        if (line.type === 'start') setTarget(line.target);
        if (line.type === 'check') setStates((s) => ({ ...s, [line.id]: { status: 'done', result: line.result } }));
      }, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) {
        setError((e as Error).message);
        setStates({});
      }
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  };

  useEffect(() => {
    if (initial) void scan(initial);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void scan(input.trim());
  };

  const done = Object.values(states).filter((s) => s.status === 'done').length;
  const total = catalog.checks.length;

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
      {error && <div className="error">{error}</div>}

      {target && (
        <div className="osint-summary">
          <span><b>{target.hostname}</b>{!target.isIp && target.domain !== target.hostname && <> · domínio {target.domain}</>}</span>
          <span className="muted">{running ? `${done}/${total} verificações…` : `${done}/${total} concluídas`}</span>
        </div>
      )}

      {Object.keys(states).length > 0 && (
        <div className="osint-grid">
          {catalog.checks.map((c) => {
            const st = states[c.id];
            if (!st) return null;
            const r = st.status === 'done' ? st.result : null;
            const kind = !r ? 'pending' : r.error ? 'error' : r.skipped ? 'skipped' : 'ok';
            return (
              <article key={c.id} className={`card osint-card ${kind}`}>
                <header>
                  <h3>{c.label}</h3>
                  <span className={`osint-badge ${kind}`}>
                    {kind === 'pending' ? 'consultando…' : kind === 'ok' ? 'ok' : kind === 'skipped' ? 'sem dados' : 'falhou'}
                  </span>
                </header>
                {!r && <p className="muted small">{c.description}</p>}
                {r?.error && <p className="osint-msg bad">{r.error}</p>}
                {r?.skipped && <p className="osint-msg muted">{r.skipped}</p>}
                {r && !r.error && !r.skipped && <ValueView value={r} />}
              </article>
            );
          })}
        </div>
      )}

      {!Object.keys(states).length && !error && (
        <div className="card osint-empty">
          <p>Informe um domínio, URL ou IP para levantar:</p>
          <ul>{catalog.checks.map((c) => <li key={c.id}><b>{c.label}</b> — <span className="muted">{c.description}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────── Renderização genérica ──────────────────────────── */

const LABELS: Record<string, string> = {
  enderecos: 'Endereços', reverso: 'Reverso (PTR)', ptr: 'PTR', codigoPais: 'Código do país', fusoHorario: 'Fuso horário',
  regiao: 'Região', pais: 'País', diasRestantes: 'Dias restantes', validoDe: 'Válido de', validoAte: 'Válido até',
  urlFinal: 'URL final', tempoMs: 'Tempo (ms)', ogTitulo: 'og:title', ogDescricao: 'og:description', ogImagem: 'og:image',
  ogSite: 'og:site_name', twitterSite: 'twitter:site', twitterCriador: 'twitter:creator', perfisSociais: 'Perfis sociais',
  palavrasChave: 'Palavras-chave', registrarIanaId: 'IANA ID', politicaDmarc: 'Política DMARC', assinadoPgp: 'Assinado (PGP)',
  encontradoEm: 'Encontrado em', subdominios: 'Subdomínios', cabecalhos: 'Cabeçalhos', redirecionamentos: 'Redirecionamentos',
  chaveBits: 'Chave (bits)', corTema: 'Cor do tema', descricao: 'Descrição', titulo: 'Título', canonica: 'URL canônica',
  sha256: 'SHA-256', responsavel: 'Responsável',
};
const label = (key: string) =>
  LABELS[key] ?? (/^[A-Z0-9-]+$/.test(key) ? key : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  if (typeof value === 'boolean') return <span className={value ? 'osint-yes' : 'osint-no'}>{value ? 'sim' : 'não'}</span>;
  const text = String(value);
  if (/^https?:\/\/\S+$/.test(text)) return <a href={text} target="_blank" rel="noreferrer noopener">{text}</a>;
  if (ISO_DATE.test(text) && !Number.isNaN(Date.parse(text))) return <span title={text}>{new Date(text).toLocaleString('pt-BR')}</span>;
  return <span>{text}</span>;
}

function ListView({ items }: { items: unknown[] }) {
  const [open, setOpen] = useState(false);
  const LIMIT = 12;
  if (!items.length) return <span className="muted">nenhum</span>;
  const shown = open ? items : items.slice(0, LIMIT);
  return (
    <ul className="osint-list">
      {shown.map((item, i) => (
        <li key={i}>{item !== null && typeof item === 'object' ? <ValueView value={item} nested /> : <Scalar value={item} />}</li>
      ))}
      {items.length > LIMIT && (
        <li><button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? 'mostrar menos' : `+ ${items.length - LIMIT} itens`}</button></li>
      )}
    </ul>
  );
}

function ValueView({ value, nested }: { value: unknown; nested?: boolean }): ReactNode {
  if (Array.isArray(value)) return <ListView items={value} />;
  if (value === null || typeof value !== 'object') return <Scalar value={value} />;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  return (
    <dl className={`osint-dl ${nested ? 'nested' : ''}`}>
      {entries.map(([k, v]) => (
        <div key={k} className={v !== null && typeof v === 'object' ? 'block' : ''}>
          <dt>{label(k)}</dt>
          <dd><ValueView value={v} nested /></dd>
        </div>
      ))}
    </dl>
  );
}

/* ────────────────────────────────── Username ────────────────────────────────── */

const NSFW = 'xx NSFW xx';
const CATEGORY_LABELS: Record<string, string> = {
  archived: 'arquivados', art: 'arte', blog: 'blogs', business: 'negócios', coding: 'programação', dating: 'relacionamento',
  finance: 'finanças', gaming: 'games', health: 'saúde', hobby: 'hobbies', images: 'imagens', misc: 'diversos', music: 'música',
  news: 'notícias', political: 'política', search: 'busca', shopping: 'compras', social: 'redes sociais', tech: 'tecnologia',
  video: 'vídeo', [NSFW]: 'adulto (NSFW)',
};

type View = 'found' | 'unknown' | 'all';

function UsernameTab({ catalog, initial }: { catalog: OsintCatalog; initial: string }) {
  const [username, setUsername] = useState(initial);
  const [categories, setCategories] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [hits, setHits] = useState<UsernameHit[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState('');
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>('found');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const scan = async (name: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');
    setHits([]);
    setTotal(0);
    setView('found');
    setRunning(true);
    try {
      await osintApi.scanUsername({ username: name, categories: categories.length ? categories : undefined, nsfw }, (line) => {
        if (line.type === 'start') { setTotal(line.total); setSearched(line.username); }
        if (line.type === 'result') {
          const { type: _t, ...hit } = line;
          setHits((h) => [...h, hit]);
        }
      }, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  };

  useEffect(() => {
    if (initial) void scan(initial);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim()) void scan(username.trim().replace(/^@/, ''));
  };

  const toggleCategory = (id: string) =>
    setCategories((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const counts = useMemo(() => {
    const c: Record<UsernameStatus, number> = { found: 0, missing: 0, unknown: 0, error: 0 };
    for (const h of hits) c[h.status]++;
    return c;
  }, [hits]);

  const shown = useMemo(() => {
    const order: Record<UsernameStatus, number> = { found: 0, unknown: 1, error: 2, missing: 3 };
    const list = view === 'found' ? hits.filter((h) => h.status === 'found')
      : view === 'unknown' ? hits.filter((h) => h.status === 'unknown' || h.status === 'error')
        : hits;
    return [...list].sort((a, b) => order[a.status] - order[b.status] || a.site.localeCompare(b.site));
  }, [hits, view]);

  const copyFound = async () => {
    await navigator.clipboard.writeText(hits.filter((h) => h.status === 'found').map((h) => `${h.site}\t${h.url}`).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const visibleCategories = catalog.username.categories.filter((c) => nsfw || c.id !== NSFW);

  return (
    <section>
      <form className="inline osint-form" onSubmit={submit}>
        <input
          placeholder="username (sem @)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="off"
          spellCheck={false}
          maxLength={64}
        />
        {running
          ? <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>Parar</button>
          : <button disabled={!username.trim()}>Buscar em {categories.length ? 'categorias' : `${catalog.username.total} sites`}</button>}
      </form>

      <div className="osint-chips">
        {visibleCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`osint-chip ${categories.includes(c.id) ? 'on' : ''}`}
            onClick={() => toggleCategory(c.id)}
            disabled={running}
          >
            {CATEGORY_LABELS[c.id] ?? c.id} <small>{c.count}</small>
          </button>
        ))}
        <label className="osint-check">
          <input type="checkbox" checked={nsfw} onChange={(e) => { setNsfw(e.target.checked); if (!e.target.checked) setCategories((c) => c.filter((x) => x !== NSFW)); }} disabled={running} />
          incluir sites adultos
        </label>
      </div>
      {error && <div className="error">{error}</div>}

      {total > 0 && (
        <>
          <div className="osint-progress" aria-label="Progresso">
            <div style={{ width: `${(hits.length / total) * 100}%` }} />
          </div>
          <div className="osint-summary">
            <span>
              <b>{searched}</b> · {hits.length}/{total} sites · <span className="osint-yes">{counts.found} encontrados</span>
              {' · '}<span className="muted">{counts.unknown + counts.error} inconclusivos</span>
            </span>
            <span className="osint-views">
              <button type="button" className={`osint-chip ${view === 'found' ? 'on' : ''}`} onClick={() => setView('found')}>Encontrados</button>
              <button type="button" className={`osint-chip ${view === 'unknown' ? 'on' : ''}`} onClick={() => setView('unknown')}>Inconclusivos</button>
              <button type="button" className={`osint-chip ${view === 'all' ? 'on' : ''}`} onClick={() => setView('all')}>Todos</button>
              {counts.found > 0 && <button type="button" className="ghost" onClick={() => void copyFound()}>{copied ? 'Copiado' : 'Copiar links'}</button>}
            </span>
          </div>

          <div className="osint-hits">
            {shown.map((h) => (
              <a key={h.site} className={`osint-hit ${h.status}`} href={h.url} target="_blank" rel="noreferrer noopener">
                <b>{h.site}</b>
                <small>{CATEGORY_LABELS[h.category] ?? h.category}</small>
                <span className="osint-hit-status">
                  {h.status === 'found' ? 'perfil encontrado' : h.status === 'missing' ? 'não existe'
                    : h.detail ?? 'inconclusivo'}{h.http ? ` · HTTP ${h.http}` : ''}
                </span>
              </a>
            ))}
            {!shown.length && <p className="muted">{running ? 'Procurando…' : 'Nada nesta visão.'}</p>}
          </div>
          <p className="muted small">
            “Encontrado” segue a regra do WhatsMyName (código HTTP + texto esperado na página). Confirme abrindo o link:
            homônimos e páginas genéricas podem gerar falsos positivos. Sites com proteção anti-bot aparecem como inconclusivos.
          </p>
        </>
      )}
    </section>
  );
}
