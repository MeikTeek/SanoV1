import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAudioFile, type EditableMusicMetadata, type MusicPlaylist, type MusicTrack, type NewMusicMetadata } from './musicTypes';
import { ApiError, api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface MusicState {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
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
  updateTrack: (id: string, metadata: EditableMusicMetadata) => void;
  addFiles: (files: File[], metadata: NewMusicMetadata) => Promise<void>;
  createPlaylist: (name: string) => MusicPlaylist | null;
  deletePlaylist: (id: string) => void;
  playPlaylist: (playlist: MusicPlaylist) => void;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  search: (term: string) => MusicTrack[];
  importPackage: (file: File) => Promise<number>;
  exportPackage: (trackIds: string[]) => Promise<Blob>;
  downloadTrack: (track: MusicTrack) => Promise<{ downloadUrl: string; fileName: string }>;
  toggleFavorite: (id: string) => Promise<void>;
  addToPlaylist: (trackId: string, playlistId: string) => void;
}

const Ctx = createContext<MusicState>(null!);
const META_KEY = 'sano:music:tracks:v1';
const PLAYLIST_KEY = 'sano:music:playlists:v1';
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

const scopedKey = (key: string, userId: string) => `${key}:${userId}`;

const readMeta = (userId: string): MusicTrack[] => {
  try {
    const value = JSON.parse(localStorage.getItem(scopedKey(META_KEY, userId)) || '[]') as MusicTrack[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const readLegacyMeta = (): MusicTrack[] => {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) || '[]') as MusicTrack[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeMeta = (tracks: MusicTrack[], userId: string) => localStorage.setItem(scopedKey(META_KEY, userId), JSON.stringify(tracks));
const readPlaylists = (userId: string): MusicPlaylist[] => {
  try {
    const value = JSON.parse(localStorage.getItem(scopedKey(PLAYLIST_KEY, userId)) || '[]') as MusicPlaylist[];
    return Array.isArray(value) ? value.filter((item) => item && typeof item.name === 'string' && Array.isArray(item.trackIds)) : [];
  } catch { return []; }
};
const writePlaylists = (playlists: MusicPlaylist[], userId: string) => localStorage.setItem(scopedKey(PLAYLIST_KEY, userId), JSON.stringify(playlists));
const syncPlaylists = (playlists: MusicPlaylist[]) => {
  void api.put('/music/playlists', { playlists }).catch((err) => {
    console.warn('[música] não foi possível sincronizar as playlists:', err);
  });
};
const trackKey = (track: MusicTrack) => [track.title, track.artist, track.album, track.fileName]
  .map((value) => String(value).trim().toLocaleLowerCase()).join('|');
const uniqueTracks = (items: MusicTrack[]) => {
  const seen = new Set<string>();
  return items.filter((track) => {
    const key = trackKey(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function MusicProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const storageUserRef = useRef(userId);
  const [tracks, setTracks] = useState<MusicTrack[]>(() => readMeta(userId));
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>(() => readPlaylists(userId));
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

  useEffect(() => {
    storageUserRef.current = userId;
    setTracks(readMeta(userId));
    setPlaylists(readPlaylists(userId));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const local = readPlaylists(userId);
    void api.get<MusicPlaylist[]>('/music/playlists').then((remote) => {
      if (cancelled) return;
      const next = remote.length ? remote : local;
      setPlaylists(next);
      writePlaylists(next, userId);
      if (!remote.length && local.length) syncPlaylists(local);
    }).catch((err) => {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.warn('[música] não foi possível carregar as playlists:', err);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void api.get<MusicTrack[]>('/music/tracks').then(async (remoteTracks) => {
      const scopedTracks = readMeta(userId);
      const legacyTracks = readLegacyMeta();
      const knownIds = new Set(scopedTracks.map((track) => track.id));
      const localTracks = [...scopedTracks, ...legacyTracks.filter((track) => !knownIds.has(track.id))];
      const remoteIds = new Set(remoteTracks.map((track) => track.id));
      const migrated: MusicTrack[] = [];
      const migratedLocalIds = new Set<string>();
      for (const localTrack of localTracks.filter((track) => !remoteIds.has(track.id))) {
        const localFile = await readAudio(localTrack.id).catch(() => undefined);
        if (!localFile) continue;
        try {
          const remote = await api.post<MusicTrack>('/music/tracks', {
            title: localTrack.title,
            artist: localTrack.artist,
            album: localTrack.album,
            genre: localTrack.genre,
            mood: localTrack.mood,
            coverDataUrl: localTrack.coverDataUrl || undefined,
            duration: localTrack.duration,
            fileName: localTrack.fileName,
            mimeType: localTrack.mimeType || localFile.type || 'application/octet-stream',
            size: localFile.size,
          });
          await api.post(`/music/tracks/${remote.id}/upload`, localFile);
          await saveAudio(remote.id, new File([localFile], remote.fileName, { type: remote.mimeType }));
          migrated.push(remote);
          migratedLocalIds.add(localTrack.id);
        } catch (err) {
          console.warn('[música] não foi possível migrar uma música local:', localTrack.fileName, err);
        }
      }
      if (cancelled) return;
      const merged = uniqueTracks([...migrated, ...remoteTracks, ...localTracks.filter((track) => !remoteIds.has(track.id) && !migratedLocalIds.has(track.id))]);
      setTracks(merged);
      writeMeta(merged, userId);
      if (legacyTracks.length > 0 && legacyTracks.every((track) => migratedLocalIds.has(track.id))) {
        localStorage.removeItem(META_KEY);
      }
    }).catch((err) => {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.warn('[música] não foi possível sincronizar a biblioteca:', err);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

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
        if (!stored) {
          const audio = getAudio();
          if (requestId !== requestRef.current) return;
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = `/api/music/tracks/${encodeURIComponent(track.id)}/stream`;
          loadedIdRef.current = track.id;
          audio.src = urlRef.current;
          audio.volume = volumeRef.current;
          audio.load();
          await audio.play();
          return;
        }
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
    void api.delete(`/music/tracks/${id}`).catch((err) => {
      if (!(err instanceof ApiError && err.status === 404)) console.warn('[música] não foi possível remover a cópia online:', err);
    });
    setTracks((items) => {
      const nextTracks = items.filter((item) => item.id !== id);
      writeMeta(nextTracks, storageUserRef.current);
      return nextTracks;
    });
  }, []);

  const updateTrack = useCallback((id: string, metadata: EditableMusicMetadata) => {
    void api.patch(`/music/tracks/${id}`, metadata).catch((err) => {
      if (!(err instanceof ApiError && err.status === 404)) console.warn('[música] não foi possível atualizar a cópia online:', err);
    });
    setTracks((items) => {
      const nextTracks = items.map((track) => track.id === id
        ? { ...track, title: metadata.title.trim() || track.title, artist: metadata.artist.trim(), album: metadata.album.trim(), genre: metadata.genre.trim(), mood: metadata.mood.trim() }
        : track);
      writeMeta(nextTracks, storageUserRef.current);
      return nextTracks;
    });
    setCurrent((currentTrack) => currentTrack?.id === id
      ? { ...currentTrack, title: metadata.title.trim() || currentTrack.title, artist: metadata.artist.trim(), album: metadata.album.trim(), genre: metadata.genre.trim(), mood: metadata.mood.trim() }
      : currentTrack);
    setPlaylists((items) => {
      const withoutTrack = items.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((trackId) => trackId !== id) }));
      const nextPlaylists = metadata.playlistId
        ? withoutTrack.map((playlist) => playlist.id === metadata.playlistId ? { ...playlist, trackIds: [...playlist.trackIds, id] } : playlist)
        : withoutTrack;
      writePlaylists(nextPlaylists, storageUserRef.current);
      syncPlaylists(nextPlaylists);
      return nextPlaylists;
    });
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const updated = await api.post<MusicTrack>(`/music/tracks/${id}/favorite`);
    setTracks((items) => {
      const nextTracks = items.map((track) => track.id === id ? { ...track, favorite: updated.favorite } : track);
      writeMeta(nextTracks, storageUserRef.current);
      return nextTracks;
    });
  }, []);

  const addFiles = useCallback(async (files: File[], metadata: NewMusicMetadata) => {
    const added: MusicTrack[] = [];
    for (const file of files) {
      if (!isAudioFile(file)) throw new Error(`${file.name} não é um arquivo de áudio compatível.`);
      const remote = await api.post<MusicTrack>('/music/tracks', {
        ...metadata,
        title: metadata.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
        album: metadata.album.trim() || 'Uploads do Sano',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        coverDataUrl: metadata.coverDataUrl,
      });
      await api.post(`/music/tracks/${remote.id}/upload`, file);
      const track: MusicTrack = {
        ...metadata,
        id: remote.id,
        title: metadata.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
        duration: 0,
        fileName: file.name,
        createdAt: new Date().toISOString(),
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        coverDataUrl: metadata.coverDataUrl,
      };
      await saveAudio(remote.id, file);
      audioCacheRef.current.set(remote.id, file);
      added.push(track);
    }
    setTracks((items) => {
      const nextTracks = [...added, ...items];
      writeMeta(nextTracks, storageUserRef.current);
      return nextTracks;
    });
    if (metadata.playlistId && added.length) {
      setPlaylists((items) => {
        const nextPlaylists = items.map((playlist) => playlist.id === metadata.playlistId
          ? { ...playlist, trackIds: [...playlist.trackIds, ...added.map((track) => track.id)] }
          : playlist);
        writePlaylists(nextPlaylists, storageUserRef.current);
        syncPlaylists(nextPlaylists);
        return nextPlaylists;
      });
    }
  }, []);

  const createPlaylist = useCallback((name: string) => {
    const normalized = name.trim();
    if (!normalized || playlists.some((playlist) => playlist.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) return null;
    const playlist = { id: crypto.randomUUID(), name: normalized, trackIds: [] };
    setPlaylists((items) => {
      const nextPlaylists = [playlist, ...items];
      writePlaylists(nextPlaylists, storageUserRef.current);
      syncPlaylists(nextPlaylists);
      return nextPlaylists;
    });
    return playlist;
  }, [playlists]);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((items) => {
      const nextPlaylists = items.filter((playlist) => playlist.id !== id);
      writePlaylists(nextPlaylists, storageUserRef.current);
      syncPlaylists(nextPlaylists);
      return nextPlaylists;
    });
  }, []);

  const addToPlaylist = useCallback((trackId: string, playlistId: string) => {
    setPlaylists((items) => {
      const nextPlaylists = items.map((playlist) => playlist.id === playlistId && !playlist.trackIds.includes(trackId)
        ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
        : playlist);
      writePlaylists(nextPlaylists, storageUserRef.current);
      return nextPlaylists;
    });
  }, []);

  const playPlaylist = useCallback((playlist: MusicPlaylist) => {
    const playlistTracks = playlist.trackIds.map((id) => tracks.find((track) => track.id === id)).filter((track): track is MusicTrack => Boolean(track));
    if (playlistTracks.length) play(playlistTracks[0], playlistTracks.slice(1));
  }, [play, tracks]);

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

  const importPackage = useCallback(async (file: File) => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('O pacote não contém manifest.json.');
    const manifest = JSON.parse(await manifestFile.async('text')) as { tracks?: Array<MusicTrack & { path: string }> };
    if (!Array.isArray(manifest.tracks)) throw new Error('Manifesto de música inválido.');
    const imported: MusicTrack[] = [];
    for (const item of manifest.tracks) {
      if (!item.path || !isAudioFile({ name: item.fileName } as File)) continue;
      const audio = zip.file(item.path);
      if (!audio) continue;
      const blob = await audio.async('blob');
      const id = crypto.randomUUID();
      const track: MusicTrack = { ...item, id, duration: 0, createdAt: new Date().toISOString() };
      await saveAudio(id, new File([blob], item.fileName, { type: blob.type }));
      audioCacheRef.current.set(id, blob);
      imported.push(track);
    }
    if (!imported.length) throw new Error('O pacote não contém músicas compatíveis.');
    setTracks((items) => {
      const nextTracks = [...imported, ...items];
      writeMeta(nextTracks, storageUserRef.current);
      return nextTracks;
    });
    return imported.length;
  }, []);

  const exportPackage = useCallback(async (trackIds: string[]) => {
    const { default: JSZip } = await import('jszip');
    const selected = tracks.filter((track) => trackIds.includes(track.id));
    if (!selected.length) throw new Error('Selecione ao menos uma música.');
    const zip = new JSZip();
    const manifest: { version: 1; tracks: Array<MusicTrack & { path: string }> } = { version: 1, tracks: [] };
    for (const track of selected) {
      const audio = audioCacheRef.current.get(track.id) || await readAudio(track.id);
      if (!audio) throw new Error(`O arquivo de "${track.title}" não está disponível.`);
      const path = `audio/${track.id}-${track.fileName.replace(/[^\w.-]+/g, '_')}`;
      zip.file(path, audio);
      manifest.tracks.push({ ...track, path });
    }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }, [tracks]);

  const downloadTrack = useCallback(async (track: MusicTrack) => {
    const remote = await api.get<{ downloadUrl: string; fileName: string }>(`/music/tracks/${track.id}/download`);
    return { downloadUrl: remote.downloadUrl, fileName: remote.fileName };
  }, []);

  const value = useMemo(
    () => ({ tracks, playlists, current, playing, progress, duration, volume, queue, error, play, toggle, next, previous, remove, updateTrack, addFiles, createPlaylist, deletePlaylist, addToPlaylist, playPlaylist, setProgress, setVolume, search, importPackage, exportPackage, downloadTrack, toggleFavorite }),
    [tracks, playlists, current, playing, progress, duration, volume, queue, error, play, toggle, next, previous, remove, updateTrack, addFiles, createPlaylist, deletePlaylist, addToPlaylist, playPlaylist, setProgress, setVolume, search, importPackage, exportPackage, downloadTrack, toggleFavorite],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMusic = () => useContext(Ctx);
