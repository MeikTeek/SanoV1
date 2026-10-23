import { useState, type ReactNode } from 'react';

const LABELS: Record<string, string> = {
  ip: 'IP', asn: 'ASN', cidr: 'CIDR',
  enderecos: 'Endereços', reverso: 'Reverso (PTR)', ptr: 'PTR', codigoPais: 'Código do país', fusoHorario: 'Fuso horário',
  regiao: 'Região', pais: 'País', diasRestantes: 'Dias restantes', validoDe: 'Válido de', validoAte: 'Válido até',
  urlFinal: 'URL final', tempoMs: 'Tempo (ms)', ogTitulo: 'og:title', ogDescricao: 'og:description', ogImagem: 'og:image',
  ogSite: 'og:site_name', twitterSite: 'twitter:site', twitterCriador: 'twitter:creator', perfisSociais: 'Perfis sociais',
  palavrasChave: 'Palavras-chave', registrarIanaId: 'IANA ID', politicaDmarc: 'Política DMARC', assinadoPgp: 'Assinado (PGP)',
  encontradoEm: 'Encontrado em', subdominios: 'Subdomínios', cabecalhos: 'Cabeçalhos', redirecionamentos: 'Redirecionamentos',
  chaveBits: 'Chave (bits)', corTema: 'Cor do tema', descricao: 'Descrição', titulo: 'Título', canonica: 'URL canônica',
  sha256: 'SHA-256', responsavel: 'Responsável', comResposta: 'Respondem HTTP', resolvemSemHttp: 'Resolvem, sem HTTP',
  respondemHttp: 'Respondem HTTP (qtd)', apontamParaIpInterno: 'Apontam para IP interno', naoResolvem: 'Não resolvem',
  fontes: 'Fontes', cves: 'CVEs', documentosAntigos: 'Documentos antigos', primeiroRegistro: 'Primeiro registro',
  ultimoRegistro: 'Último registro', linkArquivo: 'Ver no arquivo', recebeEmail: 'Recebe e-mail', localizacao: 'Localização',
  orientacao: 'Orientação', bases: 'Bases', contas: 'Contas', usuario: 'Usuário', empresa: 'Empresa', cargo: 'Cargo',
};

const label = (key: string) =>
  LABELS[key] ?? (/^[A-Z0-9-]+$/.test(key) ? key : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  if (typeof value === 'boolean') return <span className={value ? 'osint-yes' : 'osint-no'}>{value ? 'sim' : 'não'}</span>;
  const text = String(value);
  if (/^https?:\/\/\S+$/.test(text)) return <a href={text} target="_blank" rel="noreferrer noopener">{text}</a>;
  // "Rótulo: https://…" (contas, links) vira link no trecho da URL.
  const embedded = text.match(/^(.*?:\s)(https?:\/\/\S+)$/);
  if (embedded) return <span>{embedded[1]}<a href={embedded[2]} target="_blank" rel="noreferrer noopener">{embedded[2]}</a></span>;
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

/** Renderiza qualquer JSON de resultado como lista de campos, sem tela específica por verificação. */
export default function ValueView({ value, nested }: { value: unknown; nested?: boolean }): ReactNode {
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
