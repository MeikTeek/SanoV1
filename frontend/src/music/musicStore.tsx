import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MusicTrack } from './musicTypes';

interface MusicState {
  tracks: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
  queue: MusicTrack[];
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const queueRef = useRef<MusicTrack[]>([]);
  const requestRef = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const loadTrack = useCallback(async (track: MusicTrack) => {
    const requestId = ++requestRef.current;
    const blob = await readAudio(track.id);
    if (!blob) throw new Error('O arquivo desta música não está disponível neste dispositivo.');
    if (requestId !== requestRef.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = urlRef.current;
    audio.volume = volume;
    audio.load();
    audio.onended = () => {
      const [nextTrack, ...rest] = queueRef.current;
      queueRef.current = rest;
      setQueue(rest);
      if (!nextTrack) { setPlaying(false); return; }
      setCurrent(nextTrack);
      void loadTrack(nextTrack).catch(() => setPlaying(false));
    };
    audio.ontimeupdate = () => setProgressState(audio.currentTime);
    audio.onloadedmetadata = () => {
      setProgressState(0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => setPlaying(false);
    await new Promise<void>((resolve, reject) => {
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) { resolve(); return; }
      const onReady = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('O navegador não conseguiu decodificar este arquivo de áudio.')); };
      const cleanup = () => {
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('error', onError);
      };
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
    if (requestId !== requestRef.current) return;
    await audio.play();
  }, [volume]);

  const play = useCallback((track: MusicTrack, nextQueue: MusicTrack[] = []) => {
    setCurrent(track);
    const cleanQueue = nextQueue.filter((item) => item.id !== track.id);
    queueRef.current = cleanQueue;
    setQueue(cleanQueue);
    setProgressState(0);
    setDuration(0);
    setPlaying(true);
    void loadTrack(track).catch(() => setPlaying(false));
  }, [loadTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  }, [current, playing]);

  const next = useCallback(() => {
    const [track, ...rest] = queueRef.current;
    if (!track) { setPlaying(false); return; }
    queueRef.current = rest;
    setQueue(rest);
    setCurrent(track);
    setProgressState(0);
    setDuration(0);
    void loadTrack(track).catch(() => setPlaying(false));
  }, [loadTrack]);

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
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(file.name);
      if (!isAudio) throw new Error(`${file.name} não é um arquivo de áudio válido.`);
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
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);
  const search = useCallback((term: string) => {
    const query = term.trim().toLocaleLowerCase();
    return query ? tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query)) : tracks;
  }, [tracks]);

  const value = useMemo(() => ({ tracks, current, playing, progress, duration, volume, queue, play, toggle, next, previous, remove, addFiles, setProgress, setVolume, search }), [tracks, current, playing, progress, duration, volume, queue, play, toggle, next, previous, remove, addFiles, setProgress, setVolume, search]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMusic = () => useContext(Ctx);
