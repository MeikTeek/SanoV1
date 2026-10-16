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
