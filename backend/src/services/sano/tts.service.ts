/**
 * Voz neural do Sano via Microsoft Edge "Ler em voz alta" (msedge-tts).
 *
 * É o mesmo serviço que o Edge usa para ler páginas: gratuito e sem chave,
 * mas não oficial — a Microsoft pode mudar a autenticação a qualquer momento
 * (já mudou em out/2026, por isso a versão fixa da biblioteca). Por isso o
 * frontend sempre tem a voz do navegador como reserva.
 */
import { createHash } from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { AppError } from '../../utils/errors';

export interface NeuralVoice { id: string; name: string; gender: 'Male' | 'Female' }

/** Usadas se a lista online não responder. Antônio é o padrão: o "Jarvis" do Sano. */
const FALLBACK_VOICES: NeuralVoice[] = [
  { id: 'pt-BR-AntonioNeural', name: 'Antônio', gender: 'Male' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca', gender: 'Female' },
  { id: 'pt-BR-ThalitaMultilingualNeural', name: 'Thalita', gender: 'Female' },
];
export const DEFAULT_VOICE = FALLBACK_VOICES[0].id;

let voicesCache: { at: number; list: NeuralVoice[] } | null = null;

/** Vozes em português do Brasil disponíveis agora. */
export async function listNeuralVoices(): Promise<NeuralVoice[]> {
  if (voicesCache && Date.now() - voicesCache.at < 6 * 60 * 60_000) return voicesCache.list;
  try {
    const all = await new MsEdgeTTS().getVoices();
    const list = all
      .filter((v) => v.Locale === 'pt-BR')
      .map((v) => ({
        id: v.ShortName,
        // "pt-BR-AntonioNeural" → "Antonio"; os acentos das conhecidas ficam bonitos.
        name: FALLBACK_VOICES.find((f) => f.id === v.ShortName)?.name
          ?? v.ShortName.replace(/^pt-BR-/, '').replace(/(Multilingual)?Neural$/, ''),
        gender: v.Gender === 'Female' ? 'Female' as const : 'Male' as const,
      }))
      .sort((a, b) => Number(b.id === DEFAULT_VOICE) - Number(a.id === DEFAULT_VOICE));
    voicesCache = { at: Date.now(), list: list.length ? list : FALLBACK_VOICES };
  } catch {
    voicesCache = { at: Date.now() - 5 * 60 * 60_000, list: FALLBACK_VOICES }; // tenta de novo em 1 h
  }
  return voicesCache.list;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 1.05 → "+5%": o formato relativo que o SSML aceita. */
const percent = (factor: number) => {
  const p = Math.round((factor - 1) * 100);
  return `${p >= 0 ? '+' : ''}${p}%`;
};

/** Frases repetidas ("Música pausada.", saudações) saem do cache na hora. */
const cache = new Map<string, Buffer>();
const CACHE_MAX = 80;

export async function synthesize(input: { text: string; voice: string; rate: number; pitch: number }): Promise<Buffer> {
  const voices = await listNeuralVoices();
  const voice = voices.some((v) => v.id === input.voice) ? input.voice : DEFAULT_VOICE;
  const key = createHash('sha256').update(`${voice}|${input.rate}|${input.pitch}|${input.text}`).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(input.text), { rate: percent(input.rate), pitch: percent(input.pitch) });
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => reject(new Error('tempo esgotado')), 15_000);
      audioStream.on('data', (c: Buffer) => chunks.push(c));
      audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
      audioStream.on('close', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    });
    if (!audio.length) throw new Error('áudio vazio');

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, audio);
    return audio;
  } catch (err) {
    console.error('[sano-voz] Edge TTS falhou:', (err as Error).message);
    throw new AppError(503, 'A voz neural está indisponível agora.');
  } finally {
    tts.close();
  }
}
