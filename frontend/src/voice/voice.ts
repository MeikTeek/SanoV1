/**
 * Voz e ouvidos do Sano:
 * - ouvir: Web Speech API (`SpeechRecognition`) — Chrome, Edge e Android;
 * - falar: voz neural da Microsoft (gerada pelo servidor, `/sano/voice/tts`)
 *   ou, como reserva, `speechSynthesis` com as vozes pt-BR do aparelho.
 *
 * Nada aqui precisa de chave. Onde a API não existe (ex.: reconhecimento no
 * Firefox), `canListen()` devolve false e a tela esconde o botão.
 */
import { api } from '../services/api';

export interface VoicePrefs {
  /** Ler as respostas em voz alta: sempre, só quando você falou, ou nunca. */
  speak: 'always' | 'voice' | 'never';
  /** Voz neural (servidor) ou a do próprio navegador. */
  engine: 'neural' | 'browser';
  /** Voz neural escolhida (ex.: "pt-BR-AntonioNeural"). */
  neuralVoice: string;
  /** `voiceURI` do navegador; vazio = a melhor pt-BR disponível. */
  voiceURI: string;
  rate: number;
  pitch: number;
}

const PREFS_KEY = 'sano:voice:v1';
const DEFAULTS: VoicePrefs = { speak: 'voice', engine: 'neural', neuralVoice: 'pt-BR-AntonioNeural', voiceURI: '', rate: 1.05, pitch: 0.95 };

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<VoicePrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* modo privativo */ }
  window.dispatchEvent(new Event('sano-voice-prefs'));
}

/* ───────── Falar ───────── */

export const canSpeak = () => typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
const hasBrowserVoice = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Vozes em português; as "naturais"/online (Edge, Google) primeiro. */
export function portugueseVoices(): SpeechSynthesisVoice[] {
  if (!hasBrowserVoice()) return [];
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang === 'pt-BR' ? 4 : 0) + (/natural|online|neural/i.test(v.name) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
  return speechSynthesis.getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('pt'))
    .sort((a, b) => score(b) - score(a));
}

/** Tira o que não soa bem falado: links, emojis, marcação. */
function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_#`>|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NeuralVoice { id: string; name: string; gender: 'Male' | 'Female' }
export const fetchNeuralVoices = () => api.get<{ voices: NeuralVoice[]; defaultVoice: string }>('/sano/voice/voices');

type SpeakEvents = { onStart?: () => void; onEnd?: () => void };

/** Áudio neural tocando agora; `token` descarta respostas que chegaram tarde. */
let current: { audio: HTMLAudioElement; url: string; onEnd?: () => void } | null = null;
let token = 0;

export function speak(text: string, prefs: VoicePrefs, events: SpeakEvents = {}): void {
  const clean = speakable(text);
  if (!clean) return;
  stopSpeaking();
  if (prefs.engine === 'neural') void speakNeural(clean, prefs, events, ++token);
  else speakBrowser(clean, prefs, events);
}

async function speakNeural(text: string, prefs: VoicePrefs, events: SpeakEvents, mine: number) {
  try {
    const blob = await api.postBlob('/sano/voice/tts', { text, voice: prefs.neuralVoice, rate: prefs.rate, pitch: prefs.pitch });
    if (mine !== token) return; // outra fala começou (ou alguém mandou parar) enquanto baixava
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = { audio, url, onEnd: events.onEnd };
    const done = () => { if (current?.audio === audio) { URL.revokeObjectURL(url); current = null; } events.onEnd?.(); };
    audio.onplaying = () => events.onStart?.();
    audio.onended = done;
    audio.onerror = done;
    await audio.play();
  } catch {
    // Serviço da Microsoft fora ou autoplay bloqueado: cai na voz do navegador.
    if (mine === token) speakBrowser(text, prefs, events);
  }
}

function speakBrowser(clean: string, prefs: VoicePrefs, events: SpeakEvents) {
  if (!hasBrowserVoice()) { events.onEnd?.(); return; }
  const utter = new SpeechSynthesisUtterance(clean);
  const voices = portugueseVoices();
  const voice = voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0];
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? 'pt-BR';
  utter.rate = prefs.rate;
  utter.pitch = prefs.pitch;
  utter.onstart = () => events.onStart?.();
  utter.onend = () => events.onEnd?.();
  utter.onerror = () => events.onEnd?.();
  speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  token++;
  if (current) {
    const { audio, url, onEnd } = current;
    current = null;
    audio.pause();
    URL.revokeObjectURL(url);
    onEnd?.(); // pausar não dispara `ended`: avisa quem acompanha (a onda)
  }
  if (hasBrowserVoice()) speechSynthesis.cancel();
}

/* ───────── Ouvir ───────── */

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canListen = () => recognitionCtor() !== null;

export interface Listener { stop(): void }

/**
 * Ouve uma frase e devolve o texto final. `onPartial` recebe o que já foi
 * entendido enquanto a pessoa fala (para mostrar no campo).
 */
export function listen(handlers: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'pt-BR';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';

  rec.onresult = (e) => {
    let partial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const piece = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += piece;
      else partial += piece;
    }
    handlers.onPartial((finalText + partial).trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    handlers.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Permita o uso do microfone para falar com o Sano.'
      : e.error === 'network'
        ? 'O reconhecimento de voz precisa de internet.'
        : 'Não consegui ouvir agora. Tente de novo.');
  };
  rec.onend = () => {
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onEnd();
  };

  stopSpeaking(); // o Sano não fala por cima de quem está falando
  rec.start();
  return { stop: () => rec.stop() };
}
