/**
 * Verificações de domínio/IP do módulo OSINT.
 *
 * Adaptado de web-check v2.3.0 (MIT, © Alicia Sykes — github.com/lissy93/web-check),
 * pasta `api/`. Mudanças em relação ao original:
 * - TypeScript e sem dependências pesadas (sem puppeteer, cheerio, whoiser, wappalyzer);
 *   WHOIS via RDAP, registros DNS via DoH e meta tags lidas por expressão regular.
 * - Toda conexão ao alvo passa pela guarda anti-SSRF de `net.ts`.
 * - Algumas verificações foram fundidas (headers + segurança HTTP + HSTS).
 */
import crypto from 'node:crypto';
import { isIP } from 'node:net';
import tls from 'node:tls';
import { assertPublicHost, CheckError, doh, getJson, guardedLookup, safeFetch, txtData, type Target } from './net';

export type CheckResult = Record<string, unknown> | { skipped: string } | { error: string };

export interface DomainCheck {
  id: string;
  label: string;
  description: string;
  run: (t: Target) => Promise<CheckResult>;
}

const skipped = (reason: string) => ({ skipped: reason });
const stripDot = (s: string) => s.replace(/\.$/, '');

/** Nome para consulta PTR: 1.2.3.4 → 4.3.2.1.in-addr.arpa (IPv6 expandido em nibbles). */
function reverseName(ip: string) {
  if (isIP(ip) === 4) return `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const tl = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(8 - h.length - tl.length).fill('0'), ...tl].map((g) => g.padStart(4, '0'));
  return `${groups.join('').split('').reverse().join('.')}.ip6.arpa`;
}

/* ─────────────────────────────── IP e localização ─────────────────────────────── */

const ip: DomainCheck = {
  id: 'ip',
  label: 'Endereços IP',
  description: 'IPs para os quais o host resolve e o nome reverso (PTR).',
  async run(t) {
    const addresses = await assertPublicHost(t.hostname);
    const reverse = await Promise.all(addresses.slice(0, 4).map(async (a) => ({
      ip: a,
      ptr: await doh(reverseName(a), 'PTR').then((r) => r.data.map(stripDot)).catch(() => [] as string[]),
    })));
    return { enderecos: addresses, reverso: reverse };
  },
};

type Geo = Record<string, string | number | undefined>;
const GEO_PROVIDERS: { name: string; url: (ip: string) => string; parse: (d: any) => Geo | null }[] = [
  {
    name: 'ipwho.is',
    url: (ip) => `https://ipwho.is/${ip}`,
    parse: (d) => d?.success === false ? null : {
      ip: d.ip, cidade: d.city, regiao: d.region, pais: d.country, codigoPais: d.country_code,
      latitude: d.latitude, longitude: d.longitude, provedor: d.connection?.isp || d.connection?.org,
      asn: d.connection?.asn, fusoHorario: d.timezone?.id,
    },
  },
  {
    name: 'geojs.io',
    url: (ip) => `https://get.geojs.io/v1/ip/geo/${ip}.json`,
    parse: (d) => d?.country_code ? {
      ip: d.ip, cidade: d.city, regiao: d.region, pais: d.country, codigoPais: d.country_code,
      latitude: d.latitude !== 'nil' ? parseFloat(d.latitude) : undefined,
      longitude: d.longitude !== 'nil' ? parseFloat(d.longitude) : undefined,
      provedor: d.organization_name, asn: d.asn, fusoHorario: d.timezone,
    } : null,
  },
  {
    name: 'reallyfreegeoip.org',
    url: (ip) => `https://reallyfreegeoip.org/json/${ip}`,
    parse: (d) => d?.country_code ? {
      ip: d.ip, cidade: d.city, regiao: d.region_name, pais: d.country_name, codigoPais: d.country_code,
      latitude: d.latitude, longitude: d.longitude, fusoHorario: d.time_zone,
    } : null,
  },
];

const location: DomainCheck = {
  id: 'location',
  label: 'Localização do servidor',
  description: 'Geolocalização aproximada e provedor do IP principal.',
  async run(t) {
    const [addr] = await assertPublicHost(t.hostname);
    const ac = new AbortController();
    try {
      const geo = await Promise.any(GEO_PROVIDERS.map(async (p) => {
        const res = await fetch(p.url(addr), { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(6000)]) });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const parsed = p.parse(await res.json());
        if (!parsed?.codigoPais) throw new Error('sem dados');
        return { ...parsed, fonte: p.name };
      }));
      ac.abort();
      return geo;
    } catch {
      return { error: 'Nenhum provedor de geolocalização respondeu' };
    }
  },
};

/* ─────────────────────────────────── DNS ─────────────────────────────────── */

const dnsRecords: DomainCheck = {
  id: 'dns',
  label: 'Registros DNS',
  description: 'A, AAAA, MX, NS, CNAME, TXT, SOA e CAA.',
  async run(t) {
    if (t.isIp) return skipped('Registros DNS se aplicam a domínios, não a IPs');
    const types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'] as const;
    const answers = await Promise.all(types.map((type) => doh(t.hostname, type)));
    if (answers[0].nxdomain) return skipped('O domínio não existe (NXDOMAIN)');
    const out = Object.fromEntries(types.map((type, i) => {
      const data = answers[i].data;
      if (type === 'TXT') return [type, data.map(txtData)];
      if (type === 'MX') return [type, data.map(stripDot).sort((x, y) => parseInt(x) - parseInt(y))];
      return [type, data.map(stripDot)];
    }));
    return Object.values(out).some((v) => v.length) ? out : skipped('Nenhum registro DNS encontrado');
  },
};

const dnssec: DomainCheck = {
  id: 'dnssec',
  label: 'DNSSEC',
  description: 'Se a zona é assinada (DNSKEY, DS e validação AD).',
  async run(t) {
    if (t.isIp) return skipped('DNSSEC se aplica a domínios');
    const [dnskey, ds, soa] = await Promise.all(['DNSKEY', 'DS', 'SOA'].map((type) => doh(t.domain, type, true)));
    return {
      assinado: dnskey.data.length > 0 && ds.data.length > 0,
      validado: soa.ad,
      DNSKEY: dnskey.data,
      DS: ds.data,
    };
  },
};

/* ─────────────────────────────── WHOIS / RDAP ─────────────────────────────── */

const vcardName = (vcard: any): string | undefined =>
  Array.isArray(vcard?.[1]) ? vcard[1].find((f: any) => Array.isArray(f) && f[0] === 'fn')?.[3] || undefined : undefined;

const whois: DomainCheck = {
  id: 'whois',
  label: 'WHOIS (RDAP)',
  description: 'Registro do domínio (ou dono da faixa de IP): registrar, datas, status.',
  async run(t) {
    const path = t.isIp ? `ip/${t.hostname}` : `domain/${encodeURIComponent(t.domain)}`;
    let data: any;
    try {
      data = await getJson(`https://rdap.org/${path}`, 10_000, { accept: 'application/rdap+json, application/json' });
    } catch (e) {
      return /HTTP 404/.test((e as Error).message) ? skipped('Sem dados RDAP para este alvo (TLD sem RDAP público?)') : { error: (e as Error).message };
    }
    const events: { eventAction: string; eventDate: string }[] = data.events ?? [];
    const evt = (action: string) => events.find((e) => e.eventAction === action)?.eventDate;
    const entities: any[] = data.entities ?? [];
    const byRole = (role: string) => entities.find((e) => (e.roles ?? []).includes(role));
    const registrar = byRole('registrar');
    const common = {
      criado: evt('registration'),
      atualizado: evt('last changed'),
      expira: evt('expiration'),
      status: data.status,
    };
    if (t.isIp) {
      return {
        rede: data.name, faixa: data.startAddress && `${data.startAddress} – ${data.endAddress}`,
        cidr: (data.cidr0_cidrs ?? []).map((c: any) => `${c.v4prefix ?? c.v6prefix}/${c.length}`),
        pais: data.country, tipo: data.type, ...common,
        responsavel: vcardName(byRole('registrant')?.vcardArray) ?? vcardName(entities[0]?.vcardArray),
      };
    }
    return {
      dominio: data.ldhName?.toLowerCase() ?? t.domain,
      registrar: vcardName(registrar?.vcardArray),
      registrarIanaId: registrar?.publicIds?.find((p: any) => /iana/i.test(p.type))?.identifier,
      ...common,
      nameservers: (data.nameservers ?? []).map((n: any) => String(n.ldhName).toLowerCase()),
      dnssec: data.secureDNS?.delegationSigned ? 'assinado' : 'não assinado',
      titular: vcardName(byRole('registrant')?.vcardArray),
    };
  },
};

/* ─────────────────────────────────── TLS ─────────────────────────────────── */

const ssl: DomainCheck = {
  id: 'ssl',
  label: 'Certificado SSL/TLS',
  description: 'Emissor, validade, nomes cobertos e protocolo negociado.',
  run(t) {
    const port = Number(new URL(t.url).port) || 443;
    return new Promise((resolve) => {
      const socket = tls.connect({
        host: t.hostname, port, servername: t.isIp ? undefined : t.hostname,
        rejectUnauthorized: false, lookup: guardedLookup as any, timeout: 10_000,
      }, () => {
        const cert = socket.getPeerCertificate();
        const out = cert && Object.keys(cert).length ? {
          valido: socket.authorized,
          erro: socket.authorizationError ? String(socket.authorizationError) : null,
          assunto: cert.subject?.CN,
          emissor: [cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(' — '),
          validoDe: new Date(cert.valid_from).toISOString(),
          validoAte: new Date(cert.valid_to).toISOString(),
          diasRestantes: Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000),
          nomes: (cert.subjectaltname ?? '').split(', ').map((n) => n.replace(/^DNS:/, '')).filter(Boolean),
          protocolo: socket.getProtocol(),
          cifra: socket.getCipher()?.name,
          chaveBits: (cert as { bits?: number }).bits,
          serial: cert.serialNumber,
          sha256: cert.fingerprint256,
        } : { error: 'O servidor não apresentou certificado' };
        socket.end();
        resolve(out);
      });
      socket.on('timeout', () => { socket.destroy(); resolve({ error: 'Tempo esgotado na conexão TLS' }); });
      socket.on('error', (e) => resolve({ error: e instanceof CheckError ? e.message : `Falha na conexão TLS: ${e.message}` }));
    });
  },
};

/* ──────────────────────────────────── HTTP ──────────────────────────────────── */

const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'HSTS',
  'content-security-policy': 'CSP',
  'x-content-type-options': 'X-Content-Type-Options',
  'x-frame-options': 'X-Frame-Options',
  'referrer-policy': 'Referrer-Policy',
  'permissions-policy': 'Permissions-Policy',
  'cross-origin-opener-policy': 'COOP',
  'cross-origin-resource-policy': 'CORP',
  'cross-origin-embedder-policy': 'COEP',
};

const hstsVerdict = (header: string | null) => {
  if (!header) return 'Não envia HSTS';
  const lower = header.toLowerCase();
  const maxAge = parseInt(lower.match(/max-age=(\d+)/)?.[1] ?? '0', 10);
  if (maxAge < 10_886_400) return `max-age=${maxAge}, abaixo do mínimo para preload (18 semanas)`;
  if (!lower.includes('includesubdomains')) return 'Não cobre subdomínios';
  if (!lower.includes('preload')) return 'Sem a diretiva preload';
  return 'Compatível com a lista de preload';
};

const http: DomainCheck = {
  id: 'http',
  label: 'Servidor HTTP',
  description: 'Status, tempo de resposta, redirecionamentos e cabeçalhos.',
  async run(t) {
    const r = await safeFetch(t.url, { readBody: false });
    const headers = Object.fromEntries(r.headers.entries());
    return {
      status: r.status,
      tempoMs: r.ms,
      urlFinal: r.url,
      redirecionamentos: r.chain.length > 1 ? r.chain : [],
      servidor: headers.server,
      tecnologia: headers['x-powered-by'],
      cabecalhos: headers,
    };
  },
};

const httpSecurity: DomainCheck = {
  id: 'http-security',
  label: 'Segurança HTTP',
  description: 'Cabeçalhos de proteção presentes e avaliação do HSTS.',
  async run(t) {
    const r = await safeFetch(t.url, { readBody: false });
    const present = Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([h, label]) => [label, r.headers.has(h)]));
    const score = Object.values(present).filter(Boolean).length;
    const cookies = r.headers.getSetCookie();
    return {
      nota: `${score}/${Object.keys(SECURITY_HEADERS).length}`,
      cabecalhos: present,
      hsts: hstsVerdict(r.headers.get('strict-transport-security')),
      cookies: cookies.map((c) => {
        const [pair, ...attrs] = c.split(';');
        const flags = attrs.map((a) => a.trim().toLowerCase());
        return `${pair.split('=')[0]} — ${['secure', 'httponly'].filter((f) => flags.includes(f)).join(', ') || 'sem Secure/HttpOnly'}${flags.find((f) => f.startsWith('samesite')) ? `, ${flags.find((f) => f.startsWith('samesite'))}` : ''}`;
      }),
    };
  },
};

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/** Lê `<meta>` e `<link>` sem parser HTML: suficiente para as tags de cabeçalho. */
function readMeta(html: string) {
  const head = html.slice(0, 300_000);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && content !== undefined && !(key in meta)) meta[key] = decode(content);
  }
  const link = (rel: string) => head.match(new RegExp(`<link\\b[^>]*rel=["'][^"']*\\b${rel}\\b[^"']*["'][^>]*>`, 'i'))?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  return {
    titulo: decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''),
    descricao: meta.description,
    palavrasChave: meta.keywords,
    autor: meta.author,
    gerador: meta.generator,
    canonica: link('canonical'),
    favicon: link('icon'),
    ogTitulo: meta['og:title'],
    ogDescricao: meta['og:description'],
    ogImagem: meta['og:image'],
    ogSite: meta['og:site_name'],
    twitterSite: meta['twitter:site'],
    twitterCriador: meta['twitter:creator'],
    robots: meta.robots,
    corTema: meta['theme-color'],
  };
}

/** Perfis sociais linkados na página — pista boa para OSINT de organizações. */
const SOCIAL_HOSTS = /https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|tiktok\.com|github\.com|t\.me|wa\.me|discord\.gg|threads\.net|pinterest\.com)\/[^\s"'<>)]+/gi;

const page: DomainCheck = {
  id: 'page',
  label: 'Página e redes sociais',
  description: 'Título, meta tags (Open Graph/Twitter), e-mails e perfis sociais citados na página.',
  async run(t) {
    const r = await safeFetch(t.url, { headers: { accept: 'text/html,*/*' } });
    if (!/html/i.test(r.headers.get('content-type') ?? '')) return skipped('A resposta não é uma página HTML');
    const meta = Object.fromEntries(Object.entries(readMeta(r.body)).filter(([, v]) => v));
    const socials = [...new Set((r.body.match(SOCIAL_HOSTS) ?? []).map((u) => u.replace(/[/?#]+$/, '')))].slice(0, 40);
    const emails = [...new Set((r.body.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e)))].slice(0, 30);
    return { ...meta, perfisSociais: socials, emails };
  },
};

const robots: DomainCheck = {
  id: 'robots',
  label: 'robots.txt',
  description: 'Regras de rastreamento — às vezes revelam caminhos escondidos.',
  async run(t) {
    const r = await safeFetch(new URL('/robots.txt', t.url).href, { maxBytes: 200_000 });
    if (r.status >= 400 || /<html/i.test(r.body.slice(0, 500))) return skipped('Sem robots.txt');
    const rules = r.body.split('\n').map((l) => l.trim()).filter((l) => /^(user-agent|allow|disallow|sitemap):/i.test(l));
    return rules.length ? { regras: rules.slice(0, 300), total: rules.length } : skipped('robots.txt sem regras');
  },
};

const securityTxt: DomainCheck = {
  id: 'security-txt',
  label: 'security.txt',
  description: 'Contato de segurança publicado (RFC 9116).',
  async run(t) {
    for (const path of ['/.well-known/security.txt', '/security.txt']) {
      const r = await safeFetch(new URL(path, t.url).href, { maxBytes: 100_000 }).catch(() => null);
      if (!r || r.status !== 200 || /<html/i.test(r.body.slice(0, 500))) continue;
      const fields: Record<string, string[]> = {};
      for (const line of r.body.split('\n')) {
        const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
        if (m && !line.startsWith('#')) (fields[m[1]] ??= []).push(m[2].trim());
      }
      return { encontradoEm: path, assinadoPgp: r.body.includes('-----BEGIN PGP SIGNED MESSAGE-----'), campos: fields };
    }
    return skipped('Nenhum security.txt publicado');
  },
};

/* ─────────────────────────────────── E-mail ─────────────────────────────────── */

const safeTxt = async (name: string) => (await doh(name, 'TXT')).data.map(txtData);
const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'dkim', 'mail', 'protonmail', 'fm1', 'mxvault', 'zoho'];
const parseTags = (record: string) =>
  Object.fromEntries(record.split(';').map((part) => {
    const [tag, ...value] = part.split('=');
    return [tag.trim().toLowerCase(), value.join('=').trim()];
  }));
const keyBits = (base64: string) => {
  try {
    return crypto.createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' }).asymmetricKeyDetails?.modulusLength ?? null;
  } catch {
    return null;
  }
};
const MX_PROVIDERS: [string[], string][] = [
  [['google.com', 'googlemail.com'], 'Google Workspace'],
  [['outlook.com', 'microsoft.com'], 'Microsoft 365'],
  [['protonmail.ch'], 'Proton Mail'],
  [['messagingengine.com'], 'Fastmail'],
  [['zoho.com', 'zoho.eu'], 'Zoho Mail'],
  [['yahoodns.net'], 'Yahoo Mail'],
  [['mimecast.com'], 'Mimecast'],
  [['pphosted.com'], 'Proofpoint'],
  [['locaweb.com.br'], 'Locaweb'],
  [['hostinger.com', 'hostinger.com.br'], 'Hostinger'],
  [['umbler.com'], 'Umbler'],
  [['kinghost.net'], 'KingHost'],
];

const mail: DomainCheck = {
  id: 'mail',
  label: 'Configuração de e-mail',
  description: 'MX, SPF, DMARC, DKIM (seletores comuns) e provedor de e-mail.',
  async run(t) {
    if (t.isIp) return skipped('Configuração de e-mail se aplica a domínios');
    const d = t.domain;
    const [mxAnswer, root, dmarc, dkim] = await Promise.all([
      doh(d, 'MX'),
      safeTxt(d),
      safeTxt(`_dmarc.${d}`),
      Promise.all(DKIM_SELECTORS.map(async (selector) => {
        const recs = await safeTxt(`${selector}._domainkey.${d}`).catch(() => []);
        const rec = recs.find((r) => !!parseTags(r).p);
        return rec ? { seletor: selector, bits: keyBits(parseTags(rec).p) } : null;
      })),
    ]);
    const mx = mxAnswer.data.map(stripDot).sort((a, b) => parseInt(a) - parseInt(b));
    const spf = root.filter((r) => r.toLowerCase().startsWith('v=spf1'));
    const dmarcRec = dmarc.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
    if (!mx.length && !spf.length && !dmarcRec) return skipped('Domínio sem servidor de e-mail configurado');
    const providers = [...new Set(mx.flatMap((m) => MX_PROVIDERS
      .filter(([ends]) => ends.some((e) => m.toLowerCase().endsWith(e))).map(([, name]) => name)))];
    return {
      provedores: providers,
      MX: mx,
      SPF: spf[0] ?? 'ausente',
      DMARC: dmarcRec ?? 'ausente',
      politicaDmarc: dmarcRec ? parseTags(dmarcRec).p ?? '—' : '—',
      DKIM: dkim.filter(Boolean),
    };
  },
};

/* ──────────────────────────────── Subdomínios ──────────────────────────────── */

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SUB_SOURCES: { name: string; lookup: (d: string) => Promise<string[]> }[] = [
  {
    name: 'crt.sh',
    lookup: async (d) => (await getJson<any[]>(`https://crt.sh/?q=${encodeURIComponent(`%.${d}`)}&output=json`, 15_000))
      .flatMap((row) => String(row?.name_value ?? '').split('\n')),
  },
  {
    name: 'certspotter',
    lookup: async (d) => (await getJson<any[]>(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(d)}&include_subdomains=true&expand=dns_names`, 10_000))
      .flatMap((row) => row?.dns_names ?? []),
  },
  {
    name: 'hackertarget',
    lookup: async (d) => {
      const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(d)}`, { signal: AbortSignal.timeout(10_000) });
      const body = await res.text();
      if (!res.ok || /error|api count|quota/i.test(body)) throw new Error('indisponível');
      return body.split('\n').map((l) => l.split(',')[0]);
    },
  },
];

const subdomains: DomainCheck = {
  id: 'subdomains',
  label: 'Subdomínios',
  description: 'Subdomínios conhecidos via logs de Certificate Transparency.',
  async run(t) {
    if (t.isIp) return skipped('Subdomínios se aplicam a domínios');
    const d = t.domain;
    const failures: string[] = [];
    for (const source of SUB_SOURCES) {
      try {
        const names = [...new Set((await source.lookup(d))
          .map((n) => String(n).trim().toLowerCase().replace(/^\*\./, ''))
          .filter((n) => n !== d && n.endsWith(`.${d}`) && HOSTNAME_RE.test(n)))].sort();
        if (names.length) return { fonte: source.name, total: names.length, subdominios: names.slice(0, 500) };
      } catch (e) {
        failures.push(`${source.name}: ${(e as Error).message}`);
      }
    }
    return failures.length === SUB_SOURCES.length
      ? { error: `Fontes indisponíveis (${failures.join('; ')})` }
      : skipped('Nenhum subdomínio encontrado nos logs de certificados');
  },
};

/* ──────────────────────────────────────────────────────────────────────────── */

export const DOMAIN_CHECKS: DomainCheck[] = [
  ip, location, dnsRecords, whois, ssl, http, httpSecurity, mail, subdomains, page, dnssec, robots, securityTxt,
];

const TIMEOUT_MS = 30_000;

/** Roda uma verificação com tempo-limite; erros viram `{ error }` para o cartão. */
export async function runDomainCheck(id: string, target: Target): Promise<CheckResult> {
  const check = DOMAIN_CHECKS.find((c) => c.id === id);
  if (!check) return { error: 'Verificação desconhecida' };
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      check.run(target),
      new Promise<CheckResult>((resolve) => { timer = setTimeout(() => resolve({ error: 'Tempo esgotado' }), TIMEOUT_MS); }),
    ]);
  } catch (e) {
    if (e instanceof CheckError) return { error: e.message };
    console.warn(`[osint] verificação ${id} falhou:`, e);
    return { error: (e as Error).message || 'Falha inesperada' };
  } finally {
    clearTimeout(timer);
  }
}
