/**
 * Gravador de fala em WAV (16 kHz, mono) — os ouvidos de reserva do Sano.
 *
 * WAV porque é o formato que todo modelo de áudio aceita; o `MediaRecorder`
 * só entrega WebM/MP4, que a OpenRouter não garante. Para sozinho depois de
 * ~1,3 s de silêncio (como o reconhecimento do navegador) ou no limite de tempo.
 */

const TARGET_RATE = 16_000;
const MAX_MS = 20_000;
const SILENCE_MS = 1300;
/** Volume (RMS) acima do qual consideramos que há fala. */
const SPEECH_RMS = 0.02;

export const canRecord = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioContext !== 'undefined';

export interface WavRecording {
  /** Para agora e devolve o WAV em base64 (null se ninguém falou). */
  stop(): void;
}

export async function recordWav(handlers: {
  /** `pcm`: fala em 16 kHz mono (null se ninguém falou). */
  onDone: (pcm: Float32Array | null) => void;
  onError: (message: string) => void;
}): Promise<WavRecording | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    handlers.onError('Permita o uso do microfone para falar com o Sano.');
    return null;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor é antigo, mas funciona em todo navegador e WebView sem arquivo extra.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const startedAt = Date.now();
  let heardSpeech = false;
  let lastSpeechAt = Date.now();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    handlers.onDone(heardSpeech ? toPcm16k(chunks, ctx.sampleRate) : null);
  };

  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const now = Date.now();
    if (Math.sqrt(sum / input.length) > SPEECH_RMS) { heardSpeech = true; lastSpeechAt = now; }
    const silentTooLong = now - lastSpeechAt > (heardSpeech ? SILENCE_MS : 6000);
    if (silentTooLong || now - startedAt > MAX_MS) finish();
  };
  source.connect(node);
  node.connect(ctx.destination);

  return { stop: finish };
}

/** Junta os pedaços e reduz para 16 kHz (média da janela: sem serrilhar demais). */
export function toPcm16k(chunks: Float32Array[], rate: number): Float32Array {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }

  const ratio = rate / TARGET_RATE;
  const out = new Float32Array(Math.floor(merged.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let acc = 0;
    for (let j = from; j < to; j++) acc += merged[j];
    out[i] = Math.max(-1, Math.min(1, acc / Math.max(1, to - from)));
  }
  return out;
}

/** Fala em 16 kHz → WAV PCM 16 bits em base64 (para a transcrição pela OpenRouter). */
export function pcmToWavBase64(pcm: Float32Array): string {
  const samples = pcm.length;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true); view.setUint32(28, TARGET_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const v = pcm[i];
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Atalho usado pelos testes e pela transcrição no servidor. */
export const toWavBase64 = (chunks: Float32Array[], rate: number) => pcmToWavBase64(toPcm16k(chunks, rate));
