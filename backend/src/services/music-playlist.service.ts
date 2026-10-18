import { prisma } from '../config/prisma';

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

const TOOL = 'music';
const KEY = 'playlists';

export async function listMusicPlaylists(userId: string): Promise<MusicPlaylist[]> {
  const stored = await prisma.toolData.findUnique({
    where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
  });
  if (!stored || !Array.isArray(stored.data)) return [];
  return stored.data as unknown as MusicPlaylist[];
}

export async function saveMusicPlaylists(userId: string, playlists: MusicPlaylist[]) {
  const trackIds = new Set(
    (await prisma.musicTrack.findMany({ where: { ownerId: userId }, select: { id: true } })).map((track) => track.id),
  );
  const sanitized = playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name.trim().slice(0, 100),
    trackIds: [...new Set(playlist.trackIds)].filter((id) => trackIds.has(id)),
  }));

  await prisma.toolData.upsert({
    where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
    create: { userId, tool: TOOL, key: KEY, data: sanitized },
    update: { data: sanitized },
  });
  return sanitized;
}
