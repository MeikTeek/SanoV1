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

/** Extensões aceitas pelo upload; a decodificação final depende do navegador. */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'weba', 'webm',
  'm4a', 'mp4', 'aac', 'flac', 'aif', 'aiff', 'au', 'caf',
] as const;

export const SUPPORTED_AUDIO_ACCEPT = [
  'audio/*',
  ...SUPPORTED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

const AUDIO_EXTENSION = new RegExp(`\\.(${SUPPORTED_AUDIO_EXTENSIONS.join('|')})$`, 'i');

export const isAudioFile = (file: File) => file.type.startsWith('audio/') || AUDIO_EXTENSION.test(file.name);
