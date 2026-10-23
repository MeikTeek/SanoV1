/**
 * IA do Sano com a chave OpenRouter de cada usuário ("traga sua chave").
 *
 * Regra de ouro (a mesma de `interpret.ts`): a IA NUNCA executa nada. Ela lê a
 * frase e devolve OU um comando em português que o motor determinístico já
 * entende (e que passa pelas mesmas confirmações), OU uma resposta curta de
 * conversa. Sem chave, nada daqui roda e o Sano segue como antes.
 *
 * A chave fica criptografada no banco e nunca volta ao navegador.
 */
import { getPrismaClient } from '../../config/prisma';
import { decrypt, encrypt } from '../../utils/encryption';
import { AppError } from '../../utils/errors';
import { describeFailure, failureMessage, type AiFailureReason } from './ai.errors';

const OPENROUTER = 'https://openrouter.ai/api/v1';
export const DEFAULT_MODEL = 'openrouter/free';

/** OpenRouter usa estes cabeçalhos para identificar o app no painel do usuário. */
const APP_HEADERS = { 'HTTP-Referer': 'https://sano.app', 'X-Title': 'Sano' };

export interface AiStatus {
  configured: boolean;
  model: string;
  keyHint: string | null;
  updatedAt: string | null;
}

export interface AiQuota {
  label: string | null;
  isFreeTier: boolean;
  /** Pedidos gratuitos do dia (modelos `:free`). */
  freeDaily: { used: number; limit: number; remaining: number } | null;
}

const hint = (key: string) => `${key.slice(0, 8)}…${key.slice(-4)}`;

export async function getAiStatus(userId: string): Promise<AiStatus> {
  const row = await getPrismaClient().sanoAiConfig.findUnique({ where: { userId } });
  return {
    configured: Boolean(row),
    model: row?.model ?? DEFAULT_MODEL,
    keyHint: row?.keyHint ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

async function userKey(userId: string): Promise<{ key: string; model: string } | null> {
  const row = await getPrismaClient().sanoAiConfig.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    return { key: decrypt(row.apiKeyEnc), model: row.model };
  } catch {
    return null; // ENCRYPTION_KEY trocada: a chave antiga é ilegível
  }
}

/** Consulta a própria chave na OpenRouter. Lança AppError se for recusada. */
async function fetchQuota(key: string): Promise<AiQuota> {
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError(502, 'Não consegui falar com a OpenRouter agora. Tente de novo em instantes.');
  }
  // Só 401 é chave inválida; 403 é bloqueio de permissão/regra da conta.
  if (res.status === 401) {
    throw new AppError(400, 'A OpenRouter recusou essa chave. Confira se copiou ela inteira.');
  }
  if (!res.ok) throw new AppError(502, `A OpenRouter respondeu com erro (${res.status}).`);
  const { data } = await res.json() as {
    data?: {
      label?: string | null;
      is_free_tier?: boolean;
      free_model_daily_requests?: { used?: number; limit?: number; remaining?: number } | null;
    };
  };
  const free = data?.free_model_daily_requests;
  return {
    label: data?.label ?? null,
    isFreeTier: data?.is_free_tier ?? true,
    freeDaily: free && typeof free.limit === 'number'
      ? { used: free.used ?? 0, limit: free.limit, remaining: free.remaining ?? Math.max(0, free.limit - (free.used ?? 0)) }
      : null,
  };
}

/** Salva (ou troca) a chave e/ou o modelo. A chave nova é validada antes. */
export async function saveAiConfig(userId: string, input: { apiKey?: string; model?: string }): Promise<AiStatus & { quota?: AiQuota }> {
  const prisma = getPrismaClient();
  let quota: AiQuota | undefined;

  if (input.apiKey) {
    quota = await fetchQuota(input.apiKey);
    const data = { apiKeyEnc: encrypt(input.apiKey), keyHint: hint(input.apiKey), ...(input.model && { model: input.model }) };
    await prisma.sanoAiConfig.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  } else if (input.model) {
    const updated = await prisma.sanoAiConfig.updateMany({ where: { userId }, data: { model: input.model } });
    if (!updated.count) throw new AppError(400, 'Adicione sua chave da OpenRouter antes de escolher o modelo.');
  }
  history.delete(userId);
  return { ...(await getAiStatus(userId)), ...(quota && { quota }) };
}

export async function removeAiConfig(userId: string): Promise<void> {
  await getPrismaClient().sanoAiConfig.deleteMany({ where: { userId } });
  history.delete(userId);
}

export async function getAiQuota(userId: string): Promise<AiQuota | null> {
  const cfg = await userKey(userId);
  return cfg ? fetchQuota(cfg.key) : null;
}

/* ───────── Modelos gratuitos ───────── */

export interface FreeModel { id: string; name: string; context: number }

let modelsCache: { at: number; list: FreeModel[] } | null = null;

/** Modelos de custo zero da OpenRouter, com o roteador gratuito sempre primeiro. */
export async function listFreeModels(): Promise<FreeModel[]> {
  if (modelsCache && Date.now() - modelsCache.at < 60 * 60_000) return modelsCache.list;
  const router: FreeModel = { id: DEFAULT_MODEL, name: 'Automático (escolhe um modelo gratuito)', context: 0 };
  try {
    const res = await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [router];
    const { data } = await res.json() as {
      data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[];
    };
    const free = (data ?? [])
      .filter((m) => m.id !== DEFAULT_MODEL && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .map((m) => ({ id: m.id, name: m.name ?? m.id, context: m.context_length ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    modelsCache = { at: Date.now(), list: [router, ...free] };
    return modelsCache.list;
  } catch {
    return [router];
  }
}

/* ───────── Conversa ───────── */

/**
 * Últimas falas com a IA, só na memória do processo (nada de texto livre no
 * banco — mesma regra de privacidade da memória do Sano). Some em 30 min.
 */
const history = new Map<string, { at: number; turns: { role: 'user' | 'assistant'; content: string }[] }>();
const HISTORY_TTL = 30 * 60_000;
const MAX_TURNS = 8;

function recentTurns(userId: string) {
  const entry = history.get(userId);
  if (!entry || Date.now() - entry.at > HISTORY_TTL) return [];
  return entry.turns;
}

function remember(userId: string, user: string, assistant: string) {
  const turns = [...recentTurns(userId), { role: 'user' as const, content: user }, { role: 'assistant' as const, content: assistant }];
  history.set(userId, { at: Date.now(), turns: turns.slice(-MAX_TURNS) });
}

export interface AiCommand { name: string; description: string; examples: string[] }

export type AiOutcome =
  | { ok: true; command: string }
  | { ok: true; reply: string }
  | { ok: false; reason: AiFailureReason; detail?: string };

function systemPrompt(name: string, now: Date, catalog: AiCommand[]): string {
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(now);
  return `Você é o Sano, o assistente pessoal de ${name}, no estilo do JARVIS: educado, confiante, com um toque de humor seco.
Agora é ${when} (horário de Brasília).

O Sano já sabe executar os comandos abaixo. Quando o pedido for um deles, NÃO responda você mesmo: reescreva o pedido como uma frase curta e completa, parecida com os exemplos, incluindo datas, horários e valores que a pessoa disse.
${catalog.map((c) => `- ${c.name}: ${c.description}. Ex.: ${c.examples.slice(0, 3).map((e) => `"${e}"`).join(', ')}`).join('\n')}

Responda SEMPRE com um JSON de uma linha, sem nada antes ou depois:
{"command": "<frase para o Sano executar>"}  quando for um comando da lista;
{"reply": "<sua resposta>"}  para conversa, dúvidas e conhecimento geral.

Regras da resposta ("reply"):
- Português do Brasil, no máximo 3 frases curtas. Ela pode ser lida em voz alta: sem markdown, listas, emojis ou links.
- Nunca diga que fez algo (marcar, apagar, pagar, enviar) — só o Sano faz, via "command".
- Você não vê a agenda, o treino nem as finanças; para isso use um "command".
- Sem diagnóstico médico nem conselho financeiro personalizado.`;
}

/** Extrai o JSON mesmo quando o modelo põe texto ou ``` em volta. */
export function parseAiAnswer(raw: string): { command: string } | { reply: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const data = JSON.parse(match[0]) as { command?: unknown; reply?: unknown };
      if (typeof data.command === 'string' && data.command.trim()) return { command: data.command.trim().slice(0, 300) };
      if (typeof data.reply === 'string' && data.reply.trim()) return { reply: data.reply.trim().slice(0, 1200) };
    } catch { /* cai no texto puro */ }
  }
  // Modelo ignorou o formato: o texto vira a resposta, sem markdown.
  return { reply: text.replace(/[*_#`>]/g, '').slice(0, 1200) };
}

/** Pergunta à IA do usuário. Nunca lança: falhas viram `ok: false`. */
export async function askSanoAi(
  userId: string,
  input: { text: string; displayName: string; now: Date; catalog: AiCommand[] },
): Promise<AiOutcome | null> {
  const cfg = await userKey(userId);
  if (!cfg) return null;

  try {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, ...APP_HEADERS },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt(input.displayName, input.now, input.catalog) },
          ...recentTurns(userId),
          { role: 'user', content: input.text },
        ],
      }),
      // Modelos gratuitos às vezes demoram; mais que isso a conversa perde o ritmo.
      signal: AbortSignal.timeout(25_000),
    });
    const body = await res.text().catch(() => '');
    const data = (() => { try { return JSON.parse(body) as { error?: unknown; choices?: { message?: { content?: string | null } }[] }; } catch { return {}; } })();
    if (!res.ok || data.error) {
      console.error(`[sano-ia] ${res.status} (${cfg.model}): ${body.slice(0, 300)}`);
      return { ok: false, ...describeFailure(res.status, body) };
    }
    const parsed = parseAiAnswer(data.choices?.[0]?.message?.content ?? '');
    if (!parsed) return { ok: false, reason: 'unavailable' };
    remember(userId, input.text, 'command' in parsed ? JSON.stringify(parsed) : parsed.reply);
    return { ok: true, ...parsed };
  } catch (err) {
    console.error('[sano-ia] falha:', (err as Error).message);
    return { ok: false, reason: 'unavailable' };
  }
}

/* ───────── Ouvidos de reserva (transcrição) ───────── */

let audioModelsCache: { at: number; list: string[] } | null = null;

/** Modelos gratuitos que aceitam áudio; a lista da OpenRouter muda com o tempo. */
async function freeAudioModels(): Promise<string[]> {
  if (audioModelsCache && Date.now() - audioModelsCache.at < 60 * 60_000) return audioModelsCache.list;
  try {
    const res = await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(8000) });
    const { data } = await res.json() as {
      data?: { id: string; architecture?: { input_modalities?: string[] }; pricing?: { prompt?: string; completion?: string } }[];
    };
    const list = (data ?? [])
      .filter((m) => m.architecture?.input_modalities?.includes('audio')
        && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .map((m) => m.id);
    audioModelsCache = { at: Date.now(), list };
  } catch {
    audioModelsCache = { at: Date.now() - 50 * 60_000, list: audioModelsCache?.list ?? [] };
  }
  return audioModelsCache.list;
}

/**
 * Transcreve uma fala curta (WAV em base64) com a chave do usuário.
 * Usada quando o reconhecimento do navegador não existe ou não alcança o
 * serviço dele (Brave, Opera, app Android).
 */
export async function transcribeSpeech(userId: string, wavBase64: string): Promise<string> {
  const cfg = await userKey(userId);
  if (!cfg) {
    throw new AppError(400, 'Este navegador não reconhece fala sozinho. Ligue a IA em Ajustes → Inteligência artificial para usar o microfone aqui.');
  }
  const models = (await freeAudioModels()).slice(0, 3);
  if (!models.length) throw new AppError(503, 'Nenhum modelo gratuito de áudio está disponível agora na OpenRouter.');

  let lastFailure: { reason: AiFailureReason; detail?: string } | null = null;
  for (const model of models) {
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, ...APP_HEADERS },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva exatamente o que é dito neste áudio, em português do Brasil. Responda apenas com a transcrição, sem aspas nem comentários. Se não houver fala, responda vazio.' },
              { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text().catch(() => '');
      const data = (() => { try { return JSON.parse(body) as { error?: unknown; choices?: { message?: { content?: string | null } }[] }; } catch { return {}; } })();
      if (!res.ok || data.error) {
        console.error(`[sano-stt] ${model} ${res.status}: ${body.slice(0, 300)}`);
        const failure = describeFailure(res.status, body);
        // Chave e cota valem para todos os modelos; bloqueio de um modelo não — tenta o próximo.
        if (failure.reason === 'invalid' || failure.reason === 'quota') throw new AppError(400, failureMessage(failure));
        lastFailure = failure;
        continue;
      }
      return (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["“]|["”]$/g, '').slice(0, 500);
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error(`[sano-stt] ${model}:`, (err as Error).message);
    }
  }
  throw new AppError(503, lastFailure ? failureMessage(lastFailure) : 'Não consegui transcrever agora. Tente de novo.');
}

/** Botão "Testar IA" dos Ajustes: um pedido mínimo e a resposta real da OpenRouter. */
export async function testAi(userId: string): Promise<{ ok: boolean; message: string; model: string }> {
  const cfg = await userKey(userId);
  if (!cfg) throw new AppError(400, 'Adicione sua chave da OpenRouter primeiro.');
  try {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, ...APP_HEADERS },
      body: JSON.stringify({ model: cfg.model, max_tokens: 20, messages: [{ role: 'user', content: 'Responda apenas: ok' }] }),
      signal: AbortSignal.timeout(25_000),
    });
    const body = await res.text().catch(() => '');
    const data = (() => { try { return JSON.parse(body) as { error?: unknown; model?: string }; } catch { return {}; } })();
    if (!res.ok || data.error) return { ok: false, message: failureMessage(describeFailure(res.status, body)), model: cfg.model };
    return { ok: true, message: 'Tudo certo: a IA respondeu.', model: data.model ?? cfg.model };
  } catch {
    return { ok: false, message: 'A OpenRouter não respondeu a tempo. Tente de novo.', model: cfg.model };
  }
}
