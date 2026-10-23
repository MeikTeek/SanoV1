import type { OsintCheckResult, UsernameHit } from '../../types/osint';

/* ── Histórico local (só neste navegador) ── */

const KEY = (kind: string) => `sano.osint.history.${kind}`;

export function loadHistory(kind: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(kind)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushHistory(kind: string, value: string): string[] {
  const next = [value, ...loadHistory(kind).filter((v) => v !== value)].slice(0, 8);
  try { localStorage.setItem(KEY(kind), JSON.stringify(next)); } catch { /* armazenamento indisponível */ }
  return next;
}

export function clearHistory(kind: string) {
  try { localStorage.removeItem(KEY(kind)); } catch { /* ignora */ }
}

/* ── Exportação ── */

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function hitsToCsv(hits: UsernameHit[]) {
  const header = ['username', 'site', 'categoria', 'url', 'status', 'confianca', 'fonte', 'titulo', 'descricao'];
  const rows = hits.map((h) => [h.username, h.site, h.category, h.url, h.status, h.confidence, h.source, h.profile?.title, h.profile?.description]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

/* ── Buscas prontas em mecanismos (dorks) ── */

export interface Dork { label: string; url: string }

const q = (engine: 'google' | 'bing' | 'ddg', query: string) =>
  ({
    google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    ddg: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  })[engine];

export function domainDorks(domain: string): Dork[] {
  const items: [string, string][] = [
    ['Subdomínios indexados', `site:*.${domain} -site:www.${domain}`],
    ['Documentos (PDF/Office)', `site:${domain} (filetype:pdf OR filetype:doc OR filetype:docx OR filetype:xls OR filetype:xlsx OR filetype:ppt)`],
    ['Listagens de diretório', `site:${domain} intitle:"index of"`],
    ['Páginas de login', `site:${domain} (inurl:login OR inurl:signin OR inurl:admin)`],
    ['E-mails do domínio', `"@${domain}"`],
    ['Menções fora do site', `"${domain}" -site:${domain}`],
    ['No GitHub', `site:github.com "${domain}"`],
    ['No LinkedIn', `site:linkedin.com "${domain}"`],
    ['No Pastebin', `site:pastebin.com "${domain}"`],
  ];
  return items.map(([label, query]) => ({ label, url: q('google', query) }));
}

export function usernameDorks(username: string): Dork[] {
  const items: [string, string][] = [
    ['Nome exato', `"${username}"`],
    ['Com "@"', `"@${username}"`],
    ['Redes sociais', `"${username}" (site:instagram.com OR site:x.com OR site:facebook.com OR site:tiktok.com OR site:linkedin.com)`],
    ['Código e fóruns', `"${username}" (site:github.com OR site:gitlab.com OR site:reddit.com OR site:stackoverflow.com)`],
  ];
  return [
    ...items.map(([label, query]) => ({ label: `Google · ${label}`, url: q('google', query) })),
    { label: 'Bing · Nome exato', url: q('bing', `"${username}"`) },
    { label: 'DuckDuckGo · Nome exato', url: q('ddg', `"${username}"`) },
  ];
}

/* ── Resumo e alertas da varredura de domínio ── */

export type AlertLevel = 'bad' | 'warn' | 'info' | 'ok';
export interface Insights {
  facts: { label: string; value: string }[];
  alerts: { level: AlertLevel; text: string }[];
  tech: string[];
}

const SENSITIVE_PORTS: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 445: 'SMB', 1433: 'SQL Server', 3306: 'MySQL', 3389: 'RDP',
  5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 9200: 'Elasticsearch', 27017: 'MongoDB',
};

const ok = (r?: OsintCheckResult) => (r && !r.error && !r.skipped ? r : undefined);
const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function buildInsights(results: Record<string, OsintCheckResult | undefined>, complete = true): Insights {
  const facts: Insights['facts'] = [];
  const alerts: Insights['alerts'] = [];
  const add = (label: string, value?: string) => { if (value) facts.push({ label, value }); };

  const ip = ok(results.ip);
  add('IP', arr<string>(ip?.enderecos).slice(0, 2).join(', '));
  const loc = ok(results.location);
  add('Servidor em', [str(loc?.cidade), str(loc?.pais)].filter(Boolean).join(', '));
  add('Provedor', str(loc?.provedor));
  const whois = ok(results.whois);
  add('Registrar', str(whois?.registrar) ?? str(whois?.rede));
  if (whois?.criado) add('Domínio criado', new Date(String(whois.criado)).toLocaleDateString('pt-BR'));
  const ssl = ok(results.ssl);
  add('Certificado', ssl ? `${str(ssl.emissor) ?? 'emissor desconhecido'}${ssl.diasRestantes !== undefined ? ` · ${ssl.diasRestantes} dias` : ''}` : undefined);
  const http = ok(results.http);
  add('HTTP', http ? `${http.status}${http.servidor ? ` · ${http.servidor}` : ''}` : undefined);
  const mail = ok(results.mail);
  add('E-mail', arr<string>(mail?.provedores).join(', ') || undefined);

  // Alertas
  if (whois?.expira) {
    const days = Math.floor((new Date(String(whois.expira)).getTime() - Date.now()) / 86_400_000);
    if (days < 0) alerts.push({ level: 'bad', text: `O registro do domínio expirou há ${-days} dias.` });
    else if (days < 60) alerts.push({ level: 'warn', text: `O domínio expira em ${days} dias.` });
  }
  if (results.ssl?.error) alerts.push({ level: 'warn', text: `TLS: ${results.ssl.error}` });
  if (ssl) {
    if (ssl.valido === false) alerts.push({ level: 'bad', text: `Certificado inválido${ssl.erro ? ` (${ssl.erro})` : ''}.` });
    else if (typeof ssl.diasRestantes === 'number' && ssl.diasRestantes < 15) alerts.push({ level: 'warn', text: `Certificado expira em ${ssl.diasRestantes} dias.` });
    if (ssl.protocolo && /TLSv1(\.0|\.1)?$/.test(String(ssl.protocolo))) alerts.push({ level: 'warn', text: `Protocolo TLS antigo (${ssl.protocolo}).` });
  }
  const sec = ok(results['http-security']);
  if (sec) {
    const headers = (sec.cabecalhos ?? {}) as Record<string, boolean>;
    if (!headers.HSTS) alerts.push({ level: 'warn', text: 'Sem HSTS (Strict-Transport-Security).' });
    if (!headers.CSP) alerts.push({ level: 'info', text: 'Sem Content-Security-Policy.' });
    if (!headers['X-Frame-Options'] && !headers.CSP) alerts.push({ level: 'info', text: 'Sem proteção contra clickjacking (X-Frame-Options/CSP).' });
    const bad = arr<string>(sec.cookies).filter((c) => /sem Secure\/HttpOnly/.test(c));
    if (bad.length) alerts.push({ level: 'info', text: `${bad.length} cookie(s) sem Secure/HttpOnly.` });
  }
  if (mail) {
    if (mail.SPF === 'ausente') alerts.push({ level: 'warn', text: 'Sem SPF — o domínio pode ser falsificado em e-mails.' });
    if (mail.DMARC === 'ausente') alerts.push({ level: 'warn', text: 'Sem DMARC — nada impede e-mails falsos em nome do domínio.' });
    else if (mail.politicaDmarc === 'none') alerts.push({ level: 'info', text: 'DMARC em modo monitoramento (p=none), sem bloqueio.' });
  }
  const dnssec = ok(results.dnssec);
  if (dnssec && dnssec.assinado === false) alerts.push({ level: 'info', text: 'DNSSEC desativado.' });
  const exposure = ok(results.exposure);
  for (const row of arr<{ ip: string; portas: number[]; cves: string[] }>(exposure?.resultados)) {
    if (row.cves?.length) alerts.push({ level: 'bad', text: `${row.ip}: ${row.cves.length} CVE(s) associadas pelo Shodan (${row.cves.slice(0, 4).join(', ')}${row.cves.length > 4 ? '…' : ''}).` });
    const risky = (row.portas ?? []).filter((p) => SENSITIVE_PORTS[p]);
    if (risky.length) alerts.push({ level: 'warn', text: `${row.ip}: portas sensíveis abertas — ${risky.map((p) => `${p} (${SENSITIVE_PORTS[p]})`).join(', ')}.` });
  }
  const subs = ok(results.subdomains);
  if (subs) {
    add('Subdomínios', `${subs.total} (${subs.resolvem} resolvem)`);
    const internal = arr<string>(subs.apontamParaIpInterno);
    if (internal.length) alerts.push({ level: 'warn', text: `${internal.length} subdomínio(s) apontam para IP interno: ${internal.slice(0, 3).join('; ')}.` });
  }
  if (results['security-txt']?.skipped) alerts.push({ level: 'info', text: 'Sem security.txt para reporte de vulnerabilidades.' });
  const page = ok(results.page);
  if (page && arr(page.emails).length) alerts.push({ level: 'info', text: `${arr(page.emails).length} e-mail(s) expostos na página inicial.` });

  const techData = ok(results.tech) ?? {};
  const tech = Object.values(techData).flatMap((v) => arr<string>(v));
  if (complete && !alerts.length && Object.keys(results).length >= 8) alerts.push({ level: 'ok', text: 'Nenhum ponto de atenção nas verificações automáticas.' });
  return { facts, alerts, tech };
}
