export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
  duration: number;
  fileName: string;
  createdAt: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface NewMusicMetadata {
  artist: string;
  album: string;
  genre: string;
  mood: string;
  title?: string;
  playlistId?: string;
}

/** Extensões aceitas pelo upload; a decodificação final depende do navegador. */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'weba', 'webm',
  'm4a', 'mp4', 'aac', 'flac', 'aif', 'aiff', 'au', 'caf',
] as const;

export const SUPPORTED_AUDIO_ACCEPT = [
  ...SUPPORTED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

const AUDIO_EXTENSION = new RegExp(`\\.(${SUPPORTED_AUDIO_EXTENSIONS.join('|')})$`, 'i');

export const getAudioFormat = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && SUPPORTED_AUDIO_EXTENSIONS.includes(extension as typeof SUPPORTED_AUDIO_EXTENSIONS[number])
    ? extension.toUpperCase()
    : null;
};

/** Exige uma extensão conhecida; MIME audio/* sozinho não libera formatos desconhecidos. */
export const isAudioFile = (file: File) => AUDIO_EXTENSION.test(file.name);
