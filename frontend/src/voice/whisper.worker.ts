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
const MODEL = 'onnx-community/whisper-base';

export type WorkerIn = { id: number; audio: Float32Array };
export type WorkerOut =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: string }
  | { id: number; text: string }
  | { id: number; error: string };

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

let loading: Promise<Asr> | null = null;

async function load(): Promise<Asr> {
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

  // CPU + modelo quantizado (~77 MB): ~3 s por frase e funciona em qualquer
  // aparelho. Na placa de vídeo o quantizado ficou mais lento (4 s) e o cheio
  // passa de 290 MB de download.
  const device = 'wasm';
  const asr = await pipeline('automatic-speech-recognition', MODEL, {
    device,
    dtype: 'q8',
    progress_callback,
  }) as Asr;
  post({ type: 'ready', device });
  return asr;
}

const post = (msg: WorkerOut) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { id, audio } = e.data;
  try {
    loading ??= load();
    const asr = await loading;
    const out = await asr(audio, { language: 'portuguese', task: 'transcribe' });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    post({ id, text });
  } catch (err) {
    loading = null; // falhou ao carregar: tenta de novo na próxima fala
    post({ id, error: (err as Error)?.message ?? String(err) });
  }
};
