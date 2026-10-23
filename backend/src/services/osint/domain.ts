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
import dnsPromises from 'node:dns/promises';
import { isIP } from 'node:net';
import tls from 'node:tls';
import { readMeta } from './html';
import { assertPublicHost, CheckError, doh, isPrivateIp, getJson, guardedLookup, safeFetch, stripTrailingDot, txtData, type FetchResult, type Target } from './net';

export type CheckResult = Record<string, unknown> | { skipped: string } | { error: string };

export interface DomainCheck {
  id: string;
  label: string;
  description: string;
  run: (t: Target) => Promise<CheckResult>;
  /** Tempo-limite próprio (padrão 30 s). */
  timeout?: number;
}

const skipped = (reason: string) => ({ skipped: reason });
const stripDot = stripTrailingDot;

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

/** A página inicial é buscada uma vez por varredura e compartilhada entre as verificações. */
const pages = new WeakMap<Target, Promise<FetchResult>>();
const getPage = (t: Target) => {
  let p = pages.get(t);
  if (!p) pages.set(t, (p = safeFetch(t.url, { headers: { accept: 'text/html,*/*' } })));
  return p;
};

const http: DomainCheck = {
  id: 'http',
  label: 'Servidor HTTP',
  description: 'Status, tempo de resposta, redirecionamentos e cabeçalhos.',
  async run(t) {
    const r = await getPage(t);
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
    const r = await getPage(t);
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

/** Perfis sociais linkados na página — pista boa para OSINT de organizações. */
const SOCIAL_HOSTS = /https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|tiktok\.com|github\.com|t\.me|wa\.me|discord\.gg|threads\.net|pinterest\.com)\/[^\s"'<>)]+/gi;

const page: DomainCheck = {
  id: 'page',
  label: 'Página e redes sociais',
  description: 'Título, meta tags (Open Graph/Twitter), e-mails e perfis sociais citados na página.',
  async run(t) {
    const r = await getPage(t);
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


/* ───────────────────────────── Tecnologias (fingerprint) ───────────────────────────── */

interface Sig { name: string; cat: string; header?: [string, RegExp]; html?: RegExp; cookie?: RegExp }

const SIGS: Sig[] = [
  // CMS e lojas
  { name: 'WordPress', cat: 'CMS', html: /wp-content\/|wp-includes\/|name=["']generator["'] content=["']WordPress/i },
  { name: 'Joomla', cat: 'CMS', html: /name=["']generator["'] content=["']Joomla|\/media\/jui\//i },
  { name: 'Drupal', cat: 'CMS', html: /name=["']generator["'] content=["']Drupal|\/sites\/default\/files\//i, header: ['x-generator', /drupal/i] },
  { name: 'Ghost', cat: 'CMS', html: /name=["']generator["'] content=["']Ghost/i },
  { name: 'Wix', cat: 'CMS', html: /static\.wixstatic\.com|wix-code/i, header: ['x-wix-request-id', /./] },
  { name: 'Squarespace', cat: 'CMS', html: /static1\.squarespace\.com|squarespace-cdn/i },
  { name: 'Webflow', cat: 'CMS', html: /data-wf-site|assets\.website-files\.com/i },
  { name: 'Shopify', cat: 'E-commerce', html: /cdn\.shopify\.com|Shopify\.theme/i, header: ['x-shopid', /./] },
  { name: 'WooCommerce', cat: 'E-commerce', html: /woocommerce/i },
  { name: 'Magento', cat: 'E-commerce', html: /Mage\.Cookies|\/static\/frontend\/Magento|mage\/cookies/i },
  { name: 'PrestaShop', cat: 'E-commerce', html: /prestashop/i },
  { name: 'VTEX', cat: 'E-commerce', html: /vtexassets|vteximg|vtex\.com\.br/i, header: ['x-vtex-cache-status', /./] },
  { name: 'Nuvemshop', cat: 'E-commerce', html: /nuvemshop|tiendanube/i },
  { name: 'Hugo', cat: 'Gerador estático', html: /name=["']generator["'] content=["']Hugo/i },
  { name: 'Gatsby', cat: 'Gerador estático', html: /id=["']___gatsby["']/i },
  { name: 'Jekyll', cat: 'Gerador estático', html: /name=["']generator["'] content=["']Jekyll/i },
  // Frameworks de front-end
  { name: 'Next.js', cat: 'Framework', html: /__NEXT_DATA__|\/_next\/static\//i, header: ['x-powered-by', /next\.js/i] },
  { name: 'Nuxt', cat: 'Framework', html: /__NUXT__|\/_nuxt\//i },
  { name: 'React', cat: 'Framework', html: /data-reactroot|react(?:-dom)?(?:\.production)?\.min\.js/i },
  { name: 'Vue.js', cat: 'Framework', html: /vue(?:\.runtime)?(?:\.min)?\.js|data-v-[0-9a-f]{6,8}/i },
  { name: 'Angular', cat: 'Framework', html: /ng-version=|<app-root|angular(?:\.min)?\.js/i },
  { name: 'Svelte', cat: 'Framework', html: /svelte-[a-z0-9]{6}|__sveltekit/i },
  { name: 'Astro', cat: 'Framework', html: /astro-island|name=["']generator["'] content=["']Astro/i },
  { name: 'jQuery', cat: 'Biblioteca JS', html: /jquery(?:[-.][\d.]+)?(?:\.min)?\.js/i },
  { name: 'Bootstrap', cat: 'Biblioteca CSS', html: /bootstrap(?:[-.][\d.]+)?(?:\.min)?\.(?:css|js)/i },
  { name: 'Tailwind CSS', cat: 'Biblioteca CSS', html: /tailwindcss/i },
  // Servidor e linguagem
  { name: 'nginx', cat: 'Servidor web', header: ['server', /nginx/i] },
  { name: 'Apache', cat: 'Servidor web', header: ['server', /apache/i] },
  { name: 'Microsoft IIS', cat: 'Servidor web', header: ['server', /iis/i] },
  { name: 'LiteSpeed', cat: 'Servidor web', header: ['server', /litespeed/i] },
  { name: 'Caddy', cat: 'Servidor web', header: ['server', /caddy/i] },
  { name: 'PHP', cat: 'Linguagem', header: ['x-powered-by', /php/i], cookie: /PHPSESSID/ },
  { name: 'ASP.NET', cat: 'Linguagem', header: ['x-powered-by', /asp\.net/i], cookie: /ASP\.NET_SessionId/ },
  { name: 'Express', cat: 'Linguagem', header: ['x-powered-by', /express/i] },
  { name: 'Laravel', cat: 'Framework', cookie: /laravel_session/ },
  { name: 'Django', cat: 'Framework', cookie: /csrftoken|django/i },
  { name: 'Ruby on Rails', cat: 'Framework', header: ['x-powered-by', /phusion|rails/i], cookie: /_rails|_session_id/ },
  // CDN, WAF e hospedagem
  { name: 'Cloudflare', cat: 'CDN / WAF', header: ['cf-ray', /./] },
  { name: 'Amazon CloudFront', cat: 'CDN / WAF', header: ['x-amz-cf-id', /./] },
  { name: 'Fastly', cat: 'CDN / WAF', header: ['x-served-by', /cache-/i] },
  { name: 'Akamai', cat: 'CDN / WAF', header: ['server', /akamai/i] },
  { name: 'Sucuri', cat: 'CDN / WAF', header: ['x-sucuri-id', /./] },
  { name: 'Imperva', cat: 'CDN / WAF', header: ['x-iinfo', /./] },
  { name: 'Vercel', cat: 'Hospedagem', header: ['server', /vercel/i] },
  { name: 'Netlify', cat: 'Hospedagem', header: ['server', /netlify/i] },
  { name: 'GitHub Pages', cat: 'Hospedagem', header: ['server', /github\.com/i] },
  { name: 'Firebase Hosting', cat: 'Hospedagem', header: ['x-firebase-hosting-version', /./] },
  // Analytics e terceiros
  { name: 'Google Analytics', cat: 'Analytics', html: /google-analytics\.com\/(?:ga|analytics)\.js|gtag\/js\?id=(?:G|UA)-/i },
  { name: 'Google Tag Manager', cat: 'Analytics', html: /googletagmanager\.com\/gtm\.js/i },
  { name: 'Meta Pixel', cat: 'Analytics', html: /connect\.facebook\.net\/[^"']+\/fbevents\.js|fbq\(/i },
  { name: 'Hotjar', cat: 'Analytics', html: /static\.hotjar\.com/i },
  { name: 'Microsoft Clarity', cat: 'Analytics', html: /clarity\.ms\/tag/i },
  { name: 'reCAPTCHA', cat: 'Segurança', html: /google\.com\/recaptcha/i },
  { name: 'Cloudflare Turnstile', cat: 'Segurança', html: /challenges\.cloudflare\.com\/turnstile/i },
  { name: 'Stripe', cat: 'Pagamentos', html: /js\.stripe\.com/i },
  { name: 'Mercado Pago', cat: 'Pagamentos', html: /sdk\.mercadopago\.com|mercadopago\.com\.br/i },
  { name: 'Google Fonts', cat: 'Fontes', html: /fonts\.googleapis\.com/i },
  { name: 'Font Awesome', cat: 'Fontes', html: /font-?awesome/i },
];

/** Fingerprint passivo: cabeçalhos, cookies e HTML da página inicial. Exportada para teste. */
export function detectTech(headers: Record<string, string>, cookies: string[], html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const cookieNames = cookies.map((c) => c.split('=')[0]).join(' ');
  const head = html.slice(0, 400_000);
  for (const sig of SIGS) {
    const hit =
      (sig.header && sig.header[1].test(headers[sig.header[0]] ?? '')) ||
      (sig.html && sig.html.test(head)) ||
      (sig.cookie && sig.cookie.test(cookieNames));
    if (hit) (out[sig.cat] ??= []).push(sig.name);
  }
  return out;
}

const tech: DomainCheck = {
  id: 'tech',
  label: 'Tecnologias',
  description: 'CMS, frameworks, servidor, CDN/WAF, analytics e pagamentos detectados.',
  async run(t) {
    const r = await getPage(t);
    const found = detectTech(Object.fromEntries(r.headers.entries()), r.headers.getSetCookie(), r.body);
    return Object.keys(found).length ? found : skipped('Nenhuma tecnologia conhecida identificada');
  },
};

/* ───────────────────── Portas, CPEs e CVEs (Shodan InternetDB) ───────────────────── */

const exposure: DomainCheck = {
  id: 'exposure',
  label: 'Exposição (portas e CVEs)',
  description: 'Portas abertas, produtos e vulnerabilidades já indexados pelo Shodan — sem tocar no alvo.',
  async run(t) {
    const addrs = (await assertPublicHost(t.hostname)).filter((a) => isIP(a) === 4).slice(0, 3);
    if (!addrs.length) return skipped('O InternetDB só cobre endereços IPv4');
    const rows = await Promise.all(addrs.map(async (addr) => {
      const res = await fetch(`https://internetdb.shodan.io/${addr}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res || res.status === 404) return null;
      if (!res.ok) throw new CheckError(`InternetDB indisponível (HTTP ${res.status})`);
      const d = (await res.json()) as { ports: number[]; cpes: string[]; vulns: string[]; hostnames: string[]; tags: string[] };
      return {
        ip: addr,
        portas: d.ports,
        produtos: d.cpes.map((c) => c.replace(/^cpe:\/[a-z]:/, '')),
        cves: d.vulns,
        etiquetas: d.tags,
        hostnames: d.hostnames.slice(0, 20),
      };
    }));
    const data = rows.filter(Boolean);
    return data.length ? { resultados: data } : skipped('O Shodan não tem dados sobre este IP');
  },
};

/* ───────────────────────────── Histórico (Wayback Machine) ───────────────────────────── */

const waybackDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

const wayback: DomainCheck = {
  id: 'wayback',
  label: 'Histórico (Wayback Machine)',
  description: 'Primeiro e último registro do site e documentos antigos arquivados.',
  timeout: 45_000,
  async run(t) {
    if (t.isIp) return skipped('O histórico se aplica a domínios');
    const cdx = (params: Record<string, string>) =>
      getJson<string[][]>(`https://web.archive.org/cdx/search/cdx?${new URLSearchParams({ output: 'json', ...params })}`, 20_000);
    const [first, last, docs] = await Promise.all([
      cdx({ url: t.domain, fl: 'timestamp,statuscode', limit: '1' }),
      cdx({ url: t.domain, fl: 'timestamp,statuscode', limit: '-1' }),
      cdx({
        url: t.domain, matchType: 'domain', collapse: 'urlkey', fl: 'original', limit: '60',
        filter: 'original:.*\\.(pdf|docx?|xlsx?|pptx?|csv|txt|sql|bak|zip|xml|json|log|conf)$',
      }).catch(() => [] as string[][]),
    ]);
    if (first.length < 2) return skipped('O Wayback Machine não tem registros deste domínio');
    return {
      primeiroRegistro: waybackDate(first[1][0]),
      ultimoRegistro: waybackDate(last[1]?.[0] ?? first[1][0]),
      linkArquivo: `https://web.archive.org/web/*/${t.domain}`,
      documentosAntigos: docs.slice(1).map((r) => r[0]),
    };
  },
};

/* ──────────────────────────────── Subdomínios ──────────────────────────────── */

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SUB_SOURCES: { name: string; lookup: (d: string) => Promise<string[]> }[] = [
  {
    name: 'crt.sh',
    lookup: async (d) => (await getJson<any[]>(`https://crt.sh/?q=${encodeURIComponent(`%.${d}`)}&output=json`, 20_000))
      .flatMap((row) => String(row?.name_value ?? '').split('\n')),
  },
  {
    name: 'certspotter',
    lookup: async (d) => (await getJson<any[]>(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(d)}&include_subdomains=true&expand=dns_names`, 12_000))
      .flatMap((row) => row?.dns_names ?? []),
  },
  {
    name: 'hackertarget',
    lookup: async (d) => {
      const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(d)}`, { signal: AbortSignal.timeout(12_000) });
      const body = await res.text();
      if (!res.ok || /error|api count|quota/i.test(body)) throw new Error('indisponível');
      return body.split('\n').map((l) => l.split(',')[0]);
    },
  },
  {
    name: 'urlscan',
    lookup: async (d) => (await getJson<{ results: any[] }>(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`domain:${d}`)}&size=100`, 12_000))
      .results.flatMap((r) => [r?.page?.domain, r?.task?.domain]),
  },
  {
    name: 'wayback',
    lookup: async (d) => {
      const res = await fetch(`https://web.archive.org/cdx/search/cdx?${new URLSearchParams({ url: d, matchType: 'domain', fl: 'original', collapse: 'urlkey', limit: '4000' })}`,
        { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.text()).split('\n').map((u) => { try { return new URL(u).hostname; } catch { return ''; } });
    },
  },
];

/** Roda `fn` sobre a lista com no máximo `limit` simultâneos. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const subdomains: DomainCheck = {
  id: 'subdomains',
  label: 'Subdomínios',
  description: 'Descoberta passiva (5 fontes), teste de quais respondem e identificação do que há em cada um.',
  timeout: 75_000,
  async run(t) {
    if (t.isIp) return skipped('Subdomínios se aplicam a domínios');
    const d = t.domain;
    const settled = await Promise.allSettled(SUB_SOURCES.map((s) => s.lookup(d)));
    const sources: Record<string, number> = {};
    const failures: string[] = [];
    const all = new Set<string>();
    settled.forEach((r, i) => {
      if (r.status === 'rejected') { failures.push(SUB_SOURCES[i].name); return; }
      const names = r.value
        .map((n) => String(n ?? '').trim().toLowerCase().replace(/^\*\./, ''))
        .filter((n) => n !== d && n.endsWith(`.${d}`) && HOSTNAME_RE.test(n));
      sources[SUB_SOURCES[i].name] = new Set(names).size;
      names.forEach((n) => all.add(n));
    });
    if (!all.size) {
      return failures.length === SUB_SOURCES.length
        ? { error: `Fontes indisponíveis (${failures.join(', ')})` }
        : skipped('Nenhum subdomínio encontrado nas fontes públicas');
    }

    // Quais resolvem em DNS (os mais curtos primeiro: costumam ser os mais relevantes).
    const names = [...all].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const candidates = names.slice(0, 200);
    const resolved = await pool(candidates, 16, async (host) => {
      const addrs = await dnsPromises.lookup(host, { all: true }).then((r) => r.map((a) => a.address)).catch(() => [] as string[]);
      return { host, addrs };
    });
    const live = resolved.filter((r) => r.addrs.length);
    const internal = live.filter((r) => r.addrs.some(isPrivateIp));
    const publicLive = live.filter((r) => !r.addrs.some(isPrivateIp));

    // "httpx": status, título e servidor dos que respondem.
    const probed = await pool(publicLive.slice(0, 40), 8, async ({ host, addrs }) => {
      const r = await safeFetch(`https://${host}/`, { timeout: 6000, maxBytes: 120_000, maxRedirects: 3 }).catch(() => null);
      if (!r) return { host, addrs, line: null as string | null };
      const title = r.body.match(/<title[^>]*>([^<]{0,80})/i)?.[1]?.trim().replace(/\s+/g, ' ');
      const server = r.headers.get('server');
      return { host, addrs, line: [host, `HTTP ${r.status}`, title, server].filter(Boolean).join(' · ') };
    });
    const responding = probed.filter((p) => p.line).map((p) => p.line!);
    const silent = [
      ...probed.filter((p) => !p.line).map((p) => `${p.host} (${p.addrs[0]})`),
      ...publicLive.slice(40).map((p) => `${p.host} (${p.addrs[0]})`),
    ];
    const liveHosts = new Set(live.map((l) => l.host));

    return {
      total: all.size,
      fontes: sources,
      resolvem: live.length,
      respondemHttp: responding.length,
      comResposta: responding,
      resolvemSemHttp: silent,
      apontamParaIpInterno: internal.map((r) => `${r.host} → ${r.addrs.find(isPrivateIp)}`),
      naoResolvem: names.filter((n) => !liveHosts.has(n)).slice(0, 300),
      ...(all.size > candidates.length ? { aviso: `Só os ${candidates.length} primeiros foram testados (de ${all.size})` } : {}),
    };
  },
};

/* ──────────────────────────────────────────────────────────────────────────── */

export const DOMAIN_CHECKS: DomainCheck[] = [
  ip, location, exposure, dnsRecords, whois, ssl, http, httpSecurity, tech, mail, subdomains, page, dnssec, robots, securityTxt, wayback,
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
      new Promise<CheckResult>((resolve) => { timer = setTimeout(() => resolve({ error: 'Tempo esgotado' }), check.timeout ?? TIMEOUT_MS); }),
    ]);
  } catch (e) {
    if (e instanceof CheckError) return { error: e.message };
    console.warn(`[osint] verificação ${id} falhou:`, e);
    return { error: (e as Error).message || 'Falha inesperada' };
  } finally {
    clearTimeout(timer);
  }
}
