/**
 * Busca de username em ~650 sites usando a base do WhatsMyName.
 *
 * `wmn-data.json` é cópia sem alterações de github.com/WebBreacher/WhatsMyName
 * (© 2015-2026 Micah Hoffman, licença CC BY-SA 4.0). Para atualizar a base,
 * basta substituir o arquivo pela versão nova do repositório.
 *
 * Regra de cada site (a mesma dos checkers oficiais): o perfil EXISTE quando o
 * status HTTP é `e_code` e o corpo contém `e_string`; NÃO existe quando o status
 * é `m_code` ou o corpo contém `m_string`. Fora disso o resultado é inconclusivo
 * (bloqueio anti-bot, captcha, layout mudou…).
 */
import wmn from './wmn-data.json';
import { UA, describeFetchError } from './net';

interface WmnSite {
  name: string;
  uri_check: string;
  uri_pretty?: string;
  post_body?: string;
  headers?: Record<string, string>;
  strip_bad_char?: string;
  e_code: number;
  e_string: string;
  m_code: number;
  m_string: string;
  cat: string;
  valid?: boolean;
  protection?: string[];
}

export type UsernameStatus = 'found' | 'missing' | 'unknown' | 'error';

export interface UsernameResult {
  site: string;
  category: string;
  url: string;
  status: UsernameStatus;
  http?: number;
  detail?: string;
}

export const NSFW_CATEGORY = 'xx NSFW xx';
const SITES = (wmn.sites as unknown as WmnSite[]).filter((s) => s.valid !== false);

/** Letras, números, ponto, hífen e sublinhado: o username vai na URL (às vezes no subdomínio). */
export const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function usernameCatalog() {
  const counts = new Map<string, number>();
  for (const s of SITES) counts.set(s.cat, (counts.get(s.cat) ?? 0) + 1);
  return {
    total: SITES.length,
    categories: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id)),
    source: 'WhatsMyName (CC BY-SA 4.0) — github.com/WebBreacher/WhatsMyName',
  };
}

export function selectSites(opts: { categories?: string[]; nsfw?: boolean }) {
  return SITES.filter((s) =>
    (opts.nsfw || s.cat !== NSFW_CATEGORY) && (!opts.categories?.length || opts.categories.includes(s.cat)));
}

const fill = (template: string, account: string) => template.split('{account}').join(account);

async function readBody(res: Response, maxBytes = 1_000_000) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= maxBytes) { await reader.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function checkSite(site: WmnSite, username: string, signal?: AbortSignal): Promise<UsernameResult> {
  const account = site.strip_bad_char ? [...username].filter((c) => !site.strip_bad_char!.includes(c)).join('') : username;
  const url = fill(site.uri_pretty ?? site.uri_check, encodeURIComponent(account));
  const base = { site: site.name, category: site.cat, url };
  try {
    const res = await fetch(fill(site.uri_check, encodeURIComponent(account)), {
      method: site.post_body ? 'POST' : 'GET',
      body: site.post_body ? fill(site.post_body, account) : undefined,
      headers: { 'user-agent': UA, accept: 'text/html,application/json,*/*', 'accept-language': 'en-US,en;q=0.9', ...site.headers },
      // Os códigos de "não existe" da base contam com o redirecionamento cru (ex.: 302).
      redirect: 'manual',
      signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(signal ? [signal] : [])]),
    });
    const body = await readBody(res);
    if (res.status === site.e_code && body.includes(site.e_string)) return { ...base, status: 'found', http: res.status };
    if (res.status === site.m_code || (site.m_string && body.includes(site.m_string))) return { ...base, status: 'missing', http: res.status };
    const blocked = [403, 429, 503].includes(res.status) || /captcha|cf-chl|just a moment/i.test(body.slice(0, 20_000));
    return { ...base, status: 'unknown', http: res.status, detail: blocked ? 'bloqueio anti-bot' : 'resposta inesperada' };
  } catch (e) {
    return { ...base, status: 'error', detail: describeFetchError(e) };
  }
}

/**
 * Consulta os sites com concorrência limitada, chamando `onResult` a cada
 * resposta — o controller transmite isso como NDJSON para a tela ir enchendo.
 */
export async function searchUsername(
  username: string,
  sites: WmnSite[],
  onResult: (r: UsernameResult) => void,
  signal?: AbortSignal,
  concurrency = 24,
) {
  let next = 0;
  const worker = async () => {
    while (next < sites.length && !signal?.aborted) {
      const site = sites[next++];
      onResult(await checkSite(site, username, signal));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, sites.length) }, worker));
}
