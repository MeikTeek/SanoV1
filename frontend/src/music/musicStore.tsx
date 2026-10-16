import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAudioFile, type MusicTrack } from './musicTypes';

interface MusicState {
  tracks: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
  queue: MusicTrack[];
  error: string | null;
  play: (track: MusicTrack, nextQueue?: MusicTrack[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  remove: (id: string) => void;
  addFiles: (files: File[], metadata: Omit<MusicTrack, 'id' | 'title' | 'duration' | 'fileName' | 'createdAt'>) => Promise<void>;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  search: (term: string) => MusicTrack[];
}

const Ctx = createContext<MusicState>(null!);
const META_KEY = 'sano:music:tracks:v1';
const DB_NAME = 'sano-music';
const STORE_NAME = 'audio';

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav',
  ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  weba: 'audio/webm', webm: 'audio/webm', aif: 'audio/aiff', aiff: 'audio/aiff',
  au: 'audio/basic', caf: 'audio/x-caf',
};

// Alguns navegadores devolvem o arquivo do IndexedDB sem o tipo; refazemos pela extensão.
const withMime = (blob: Blob, fileName: string) => {
  const type = MIME_BY_EXT[fileName.split('.').pop()?.toLowerCase() || ''];
  // O tipo salvo no IndexedDB pode ser vazio ou application/octet-stream.
  // Para áudio, a extensão do arquivo é uma fonte mais confiável.
  return type && blob.type !== type ? new Blob([blob], { type }) : blob;
};

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function saveAudio(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(file, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function readAudio(id: string) {
  const db = await openDb();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}

const readMeta = (): MusicTrack[] => {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) || '[]') as MusicTrack[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeMeta = (tracks: MusicTrack[]) => localStorage.setItem(META_KEY, JSON.stringify(tracks));

export function MusicProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<MusicTrack[]>(readMeta);
  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgressState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const queueRef = useRef<MusicTrack[]>([]);
  const requestRef = useRef(0);
  const volumeRef = useRef(0.8);
  const loadedIdRef = useRef<string | null>(null); // id da música cujo arquivo está no <audio>
  const nextRef = useRef<() => void>(() => {});
  const audioCacheRef = useRef(new Map<string, Blob>());

  useEffect(() => { queueRef.current = queue; }, [queue]);

  useEffect(() => {
    let cancelled = false;
    tracks.forEach((track) => {
      if (audioCacheRef.current.has(track.id)) return;
      void readAudio(track.id).then((blob) => {
        if (!cancelled && blob) audioCacheRef.current.set(track.id, blob);
      }).catch((err) => console.warn('[música] não foi possível pré-carregar o arquivo:', err));
    });
    return () => { cancelled = true; };
  }, [tracks]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  // Cria o <audio> uma única vez e liga o estado do React aos eventos reais dele.
  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('timeupdate', () => setProgressState(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => {
      setProgressState(0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    });
    audio.addEventListener('ended', () => nextRef.current());
    audio.addEventListener('error', () => {
      const mediaError = audio.error;
      console.error('[música] erro no elemento de áudio:', {
        code: mediaError?.code,
        message: mediaError?.message,
        sourceType: audio.src ? 'blob' : 'empty',
      });
      setPlaying(false);
      if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError('O arquivo MP3 não pôde ser decodificado. Ele pode estar corrompido ou usar um codec incomum.');
      } else if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
        setError('O arquivo foi encontrado, mas o navegador não conseguiu decodificar o áudio.');
      } else {
        setError('Não foi possível carregar o arquivo de áudio local.');
      }
    });
    audioRef.current = audio;
    return audio;
  }, []);

  const reportError = useCallback((err: unknown) => {
    console.error('[música]', err);
    setPlaying(false);
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError') setError('O navegador bloqueou o início automático. Clique em play para tocar.');
    else if (name === 'NotSupportedError') setError('O navegador não consegue tocar o formato deste arquivo.');
    else setError(err instanceof Error ? err.message : 'Não foi possível tocar esta música.');
  }, []);

  const loadTrack = useCallback(async (track: MusicTrack) => {
    const requestId = ++requestRef.current;
    setError(null);
    try {
      // Quando o blob já está em memória, não há uma tarefa IndexedDB entre o
      // clique e play(); isso preserva a autorização de reprodução do navegador.
      let stored = audioCacheRef.current.get(track.id);
      if (!stored) {
        stored = await readAudio(track.id);
        if (stored) audioCacheRef.current.set(track.id, stored);
      }
      if (requestId !== requestRef.current) return;
      const audio = getAudio();
      if (!stored) {
        audio.pause();
        loadedIdRef.current = null;
        throw new Error('O arquivo desta música não está disponível neste navegador. Remova e adicione de novo.');
      }
      if (stored.size === 0) {
        loadedIdRef.current = null;
        throw new Error('O arquivo desta música está vazio ou foi salvo de forma incompleta.');
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(withMime(stored, track.fileName));
      loadedIdRef.current = track.id;
      audio.src = urlRef.current;
      audio.volume = volumeRef.current;
      audio.load();
      await audio.play();
    } catch (err) {
      if (requestId !== requestRef.current) return; // foi substituída por outra música
      if (err instanceof DOMException && err.name === 'AbortError') return;
      reportError(err);
    }
  }, [getAudio, reportError]);

  const play = useCallback((track: MusicTrack, nextQueue: MusicTrack[] = []) => {
    setCurrent(track);
    const cleanQueue = nextQueue.filter((item) => item.id !== track.id);
    queueRef.current = cleanQueue;
    setQueue(cleanQueue);
    setProgressState(0);
    setDuration(0);
    setPlaying(true);
    void loadTrack(track);
  }, [loadTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (!audio.paused) { audio.pause(); return; }
    // Arquivo desta música ainda não está carregado (falha anterior): carrega de novo
    if (loadedIdRef.current !== current.id) { setPlaying(true); void loadTrack(current); return; }
    // Chamado direto do clique, então o navegador libera o play
    audio.play().catch(reportError);
  }, [current, loadTrack, reportError]);

  const next = useCallback(() => {
    const [track, ...rest] = queueRef.current;
    if (!track) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
      setPlaying(false);
      setProgressState(0);
      return;
    }
    queueRef.current = rest;
    setQueue(rest);
    setCurrent(track);
    setProgressState(0);
    setDuration(0);
    setPlaying(true);
    void loadTrack(track);
  }, [loadTrack]);

  useEffect(() => { nextRef.current = next; }, [next]);

  const previous = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    setProgressState(0);
  }, []);

  const remove = useCallback((id: string) => {
    setTracks((items) => {
      const nextTracks = items.filter((item) => item.id !== id);
      writeMeta(nextTracks);
      return nextTracks;
    });
  }, []);

  const addFiles = useCallback(async (files: File[], metadata: Omit<MusicTrack, 'id' | 'title' | 'duration' | 'fileName' | 'createdAt'>) => {
    const added: MusicTrack[] = [];
    for (const file of files) {
      if (!isAudioFile(file)) throw new Error(`${file.name} não é um arquivo de áudio compatível.`);
      const id = crypto.randomUUID();
      const track: MusicTrack = {
        ...metadata,
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        duration: 0,
        fileName: file.name,
        createdAt: new Date().toISOString(),
      };
      await saveAudio(id, file);
      audioCacheRef.current.set(id, file);
      added.push(track);
    }
    setTracks((items) => {
      const nextTracks = [...added, ...items];
      writeMeta(nextTracks);
      return nextTracks;
    });
  }, []);

  const setProgress = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = Math.max(0, Math.min(value, Number.isFinite(audio.duration) ? audio.duration : value));
    setProgressState(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    volumeRef.current = value;
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

  const search = useCallback((term: string) => {
    const query = term.trim().toLocaleLowerCase();
    return query ? tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query)) : tracks;
  }, [tracks]);

  const value = useMemo(
    () => ({ tracks, current, playing, progress, duration, volume, queue, error, play, toggle, next, previous, remove, addFiles, setProgress, setVolume, search }),
    [tracks, current, playing, progress, duration, volume, queue, error, play, toggle, next, previous, remove, addFiles, setProgress, setVolume, search],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMusic = () => useContext(Ctx);
