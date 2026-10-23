/**
 * Rede do módulo OSINT: normalização do alvo e guarda contra SSRF.
 *
 * O servidor faz requisições para endereços digitados no painel. Sem essa
 * guarda, "localhost:8080", "169.254.169.254" ou um domínio que resolve para a
 * rede interna da hospedagem virariam uma porta para dentro do próprio Sano.
 * Toda conexão de saída das verificações de domínio passa por `assertPublicHost`
 * (e os redirecionamentos são seguidos manualmente, salto a salto, pelo mesmo crivo).
 */
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import psl from 'psl';
import { AppError } from '../../utils/errors';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface Target {
  /** URL completa (https:// quando o usuário não informou o esquema). */
  url: string;
  hostname: string;
  isIp: boolean;
  /** Domínio registrável (exemplo.com.br) ou o próprio IP. */
  domain: string;
}

/** Erro "esperado" de uma verificação: vira `{ error }` no cartão, sem stack no log. */
export class CheckError extends Error {}

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

export function parseTarget(raw: string): Target {
  const input = raw.trim();
  if (!input || input.length > 300) throw new AppError(400, 'Informe um domínio, URL ou IP válido');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${bracketIPv6(input)}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new AppError(400, 'Informe um domínio, URL ou IP válido');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new AppError(400, 'Use apenas http ou https');
  if (u.username || u.password) throw new AppError(400, 'Não inclua usuário/senha na URL');

  const hostname = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const ip = isIP(hostname) !== 0;
  if (ip && isPrivateIp(hostname)) throw new AppError(400, 'Endereços internos/privados não podem ser analisados');
  if (!ip) {
    if (hostname === 'localhost' || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s)) || !hostname.includes('.')) {
      throw new AppError(400, 'Endereços internos/privados não podem ser analisados');
    }
  }
  u.hash = '';
  return { url: u.href, hostname, isIp: ip, domain: ip ? hostname : psl.get(hostname) ?? hostname };
}

/** IPv6 "nu" (2+ dois-pontos) precisa de colchetes para virar URL. */
function bracketIPv6(str: string) {
  const host = str.split('/')[0];
  return !host.startsWith('[') && (host.match(/:/g) ?? []).length >= 2 ? str.replace(host, `[${host}]`) : str;
}

const v4ToNum = (ip: string) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** Loopback, redes privadas, link-local, CGNAT, documentação, multicast e reservados. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = v4ToNum(ip);
    return PRIVATE_V4.some(([range, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((v4ToNum(range) & mask) >>> 0);
    });
  }
  const v6 = ip.toLowerCase();
  // IPv4 embutido (::ffff:10.0.0.1, 64:ff9b::7f00:1 etc.)
  const dotted = v6.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIp(dotted[1]);
  const mapped = v6.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    return isPrivateIp([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
  }
  return v6 === '::' || v6 === '::1' || /^f[c-d]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

/** Resolve o host e garante que nenhum endereço aponte para a rede interna. */
export async function assertPublicHost(hostname: string): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      throw new CheckError(code === 'ENOTFOUND' ? 'O domínio não resolve para nenhum IP' : `Falha de DNS (${code ?? 'desconhecida'})`);
    }
  }
  if (!addresses.length) throw new CheckError('O domínio não resolve para nenhum IP');
  if (addresses.some(isPrivateIp)) throw new CheckError('O alvo resolve para um endereço interno — bloqueado');
  return addresses;
}

/** `lookup` para `tls.connect`/`https.request`: resolve uma vez e já valida o IP usado na conexão. */
export const guardedLookup = (
  hostname: string,
  opts: { all?: boolean },
  cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void,
) => {
  assertPublicHost(hostname)
    // Node 20+ pede `all: true` (autoSelectFamily) e espera a lista de endereços.
    .then((addrs) => opts?.all
      ? cb(null, addrs.map((address) => ({ address, family: isIP(address) })))
      : cb(null, addrs[0], isIP(addrs[0])))
    .catch((err) => cb(err, opts?.all ? [] : '', 4));
};

/* ── DNS sobre HTTPS ──
   As consultas de registros (MX, TXT, NS…) vão por DoH em vez do resolvedor do
   sistema: funciona igual em qualquer hospedagem (algumas bloqueiam a porta 53
   ou têm resolvedor que recusa consultas que não sejam A/AAAA). */

const DOH_TYPES: Record<string, number> = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, DS: 43, DNSKEY: 48, CAA: 257 };
const DOH_SERVERS = ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query'];

export interface DohAnswer { data: string[]; ad: boolean; nxdomain: boolean }

export async function doh(name: string, type: keyof typeof DOH_TYPES | string, dnssec = false): Promise<DohAnswer> {
  let lastError: unknown;
  for (const server of DOH_SERVERS) {
    try {
      const json = await getJson<{ Status: number; AD?: boolean; Answer?: { type: number; data: string }[] }>(
        `${server}?name=${encodeURIComponent(name)}&type=${type}${dnssec ? '&do=1' : ''}`, 6000, { accept: 'application/dns-json' },
      );
      const want = DOH_TYPES[type];
      return {
        data: (json.Answer ?? []).filter((a) => a.type === want).map((a) => a.data),
        ad: !!json.AD,
        nxdomain: json.Status === 3,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof CheckError ? lastError : new CheckError('Falha nas consultas DNS (DoH)');
}

/** TXT chega como `"parte1" "parte2"`; junta as partes numa string só. */
export const txtData = (raw: string) => (raw.match(/"((?:[^"\\]|\\.)*)"/g) ?? [raw]).map((p) => p.replace(/^"|"$/g, '').replace(/\\"/g, '"')).join('');

export interface FetchResult {
  status: number;
  headers: Headers;
  /** URL final, depois dos redirecionamentos. */
  url: string;
  /** Cadeia de URLs visitadas (a primeira é a pedida). */
  chain: string[];
  body: string;
  ms: number;
}

/**
 * fetch com guarda anti-SSRF a cada salto, tempo-limite e corpo truncado.
 * `readBody: false` descarta o corpo (só cabeçalhos/status interessam).
 */
export async function safeFetch(
  url: string,
  opts: { timeout?: number; maxRedirects?: number; maxBytes?: number; readBody?: boolean; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const { timeout = 10_000, maxRedirects = 8, maxBytes = 1_500_000, readBody = true } = opts;
  const started = performance.now();
  const chain = [url];
  let current = url;

  for (let hop = 0; ; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new CheckError(`Redirecionamento para esquema não suportado (${u.protocol})`);
    await assertPublicHost(u.hostname);

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': UA, accept: '*/*', ...opts.headers },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      throw new CheckError(describeFetchError(e));
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location && hop < maxRedirects) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, current).href;
      chain.push(current);
      continue;
    }

    const body = readBody ? await readLimited(res, maxBytes) : (await res.body?.cancel().catch(() => {}), '');
    return { status: res.status, headers: res.headers, url: current, chain, body, ms: Math.round(performance.now() - started) };
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function describeFetchError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Tempo esgotado';
  const code = err.cause?.code;
  if (code === 'ENOTFOUND') return 'O domínio não resolve';
  if (code === 'ECONNREFUSED') return 'Conexão recusada';
  if (code === 'ECONNRESET') return 'Conexão encerrada pelo servidor';
  if (code?.startsWith('ERR_TLS') || code?.includes('CERT')) return `Falha de TLS (${code})`;
  return code ? `Falha de conexão (${code})` : err.message;
}

/** GET de JSON em API pública conhecida (sem alvo do usuário no host). */
export async function getJson<T = unknown>(url: string, timeout = 8000, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new CheckError(describeFetchError(e));
  }
  if (!res.ok) throw new CheckError(`HTTP ${res.status} em ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

export const stripTrailingDot = (s: string) => s.replace(/\.$/, '');
