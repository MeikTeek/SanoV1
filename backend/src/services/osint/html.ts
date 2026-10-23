/** Leitura de meta tags sem parser HTML: suficiente para cabeçalhos de página e perfis. */

const NAMED: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', middot: '·', bull: '•',
};

/** Decodifica entidades nomeadas e numéricas (&#39; &#x27; &#32;). */
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .trim();

export function readMeta(html: string) {
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

/** Telas de desafio anti-bot: o título é do desafio, não do perfil. */
const CHALLENGE_RE = /just a moment|attention required|access denied|verifying you are human|checking your browser|one more step|are you a robot|enable javascript/i;

/** Título/bio/foto de um perfil público, para o cartão do resultado. */
export function profileSummary(html: string, baseUrl: string) {
  const m = readMeta(html);
  if (CHALLENGE_RE.test(m.titulo) || CHALLENGE_RE.test(m.ogTitulo ?? '')) return undefined;
  const absolute = (u?: string) => {
    if (!u) return undefined;
    try { return new URL(u, baseUrl).href; } catch { return undefined; }
  };
  const clip = (s?: string, n = 200) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const out = {
    title: clip(m.ogTitulo || m.titulo, 120),
    description: clip(m.ogDescricao || m.descricao),
    image: absolute(m.ogImagem),
  };
  return out.title || out.description || out.image ? out : undefined;
}
