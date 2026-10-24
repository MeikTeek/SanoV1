/// <reference lib="webworker" />
/**
 * Whisper rodando no próprio navegador (transformers.js + ONNX Runtime).
 *
 * Fica num worker para a tela não travar enquanto o modelo pensa. A biblioteca
 * vem da CDN numa versão fixa — instalar pelo npm traria `onnxruntime-node` e
 * `sharp` para o servidor, que não usa nada disso. O modelo é baixado do
 * Hugging Face na primeira vez e fica no cache do navegador.
 */

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

/** "precise" = whisper-small; "fast" = whisper-base; "auto" = small se houver placa de vídeo (WebGPU). */
export type WhisperQuality = 'auto' | 'precise' | 'fast';

export type WorkerIn =
  | { id: number; audio: Float32Array; quality: WhisperQuality }
  /** Carrega o modelo antes da fala chegar (enquanto a pessoa ainda está falando). */
  | { type: 'warm'; quality: WhisperQuality };
export type WorkerOut =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: string }
  | { id: number; text: string }
  | { id: number; error: string };

type Asr = ((audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>) & { dispose?: () => Promise<void> };
type Dtype = string | Record<string, string>;
interface Setup { model: string; device: 'webgpu' | 'wasm'; dtype: Dtype }

/**
 * Medido com frases do Sano e ruído de fundo (erro por palavra / tempo por frase):
 * - base q8 na CPU: ~23% / 3 s (o antigo padrão; erra muito com ruído);
 * - small na GPU (codificador fp16, decodificador q4): ~8% / 2 s, ~410 MB;
 * - small na GPU, tudo q4 (placa sem fp16): ~10% / 2,6 s, ~300 MB;
 * - small q8 na CPU: ~8% / 9,5 s, ~250 MB.
 */
async function pickSetup(quality: WhisperQuality): Promise<Setup[]> {
  const base: Setup = { model: 'onnx-community/whisper-base', device: 'wasm', dtype: 'q8' };
  const smallCpu: Setup = { model: 'onnx-community/whisper-small', device: 'wasm', dtype: 'q8' };
  if (quality === 'fast') return [base];

  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  if (!adapter) return quality === 'precise' ? [smallCpu, base] : [base];

  const encoder = adapter.features.has('shader-f16') ? 'fp16' : 'q4';
  const smallGpu: Setup = { model: 'onnx-community/whisper-small', device: 'webgpu', dtype: { encoder_model: encoder, decoder_model_merged: 'q4' } };
  // Se a placa falhar ao montar o modelo, cai para a CPU.
  return quality === 'precise' ? [smallGpu, smallCpu] : [smallGpu, base];
}

let loading: { quality: WhisperQuality; asr: Promise<Asr> } | null = null;

async function load(quality: WhisperQuality): Promise<Asr> {
  const { pipeline, env } = await import(/* @vite-ignore */ TRANSFORMERS_URL);
  env.allowLocalModels = false;

  // Progresso somado de todos os arquivos do modelo.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0; let total = 0;
    files.forEach((f) => { loaded += f.loaded; total += f.total; });
    post({ type: 'progress', percent: Math.round((loaded / total) * 100) });
  };

  let lastError: unknown;
  for (const setup of await pickSetup(quality)) {
    try {
      files.clear();
      const asr = await pipeline('automatic-speech-recognition', setup.model, {
        device: setup.device,
        dtype: setup.dtype,
        progress_callback,
      }) as Asr;
      post({ type: 'ready', device: `${setup.model.split('/')[1]} (${setup.device})` });
      return asr;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const post = (msg: WorkerOut) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

function getAsr(quality: WhisperQuality): Promise<Asr> {
  if (loading && loading.quality !== quality) {
    // Trocou a precisão nos Ajustes: libera o modelo antigo (memória da placa).
    void loading.asr.then((a) => a.dispose?.()).catch(() => {});
    loading = null;
  }
  loading ??= { quality, asr: load(quality) };
  const mine = loading;
  // Falhou ao carregar: tenta de novo na próxima fala.
  mine.asr.catch(() => { if (loading === mine) loading = null; });
  return mine.asr;
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if ('type' in msg) { void getAsr(msg.quality).catch(() => {}); return; }
  const { id, audio, quality } = msg;
  try {
    const asr = await getAsr(quality);
    const out = await asr(audio, { language: 'portuguese', task: 'transcribe' });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    post({ id, text });
  } catch (err) {
    post({ id, error: (err as Error)?.message ?? String(err) });
  }
};
