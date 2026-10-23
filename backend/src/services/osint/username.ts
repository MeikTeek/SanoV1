/**
 * Busca de username em ~1000 sites (WhatsMyName + Sherlock, ver `sites.ts`).
 *
 * O que separa isto de um "fetch em loop":
 * - cada tipo de regra tem seu veredito (`evaluate`), com 3 resultados honestos:
 *   encontrado / não existe / inconclusivo (bloqueio anti-bot, resposta estranha);
 * - sites com regra fraca (só status HTTP) passam por um CONTROLE: o mesmo pedido
 *   com um nome aleatório. Se o controle também "existe", o site responde igual para
 *   qualquer nome e o achado é descartado como falso positivo;
 * - nova tentativa com outro User-Agent em falhas transitórias (429, 5xx, rede);
 * - no máximo 2 pedidos simultâneos por site, para não ser bloqueado no meio da busca;
 * - perfis encontrados são enriquecidos com título/bio/foto da própria página.
 */
import { randomBytes } from 'node:crypto';
import { assertPublicHost, describeFetchError, UA } from './net';
import { profileSummary } from './html';
import { NSFW_CATEGORY, USERNAME_RE, selectSites, usernameCatalog, type Confidence, type Site } from './sites';

export { NSFW_CATEGORY, USERNAME_RE, selectSites, usernameCatalog };

export type UsernameStatus = 'found' | 'missing' | 'unknown' | 'error';

export interface UsernameResult {
  username: string;
  site: string;
  category: string;
  url: string;
  status: UsernameStatus;
  confidence: Confidence;
  source: Site['source'];
  http?: number;
  detail?: string;
  profile?: { title?: string; description?: string; image?: string };
}

const UA_ALT = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 32;
const PER_HOST = 2;
const MAX_ENRICH = 120;

/* ───────────────────────────── Variações de username ───────────────────────────── */

/** "ana.silva" → ana.silva, anasilva, ana_silva, ana-silva, asilva, anas… (todas válidas). */
export function usernameVariations(username: string): string[] {
  const out = new Set<string>([username]);
  const parts = username.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) {
    for (const sep of ['', '.', '_', '-']) out.add(parts.join(sep));
    const first = parts[0];
    const last = parts[parts.length - 1];
    out.add(first + last);
    out.add(first[0] + last);
    out.add(first + last[0]);
  }
  const noDigits = username.replace(/\d+$/, '');
  if (noDigits && noDigits !== username) out.add(noDigits);
  return [...out].filter((v) => USERNAME_RE.test(v)).slice(0, 8);
}

/* ─────────────────────────────────── Regras ─────────────────────────────────── */

const BLOCK_STATUS = new Set([401, 403, 407, 429, 451, 503]);
const CAPTCHA_RE = /captcha|cf-chl|just a moment|attention required|access denied|are you a robot/i;
const CHALLENGE_TITLE_RE = /<title[^>]*>\s*(?:just a moment|attention required|access denied|verifying you are human|checking your browser|one more step|are you a robot)/i;

const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[/?#].*$/, (m) => (m.length > 1 ? m : ''));

export interface RawResponse { status: number; body: string; finalUrl: string }
export interface Verdict { status: 'found' | 'missing' | 'unknown'; detail?: string }

/** Veredito puro (sem rede): testável com respostas fabricadas. */
export function evaluate(site: Site, res: RawResponse): Verdict {
  const { status, body } = res;
  const blocked = BLOCK_STATUS.has(status) || (status >= 500) || CAPTCHA_RE.test(body.slice(0, 20_000));
  const blockedDetail = `bloqueio anti-bot${site.protection?.length ? ` (${site.protection.join(', ')})` : ''}`;
  const rule = site.rule;
  // Página de desafio (Cloudflare etc.) não diz nada sobre o perfil, mesmo com status 200.
  if (CHALLENGE_TITLE_RE.test(body.slice(0, 5000))) return { status: 'unknown', detail: blockedDetail };

  switch (rule.kind) {
    case 'wmn': {
      if (status === rule.eCode && body.includes(rule.eString)) return { status: 'found' };
      if (status === rule.mCode || (rule.mString && body.includes(rule.mString))) return { status: 'missing' };
      return { status: 'unknown', detail: blocked ? blockedDetail : 'resposta inesperada' };
    }
    case 'status': {
      if (rule.errorCodes.includes(status)) return { status: 'missing' };
      if (status >= 200 && status < 300) return { status: 'found' };
      return blocked ? { status: 'unknown', detail: blockedDetail } : { status: 'missing' };
    }
    case 'message': {
      if (rule.errors.some((e) => body.includes(e))) return { status: 'missing' };
      if (status >= 200 && status < 300) return { status: 'found' };
      if (blocked) return { status: 'unknown', detail: blockedDetail };
      return status === 404 || status === 410 ? { status: 'missing' } : { status: 'unknown', detail: 'resposta inesperada' };
    }
    case 'redirect': {
      if (normUrl(res.finalUrl).startsWith(normUrl(rule.errorUrl))) return { status: 'missing' };
      if (status >= 200 && status < 300) return { status: 'found' };
      return blocked ? { status: 'unknown', detail: blockedDetail } : { status: 'missing' };
    }
  }
}

/* ─────────────────────────────────── Rede ─────────────────────────────────── */

async function readBody(res: Response, maxBytes = 600_000) {
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

interface Probe { url: string; method: string; body?: string; headers: Record<string, string> }

/**
 * Um pedido, seguindo redirecionamentos só quando `follow` (regras de mensagem e
 * redirecionamento). Os saltos além do primeiro passam pela guarda anti-SSRF.
 */
async function http(probe: Probe, follow: boolean, signal?: AbortSignal): Promise<RawResponse> {
  let current = probe.url;
  let method = probe.method;
  let body = probe.body;
  for (let hop = 0; ; hop++) {
    if (hop > 0) {
      const u = new URL(current);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('redirecionamento inválido');
      await assertPublicHost(u.hostname);
    }
    const res = await fetch(current, {
      method,
      body,
      headers: probe.headers,
      redirect: 'manual',
      signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
    });
    const location = res.headers.get('location');
    if (follow && res.status >= 300 && res.status < 400 && location && hop < 5) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, current).href;
      if (res.status !== 307 && res.status !== 308) { method = 'GET'; body = undefined; }
      continue;
    }
    return { status: res.status, body: await readBody(res), finalUrl: current };
  }
}

const fill = (template: string, account: string) => template.split('{account}').join(account);

function buildProbe(site: Site, account: string, ua: string): Probe {
  // Cabeçalhos de navegação real: parte dos 403 "anti-bot" é só filtro de cliente sem esses campos.
  const headers: Record<string, string> = {
    'user-agent': ua,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
    'accept-language': 'en-US,en;q=0.9',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    ...site.headers,
  };
  let body: string | undefined;
  if (site.body) {
    body = fill(site.body, account);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['content-type'] = body.trimStart().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded';
    }
  }
  return { url: fill(site.probeUrl, encodeURIComponent(account)), method: site.method, body, headers };
}

const followsRedirects = (site: Site) => site.rule.kind === 'message' || site.rule.kind === 'redirect';

/** Limite de pedidos simultâneos por site. */
const hostSlots = new Map<string, { active: number; waiting: (() => void)[] }>();
async function withHost<T>(host: string, fn: () => Promise<T>): Promise<T> {
  let slot = hostSlots.get(host);
  if (!slot) hostSlots.set(host, (slot = { active: 0, waiting: [] }));
  if (slot.active >= PER_HOST) await new Promise<void>((resolve) => slot!.waiting.push(resolve));
  slot.active++;
  try {
    return await fn();
  } finally {
    slot.active--;
    slot.waiting.shift()?.();
    if (!slot.active && !slot.waiting.length) hostSlots.delete(host);
  }
}

const hostOf = (url: string) => {
  try { return new URL(url).hostname; } catch { return url; }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Consulta o site (com 1 nova tentativa em falha transitória) e devolve resposta ou erro. */
async function query(site: Site, account: string, signal?: AbortSignal): Promise<{ res?: RawResponse; error?: string }> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) break;
    try {
      const probe = buildProbe(site, account, attempt === 0 ? UA : UA_ALT);
      const res = await withHost(hostOf(probe.url), () => http(probe, followsRedirects(site), signal));
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await sleep(700); continue; }
      return { res };
    } catch (e) {
      lastError = describeFetchError(e);
      if (signal?.aborted) break;
      await sleep(400);
    }
  }
  return { error: lastError ?? 'cancelado' };
}

const randomAccount = () => `zq${randomBytes(6).toString('hex')}`;

/* ─────────────────────────────── Verificação de um site ─────────────────────────────── */

let enriched = 0;

export async function checkSite(site: Site, username: string, signal?: AbortSignal): Promise<UsernameResult> {
  const account = site.strip ? [...username].filter((c) => !site.strip!.includes(c)).join('') : username;
  const base = {
    username,
    site: site.name,
    category: site.category,
    url: fill(site.profileUrl, encodeURIComponent(account)),
    confidence: site.confidence,
    source: site.source,
  };

  const { res, error } = await query(site, account, signal);
  if (!res) return { ...base, status: 'error', detail: error };
  const verdict = evaluate(site, res);
  if (verdict.status !== 'found') return { ...base, status: verdict.status, http: res.status, detail: verdict.detail };

  // Controle: regra fraca + nome inexistente também "existe" ⇒ o site responde igual para tudo.
  if (site.confidence !== 'high' && (!site.regex || site.regex.test(randomAccount()))) {
    const control = await query(site, randomAccount(), signal);
    if (control.res && evaluate(site, control.res).status === 'found') {
      return { ...base, status: 'unknown', http: res.status, detail: 'o site responde igual para qualquer nome (falso positivo provável)' };
    }
  }

  const result: UsernameResult = { ...base, status: 'found', http: res.status };
  if (enriched < MAX_ENRICH && !signal?.aborted) {
    enriched++;
    // Sites consultados por API (probeUrl ≠ profileUrl) não devolvem a página: busca-se o perfil.
    const isPage = site.probeUrl === site.profileUrl && /<html|<head/i.test(res.body.slice(0, 2000));
    const page = isPage
      ? res.body
      : (await http({ url: base.url, method: 'GET', headers: { 'user-agent': UA, accept: 'text/html,*/*' } }, true, signal).catch(() => null))?.body;
    if (page) result.profile = profileSummary(page, base.url);
  }
  return result;
}

/* ───────────────────────────────── Varredura ───────────────────────────────── */

function shuffle<T>(list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Pares (username, site) aplicáveis: o formato do username precisa ser aceito pelo site. */
export function planSearch(usernames: string[], sites: Site[]) {
  return shuffle(usernames.flatMap((username) =>
    sites.filter((s) => !s.regex || s.regex.test(username)).map((site) => ({ username, site }))));
}

export async function searchUsernames(
  jobs: { username: string; site: Site }[],
  onResult: (r: UsernameResult) => void,
  signal?: AbortSignal,
) {
  enriched = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !signal?.aborted) {
      const { username, site } = jobs[next++];
      onResult(await checkSite(site, username, signal));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
}
