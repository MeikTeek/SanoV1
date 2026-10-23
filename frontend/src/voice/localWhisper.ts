/**
 * Transcrição de fala no próprio computador (Whisper num worker).
 * Usada pelo microfone quando o navegador não reconhece fala sozinho.
 */
import type { WorkerIn, WorkerOut } from './whisper.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
let onProgress: ((percent: number) => void) | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if ('type' in msg) {
      if (msg.type === 'progress') onProgress?.(msg.percent);
      return;
    }
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if ('error' in msg) job.reject(new Error(msg.error));
    else job.resolve(msg.text);
  };
  worker.onerror = () => {
    pending.forEach((job) => job.reject(new Error('o Whisper não conseguiu iniciar neste navegador')));
    pending.clear();
    worker = null;
  };
  return worker;
}

/**
 * O Whisper "inventa" estas frases quando o áudio é só silêncio ou ruído
 * (vêm das legendas com que ele foi treinado).
 */
const HALLUCINATIONS = /^(legendas? (pela|por)|obrigad[oa] por assistir|inscreva-se|tchau[.!]?$|\[(m[uú]sica|sil[eê]ncio)\]|\.+$)/i;

/** Transcreve 16 kHz mono. `progress` recebe o download do modelo (só na 1ª vez). */
export async function transcribeLocally(audio: Float32Array, progress?: (percent: number) => void): Promise<string> {
  onProgress = progress ?? null;
  const id = nextId++;
  const text = await new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, audio } satisfies WorkerIn, [audio.buffer]);
  });
  return HALLUCINATIONS.test(text.trim()) ? '' : text.trim();
}
