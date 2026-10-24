/**
 * Gravador de fala em WAV (16 kHz, mono) — os ouvidos de reserva do Sano.
 *
 * WAV porque é o formato que todo modelo de áudio aceita; o `MediaRecorder`
 * só entrega WebM/MP4, que a OpenRouter não garante. Para sozinho depois de
 * ~1,6 s de silêncio (pausas no meio da frase não cortam) ou no limite de tempo.
 *
 * O limiar de fala se ajusta ao ruído da sala: mede o fundo nos primeiros
 * instantes e considera fala o que passa bem acima dele. O silêncio das pontas
 * é cortado e o volume, nivelado — o Whisper erra menos e não "inventa" frases.
 */

const TARGET_RATE = 16_000;
const MAX_MS = 20_000;
const SILENCE_MS = 1600;
/** Sem ninguém falar, desiste depois disso. */
const NO_SPEECH_MS = 7000;
/** Limiar mínimo de volume (RMS) e quantas vezes acima do ruído de fundo a fala precisa estar. */
const MIN_SPEECH_RMS = 0.004;
const NOISE_FACTOR = 2;
/** Depois que a fala começou, basta isso acima do ruído para ela continuar (sílabas fracas não cortam). */
const KEEP_FACTOR = 1.4;
/** Primeiros instantes usados para medir o ruído da sala (ninguém fala tão rápido após o toque). */
const CALIBRATE_MS = 250;
const CALIBRATE_BLOCKS = 4;
/** Teto do ruído medido, caso a pessoa já comece falando durante a medição. */
const MAX_NOISE_RMS = 0.02;
/** Blocos seguidos acima do limiar para contar como fala (um estalo não conta). */
const SPEECH_BLOCKS = 2;
/** Folga de áudio mantida antes e depois da fala, em ms. */
const PAD_MS = 300;

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
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    handlers.onError('Permita o uso do microfone para falar com o Sano.');
    return null;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor é antigo, mas funciona em todo navegador e WebView sem arquivo extra.
  const node = ctx.createScriptProcessor(2048, 1, 1);
  const blockMs = (2048 / ctx.sampleRate) * 1000;
  const chunks: Float32Array[] = [];
  const startedAt = Date.now();
  /** Ruído de fundo (RMS) da sala; -1 enquanto mede. */
  let noise = -1;
  const calibration: number[] = [];
  let loudRun = 0;
  let firstSpeech = -1;
  let lastSpeech = -1;
  let lastSpeechAt = Date.now();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    void ctx.close();
    if (firstSpeech < 0) { handlers.onDone(null); return; }
    const pad = Math.ceil(PAD_MS / blockMs);
    const speech = chunks.slice(Math.max(0, firstSpeech - pad), lastSpeech + pad + 1);
    handlers.onDone(normalize(toPcm16k(speech, rate)));
  };

  node.onaudioprocess = (e) => {
    if (finished) return;
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = Date.now();

    if (noise < 0 && (now - startedAt < CALIBRATE_MS || calibration.length < CALIBRATE_BLOCKS)) {
      // O microfone costuma entregar zeros enquanto liga: não contam como sala.
      if (rms > 1e-5) calibration.push(rms);
      if (now - startedAt < NO_SPEECH_MS) return;
    }
    if (noise < 0) {
      // Mediana da medição inicial: um estalo ou o começo da fala não a distorcem.
      const sorted = calibration.sort((a, b) => a - b);
      noise = Math.min(MAX_NOISE_RMS, sorted[Math.floor(sorted.length / 2)] ?? 0);
    }
    const threshold = Math.max(MIN_SPEECH_RMS, noise * NOISE_FACTOR);
    const keep = Math.max(MIN_SPEECH_RMS, noise * KEEP_FACTOR);
    if (rms > threshold) {
      loudRun++;
      if (loudRun >= SPEECH_BLOCKS) {
        if (firstSpeech < 0) firstSpeech = chunks.length - SPEECH_BLOCKS;
        lastSpeech = chunks.length - 1;
        lastSpeechAt = now;
      }
    } else {
      loudRun = 0;
      if (firstSpeech >= 0 && rms > keep) {
        lastSpeech = chunks.length - 1;
        lastSpeechAt = now;
      }
    }
    // O fundo cai rápido quando a sala silencia e acompanha as pausas; durante
    // a fala quase não se mexe (senão a própria voz vira "ruído" e corta a frase).
    const rise = rms > keep ? 0.002 : 0.05;
    noise = rms < noise ? noise * 0.7 + rms * 0.3 : noise * (1 - rise) + rms * rise;

    const heard = firstSpeech >= 0;
    const silentTooLong = now - lastSpeechAt > (heard ? SILENCE_MS : NO_SPEECH_MS);
    if (silentTooLong || now - startedAt > MAX_MS) finish();
  };
  source.connect(node);
  node.connect(ctx.destination);

  return { stop: finish };
}

/** Nivela o volume: pico em ~90% (sem amplificar mais de 8×, para não estourar o chiado). */
export function normalize(pcm: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak === 0) return pcm;
  const gain = Math.min(8, 0.9 / peak);
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  return pcm;
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
