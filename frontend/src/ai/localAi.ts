/**
 * IA local (LM Studio ou qualquer servidor compatível com a API da OpenAI).
 *
 * O Sano roda na nuvem e não alcança o `localhost` de quem usa; por isso é o
 * navegador que conversa com o LM Studio. A escolha vale só para este
 * aparelho: no celular, o LM Studio do PC não existe.
 */

export interface LocalAiPrefs {
  enabled: boolean;
  /** Endereço do servidor, já com `/v1`. */
  baseUrl: string;
  model: string;
  /** Token opcional (LM Studio → "Require API key"). */
  apiKey: string;
}

export type LocalMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const KEY = 'sano:local-ai:v1';
export const DEFAULT_LOCAL: LocalAiPrefs = { enabled: false, baseUrl: 'http://localhost:1234/v1', model: '', apiKey: '' };

export function loadLocalAi(): LocalAiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_LOCAL, ...(JSON.parse(raw) as Partial<LocalAiPrefs>) } : DEFAULT_LOCAL;
  } catch {
    return DEFAULT_LOCAL;
  }
}

export function saveLocalAi(prefs: LocalAiPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* modo privativo */ }
}

/** Usa a IA local neste aparelho? (ligada e com modelo escolhido) */
export const localAiActive = () => { const p = loadLocalAi(); return p.enabled && Boolean(p.model); };

const base = (url: string) => url.trim().replace(/\/+$/, '');
const headers = (p: LocalAiPrefs) => ({
  'Content-Type': 'application/json',
  ...(p.apiKey.trim() && { Authorization: `Bearer ${p.apiKey.trim()}` }),
});

/** Erro de rede do navegador → explicação do que costuma ser. */
function explain(err: unknown, url: string): Error {
  const msg = (err as Error)?.message ?? '';
  if (/^https:/.test(location.protocol) && /^http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/.test(url.trim())) {
    return new Error('o navegador bloqueia endereços http de outra máquina numa página https; use localhost no próprio PC');
  }
  if ((err as Error)?.name === 'TimeoutError' || /abort/i.test(msg)) return new Error('o modelo demorou demais para responder');
  return new Error('não consegui conectar — o LM Studio está aberto, com o servidor ligado e "Enable CORS" ativado?');
}

/** Modelos carregáveis no LM Studio (`GET /v1/models`). */
export async function listLocalModels(p: LocalAiPrefs): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${base(p.baseUrl)}/models`, { headers: headers(p), signal: AbortSignal.timeout(6000) });
  } catch (err) {
    throw explain(err, p.baseUrl);
  }
  if (res.status === 401) throw new Error('o LM Studio pediu um token de acesso (API key)');
  if (!res.ok) throw new Error(`o servidor respondeu ${res.status}`);
  const { data } = await res.json() as { data?: { id: string }[] };
  // Modelos de embedding não conversam: ficam de fora.
  return (data ?? []).map((m) => m.id).filter((id) => !/embed/i.test(id));
}

/** Roda as mensagens montadas pelo Sano no modelo local e devolve o texto cru. */
export async function runLocalAi(p: LocalAiPrefs, messages: LocalMessage[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base(p.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: headers(p),
      body: JSON.stringify({ model: p.model, messages, temperature: 0.4, max_tokens: 400, stream: false }),
      // Modelo local pode estar carregando na primeira chamada.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw explain(err, p.baseUrl);
  }
  const data = await res.json().catch(() => ({})) as { error?: { message?: string } | string; choices?: { message?: { content?: string | null } }[] };
  if (!res.ok || data.error) {
    const detail = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(detail ? detail.slice(0, 200) : `o servidor respondeu ${res.status}`);
  }
  // Modelos que "pensam" (DeepSeek-R1, Qwen3) devolvem <think>…</think> antes da resposta.
  return (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
