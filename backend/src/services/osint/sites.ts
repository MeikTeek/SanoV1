/**
 * Catálogo unificado de sites para a busca de username.
 *
 * Duas bases abertas, normalizadas para o mesmo formato:
 * - `wmn-data.json`: WhatsMyName (CC BY-SA 4.0, © Micah Hoffman) — regras com código HTTP
 *   E texto esperado na página, as mais precisas.
 * - `sherlock-data.json`: Sherlock (MIT, © Sherlock Project) — regras por status, mensagem
 *   de erro ou redirecionamento; só entram os sites que o WhatsMyName ainda não cobre.
 * Para atualizar, substitua os dois arquivos pelas versões novas dos repositórios.
 */
import wmn from './wmn-data.json';
import sherlock from './sherlock-data.json';

export const NSFW_CATEGORY = 'xx NSFW xx';

export type Confidence = 'high' | 'medium' | 'low';

export type Rule =
  /** WhatsMyName: existe = `eCode` + `eString` no corpo; não existe = `mCode` ou `mString`. */
  | { kind: 'wmn'; eCode: number; eString: string; mCode: number; mString: string }
  /** Sherlock status_code: qualquer 2xx (exceto `errorCodes`) significa que o perfil existe. */
  | { kind: 'status'; errorCodes: number[] }
  /** Sherlock message: o perfil existe se NENHUMA mensagem de erro aparecer na página. */
  | { kind: 'message'; errors: string[] }
  /** Sherlock response_url: redirecionar para `errorUrl` significa que não existe. */
  | { kind: 'redirect'; errorUrl: string };

export interface Site {
  name: string;
  category: string;
  source: 'wmn' | 'sherlock';
  nsfw: boolean;
  /** URL do perfil para mostrar ao usuário (`{account}` no lugar do username). */
  profileUrl: string;
  /** URL realmente consultada (pode ser uma API). */
  probeUrl: string;
  method: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** Caracteres que o site não aceita e devem ser removidos do username. */
  strip?: string;
  /** Formato aceito pelo site: fora dele nem vale a pena consultar. */
  regex?: RegExp;
  rule: Rule;
  confidence: Confidence;
  protection?: string[];
}

interface WmnSite {
  name: string; uri_check: string; uri_pretty?: string; post_body?: string; headers?: Record<string, string>;
  strip_bad_char?: string; e_code: number; e_string: string; m_code: number; m_string: string;
  cat: string; valid?: boolean; protection?: string[];
}

interface SherlockSite {
  url: string; urlMain: string; urlProbe?: string; errorType: 'status_code' | 'message' | 'response_url';
  errorMsg?: string | string[]; errorCode?: number | number[]; errorUrl?: string; regexCheck?: string;
  request_method?: string; request_payload?: unknown; headers?: Record<string, string>; isNSFW?: boolean;
}

const tpl = (s: string) => s.split('{}').join('{account}');
const hostOf = (template: string) => {
  try {
    return new URL(template.split('{account}').join('x')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return template;
  }
};
const toArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function fromWmn(s: WmnSite): Site {
  return {
    name: s.name,
    category: s.cat,
    source: 'wmn',
    nsfw: s.cat === NSFW_CATEGORY,
    profileUrl: s.uri_pretty ?? s.uri_check,
    probeUrl: s.uri_check,
    method: s.post_body ? 'POST' : 'GET',
    body: s.post_body,
    headers: s.headers,
    strip: s.strip_bad_char,
    rule: { kind: 'wmn', eCode: s.e_code, eString: s.e_string, mCode: s.m_code, mString: s.m_string },
    confidence: 'high',
    protection: s.protection,
  };
}

function fromSherlock(name: string, s: SherlockSite): Site | null {
  let regex: RegExp | undefined;
  if (s.regexCheck) {
    try { regex = new RegExp(s.regexCheck); } catch { /* regex incompatível com JS: ignora a restrição */ }
  }
  const rule: Rule =
    s.errorType === 'message' ? { kind: 'message', errors: toArray(s.errorMsg) }
      : s.errorType === 'response_url' ? { kind: 'redirect', errorUrl: s.errorUrl ?? '' }
        : { kind: 'status', errorCodes: toArray(s.errorCode) };
  if (rule.kind === 'message' && !rule.errors.length) return null;
  if (rule.kind === 'redirect' && !rule.errorUrl) return null;
  const post = s.request_method === 'POST' && s.request_payload !== undefined;
  const headers = s.headers && Object.keys(s.headers).length ? s.headers : undefined;
  return {
    name,
    category: s.isNSFW ? NSFW_CATEGORY : 'misc',
    source: 'sherlock',
    nsfw: !!s.isNSFW,
    profileUrl: tpl(s.url),
    probeUrl: tpl(s.urlProbe ?? s.url),
    method: post ? 'POST' : 'GET',
    body: post ? tpl(JSON.stringify(s.request_payload)) : undefined,
    headers: post && !headers ? { 'Content-Type': 'application/json' } : headers,
    regex,
    rule,
    // Só o status HTTP (ou a ausência de uma frase) é sinal fraco: a engine confirma com um controle.
    confidence: rule.kind === 'status' ? 'low' : 'medium',
  };
}

function build(): Site[] {
  const wmnSites = (wmn.sites as unknown as WmnSite[]).filter((s) => s.valid !== false).map(fromWmn);
  const covered = new Set(wmnSites.map((s) => hostOf(s.profileUrl)));
  const extra: Site[] = [];
  for (const [name, def] of Object.entries(sherlock as unknown as Record<string, SherlockSite>)) {
    const site = fromSherlock(name, def);
    if (site && !covered.has(hostOf(site.profileUrl))) extra.push(site);
  }
  return [...wmnSites, ...extra];
}

export const SITES: Site[] = build();

/** Letras, números, ponto, hífen e sublinhado: o username vai na URL (às vezes no subdomínio). */
export const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function usernameCatalog() {
  const counts = new Map<string, number>();
  for (const s of SITES) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return {
    total: SITES.filter((s) => !s.nsfw).length,
    totalWithNsfw: SITES.length,
    sources: { wmn: SITES.filter((s) => s.source === 'wmn').length, sherlock: SITES.filter((s) => s.source === 'sherlock').length },
    categories: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id)),
    credits: 'WhatsMyName (CC BY-SA 4.0) + Sherlock (MIT)',
  };
}

export function selectSites(opts: { categories?: string[]; nsfw?: boolean }) {
  return SITES.filter((s) =>
    (opts.nsfw || !s.nsfw) && (!opts.categories?.length || opts.categories.includes(s.category)));
}
