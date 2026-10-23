import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { parseBlob } from 'music-metadata';
import AppShell from '../../components/layout/AppShell';
import { IconCopy, IconDownload, IconMoreVertical, IconMusic, IconPause, IconPlay, IconPlus, IconSearch } from '../../components/ui/icons';
import MusicCover from '../../components/music/MusicCover';
import { useMusic } from '../../music/musicStore';
import { getAudioFormat, isAudioFile, SUPPORTED_AUDIO_ACCEPT, SUPPORTED_AUDIO_EXTENSIONS, type EditableMusicMetadata, type MusicTrack } from '../../music/musicTypes';
import { api } from '../../services/api';

interface PendingMusicFile {
  file: File;
  title: string;
  artist: string;
  album: string;
  coverDataUrl?: string;
}

const uint8ToBase64 = (data: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const fmtDuration = (seconds: number) =>
  seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—';

/** Cor estável por texto: dá identidade às playlists sem capa. */
const hueOf = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function IconHeart({ filled = false, size = 18 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

function Equalizer() {
  return (
    <span className="track-eq" aria-label="Tocando agora">
      <i /><i /><i />
    </span>
  );
}

export default function MusicPage() {
  const { tracks, playlists, current, playing, queue, play, toggle, addFiles, updateTrack, remove, search, createPlaylist, deletePlaylist, addToPlaylist, playPlaylist, exportPackage, importPackage, downloadTrack, toggleFavorite } = useMusic();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [title, setTitle] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingMusicFile[]>([]);
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'choose' | 'send' | 'receive'>('choose');
  const [shareCode, setShareCode] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [openTrackMenu, setOpenTrackMenu] = useState<string | null>(null);
  const [openPlaylistMenu, setOpenPlaylistMenu] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const found = search(query);
  const artists = Array.from(new Set(tracks.map((t) => t.artist).filter(Boolean))).sort();
  const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean))).sort();
  const moods = Array.from(new Set(tracks.map((t) => t.mood).filter(Boolean))).sort();
  const visible = found.filter((track) =>
    (!artistFilter || track.artist === artistFilter) &&
    (!genreFilter || track.genre === genreFilter) &&
    (!moodFilter || track.mood === moodFilter) &&
    (!favoritesOnly || track.favorite) &&
    (!playlistFilter || playlists.find((playlist) => playlist.id === playlistFilter)?.trackIds.includes(track.id)),
  );

  // Clique fora fecha o menu de ações da faixa.
  useEffect(() => {
    if (!openTrackMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.track-menu-wrap')) { setOpenTrackMenu(null); setOpenPlaylistMenu(null); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openTrackMenu]);

  // Fecha o modal com Esc
  useEffect(() => {
    if (!uploadOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeUpload(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uploadOpen]);

  // Se o filtro de clima deixar de existir (ex.: removeu a última música), limpa
  useEffect(() => {
    if (moodFilter && !moods.includes(moodFilter)) setMoodFilter('');
  }, [moodFilter, moods]);

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setEditingTrack(null);
    setPendingFiles([]);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Selecionar/soltar apenas prepara a prévia. O IndexedDB só é alterado em
  // confirmUpload, depois que o usuário revisar os dados.
  const stageFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    const audio = files.filter(isAudioFile);
    const rejectedNames = files.filter((file) => !isAudioFile(file)).map((file) => file.name);
    if (rejectedNames.length) {
      setMessage({ text: `Arquivo(s) não suportado(s): ${rejectedNames.join(', ')}`, error: true });
    } else {
      setMessage(null);
    }
    if (audio.length) {
      const prepared = await Promise.all(audio.map(async (file): Promise<PendingMusicFile> => {
        const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
        try {
          const metadata = await parseBlob(file);
          const artistsFromTags = metadata.common.artists?.join(', ');
          return {
            file,
            title: metadata.common.title?.trim() || fallbackTitle,
            artist: artistsFromTags || metadata.common.artist?.trim() || '',
            album: metadata.common.album?.trim() || 'Uploads do Sano',
            coverDataUrl: metadata.common.picture?.[0]
              ? `data:${metadata.common.picture[0].format};base64,${uint8ToBase64(metadata.common.picture[0].data)}`
              : undefined,
          };
        } catch (error) {
          console.warn('[música] não foi possível ler as tags:', file.name, error);
          return { file, title: fallbackTitle, artist: '', album: 'Uploads do Sano' };
        }
      }));
      setPendingFiles((currentFiles) => [...currentFiles, ...prepared]);
      const first = prepared[0];
      if (first) {
        setTitle((value) => value || first.title);
        setArtist((value) => value || first.artist);
      }
    }
  };

  const confirmUpload = async () => {
    if (!pendingFiles.length || uploading) return;
    if (!artist.trim() || !genre.trim() || !mood.trim()) {
      setMessage({ text: 'Preencha autor, gênero e clima antes de adicionar as músicas.', error: true });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      for (const pending of pendingFiles) {
        await addFiles([pending.file], {
          artist: pending.artist.trim() || artist.trim(),
          album: pending.album.trim() || 'Uploads do Sano',
          genre: genre.trim(),
          mood,
          title: pending.title.trim() || title,
          playlistId: playlistId || undefined,
          coverDataUrl: pending.coverDataUrl,
        });
      }
      const added = `${pendingFiles.length} ${pendingFiles.length === 1 ? 'música adicionada' : 'músicas adicionadas'} à sua biblioteca.`;
      setMessage({ text: added });
      setPendingFiles([]);
      setUploadOpen(false);
      setTitle('');
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível adicionar as músicas.', error: true });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void stageFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void stageFiles(Array.from(event.dataTransfer.files));
  };
  const onDragOver = (event: DragEvent) => { event.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const handleCreatePlaylist = () => {
    const playlist = createPlaylist(newPlaylistName);
    if (!playlist) {
      setMessage({ text: 'Informe um nome de playlist novo.', error: true });
      return;
    }
    setPlaylistId(playlist.id);
    setNewPlaylistName('');
    setMessage({ text: `Playlist "${playlist.name}" criada.`, });
  };

  const createFromNav = () => {
    const playlist = createPlaylist(newPlaylistName);
    if (!playlist) {
      setMessage({ text: 'Informe um nome de playlist novo.', error: true });
      return;
    }
    setNewPlaylistName('');
    setCreatingPlaylist(false);
    setFavoritesOnly(false);
    setPlaylistFilter(playlist.id);
    setMessage({ text: `Playlist "${playlist.name}" criada. Use o menu ⋮ de uma música para adicioná-la.` });
  };

  const openEdit = (track: MusicTrack) => {
    setEditingTrack(track);
    setArtist(track.artist);
    setAlbum(track.album);
    setGenre(track.genre);
    setMood(track.mood);
    setTitle(track.title);
    setPlaylistId(playlists.find((playlist) => playlist.trackIds.includes(track.id))?.id || '');
    setUploadOpen(true);
  };

  const saveEdit = () => {
    if (!editingTrack || !artist.trim() || !genre.trim() || !mood.trim()) {
      setMessage({ text: 'Autor, gênero e clima são obrigatórios.', error: true });
      return;
    }
    const metadata: EditableMusicMetadata = { title, artist, album, genre, mood, playlistId: playlistId || undefined };
    updateTrack(editingTrack.id, metadata);
    setEditingTrack(null);
    setUploadOpen(false);
    setMessage({ text: 'Informações da música atualizadas.' });
  };

  const createMusicShare = async () => {
    if (!selectedTrackIds.length || sharing) return;
    setSharing(true);
    try {
      const pack = await exportPackage(selectedTrackIds);
      let share: { id: string; code: string };
      try {
        share = await api.post<{ id: string; code: string }>('/music/shares', { size: pack.size });
      } catch (error) {
        throw new Error(`Não foi possível preparar o compartilhamento: ${error instanceof Error ? error.message : 'erro na API'}`);
      }
      try {
        await api.post(`/music/shares/${share.id}/upload`, pack);
      } catch (error) {
        throw new Error(`Não foi possível enviar o pacote ao storage: ${error instanceof Error ? error.message : 'erro na API'}`);
      }
      try {
        await api.post(`/music/shares/${share.id}/finalize`);
      } catch (error) {
        throw new Error(`O pacote foi enviado, mas não pôde ser finalizado: ${error instanceof Error ? error.message : 'erro na API'}`);
      }
      setShareCode(share.code);
      setMessage({ text: 'Pacote criado. Envie este código para a outra pessoa.' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível compartilhar as músicas.', error: true });
    } finally {
      setSharing(false);
    }
  };

  const openShare = () => {
    setShareOpen(true);
    setShareMode('choose');
    setSelectionMode(false);
    setSelectedTrackIds([]);
    setShareCode('');
    setMessage(null);
  };

  const closeShare = () => {
    if (sharing) return;
    setShareOpen(false);
    setShareMode('choose');
    setSelectionMode(false);
    setSelectedTrackIds([]);
    setShareCode('');
  };

  const openSendShare = () => {
    setShareMode('send');
    setShareOpen(true);
  };

  const copyShareCode = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const saveDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadOne = async (track: MusicTrack) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await downloadTrack(track);
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
      setMessage({ text: `"${track.title}" pronta para ouvir offline.` });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível baixar a música.', error: true });
    } finally {
      setDownloading(false);
    }
  };

  const downloadAll = async () => {
    if (downloading || !tracks.length) return;
    setDownloading(true);
    try {
      const downloads = [];
      for (const track of tracks) {
        const result = await downloadTrack(track);
        downloads.push(result);
      }
      downloads.forEach((result, index) => {
        window.setTimeout(() => {
          const link = document.createElement('a');
          link.href = result.downloadUrl;
          link.download = result.fileName;
          link.target = '_blank';
          link.rel = 'noopener';
          link.click();
        }, index * 250);
      });
      setMessage({ text: `${tracks.length} downloads foram iniciados.` });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível baixar a biblioteca.', error: true });
    } finally {
      setDownloading(false);
    }
  };

  const claimMusicShare = async () => {
    if (!claimCode.trim() || sharing) return;
    setSharing(true);
    try {
      const blob = await api.postBlob('/music/shares/claim', { code: claimCode });
      const file = new File([blob], `sano-musicas-${claimCode.trim().toUpperCase()}.zip`, { type: 'application/zip' });
      const count = await importPackage(file);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(link.href);
      setClaimCode('');
      setMessage({ text: `${count} ${count === 1 ? 'música importada' : 'músicas importadas'} e pacote baixado.` });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível resgatar o pacote.', error: true });
    } finally {
      setSharing(false);
    }
  };

  const activePlaylist = playlists.find((p) => p.id === playlistFilter);
  const viewTitle = activePlaylist?.name ?? (favoritesOnly ? 'Favoritas' : 'Suas músicas');
  const viewKind = activePlaylist ? 'Playlist' : favoritesOnly ? 'Coleção' : 'Biblioteca';
  const favoritesCount = tracks.filter((t) => t.favorite).length;
  const totalSeconds = visible.reduce((sum, t) => sum + (t.duration > 0 ? t.duration : 0), 0);
  const heroHue = hueOf(activePlaylist?.name ?? (favoritesOnly ? 'favoritas' : current?.title ?? 'sano'));
  const visiblePlaying = Boolean(current && playing && visible.some((t) => t.id === current.id));
  const playVisible = () => {
    if (visiblePlaying) { toggle(); return; }
    if (visible.length) play(visible[0], visible.slice(1));
  };

  const emptyTitle = tracks.length ? 'Nada encontrado' : 'Sua biblioteca começa aqui';
  const emptyText = tracks.length
    ? 'Tente outro termo de busca ou limpe o filtro de clima.'
    : `Adicione arquivos ${SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')}. A reprodução depende do suporte do navegador.`;

  return (
    <AppShell
      title="Música"
      status={`${tracks.length} na sua biblioteca`}
      flush
    >
      <div className="music-page">
        <aside className="music-library-nav" aria-label="Sua biblioteca">
          <div className="music-library-title">
            <strong><IconMusic size={18} /> Sua biblioteca</strong>
            <button className="music-nav-add" onClick={() => setCreatingPlaylist((v) => !v)} aria-label="Nova playlist" title="Nova playlist">
              <IconPlus size={18} />
            </button>
          </div>
          <button className={`music-library-item${!favoritesOnly && !playlistFilter ? ' active' : ''}`} aria-current={!favoritesOnly && !playlistFilter ? 'page' : undefined} onClick={() => { setFavoritesOnly(false); setPlaylistFilter(''); }}>
            <span className="music-nav-thumb all"><IconMusic size={18} /></span>
            <span className="music-nav-text"><b>Músicas</b><small>{tracks.length} {tracks.length === 1 ? 'faixa' : 'faixas'}</small></span>
          </button>
          <button className={`music-library-item${favoritesOnly ? ' active' : ''}`} onClick={() => { setFavoritesOnly((value) => !value); setPlaylistFilter(''); }}>
            <span className="music-nav-thumb fav"><IconHeart filled size={16} /></span>
            <span className="music-nav-text"><b>Favoritas</b><small>{favoritesCount} {favoritesCount === 1 ? 'faixa' : 'faixas'}</small></span>
          </button>

          <div className="music-nav-section">
            <span>Playlists</span>
            {playlists.length > 0 && <small>{playlists.length}</small>}
          </div>
          {creatingPlaylist && (
            <form className="music-nav-create" onSubmit={(e) => { e.preventDefault(); createFromNav(); }}>
              <input
                autoFocus
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setCreatingPlaylist(false); }}
                placeholder="Nome da playlist"
                aria-label="Nome da nova playlist"
                maxLength={60}
              />
              <button type="submit" disabled={!newPlaylistName.trim()}>Criar</button>
            </form>
          )}
          {playlists.map((playlist) => (
            <div className={`music-playlist-item${!favoritesOnly && playlistFilter === playlist.id ? ' active' : ''}`} key={playlist.id}>
              <button className={`music-library-item${!favoritesOnly && playlistFilter === playlist.id ? ' active' : ''}`} onClick={() => { setFavoritesOnly(false); setPlaylistFilter(playlist.id); }} title={`Abrir playlist ${playlist.name}`}>
                <span className="music-nav-thumb" style={{ '--hue': hueOf(playlist.name) } as React.CSSProperties}>{playlist.name.slice(0, 1).toUpperCase()}</span>
                <span className="music-nav-text"><b>{playlist.name}</b><small>Playlist · {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'faixa' : 'faixas'}</small></span>
              </button>
              <button className="music-playlist-play" onClick={() => playPlaylist(playlist)} aria-label={`Tocar playlist ${playlist.name}`} title="Tocar"><IconPlay size={14} /></button>
              <button className="music-playlist-delete" onClick={() => { if (!confirm(`Excluir a playlist "${playlist.name}"? As músicas continuam na biblioteca.`)) return; deletePlaylist(playlist.id); if (playlistFilter === playlist.id) setPlaylistFilter(''); }} aria-label={`Excluir playlist ${playlist.name}`} title="Excluir">×</button>
            </div>
          ))}
          {!playlists.length && !creatingPlaylist && (
            <button className="music-nav-empty" onClick={() => setCreatingPlaylist(true)}>
              <b>Crie sua primeira playlist</b>
              <small>É fácil — clique aqui e dê um nome.</small>
            </button>
          )}
        </aside>

        <main className="music-main-column">
          <section
            className={`music-hero${dragging ? ' dragover' : ''}`}
            style={{ '--hero-hue': heroHue } as React.CSSProperties}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            key={viewTitle}
          >
            <div className={`music-hero-art${activePlaylist ? '' : favoritesOnly ? ' fav' : ' all'}`} aria-hidden="true">
              {activePlaylist ? activePlaylist.name.slice(0, 1).toUpperCase() : favoritesOnly ? <IconHeart filled size={56} /> : <IconMusic size={56} />}
            </div>
            <div className="music-hero-text">
              <span className="eyebrow">{viewKind}</span>
              <h2>{viewTitle}</h2>
              <p>
                {visible.length} {visible.length === 1 ? 'música' : 'músicas'}
                {totalSeconds > 0 && <> · cerca de {Math.max(1, Math.round(totalSeconds / 60))} min</>}
                {!activePlaylist && !favoritesOnly && <> · {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}</>}
              </p>
              <small>Solte arquivos de áudio aqui para adicioná-los, ou peça ao Sano: “tocar favoritas”.</small>
            </div>
          </section>

          <div className="music-actions">
            <button className="music-play-all" onClick={playVisible} disabled={!visible.length} aria-label={visiblePlaying ? 'Pausar' : 'Tocar tudo'} title={visiblePlaying ? 'Pausar' : 'Tocar tudo'}>
              {visiblePlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
            </button>
            <button className="music-add" onClick={() => setUploadOpen(true)}><IconPlus size={16} /> Adicionar músicas</button>
          </div>

          <input ref={inputRef} hidden type="file" accept={SUPPORTED_AUDIO_ACCEPT} multiple onChange={onPick} />

          {message && (
            <p className={`music-message${message.error ? ' error' : ''}`} role="status" key={message.text}>
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} aria-label="Fechar aviso">×</button>
            </p>
          )}

          <div className="music-search">
            <IconSearch />
            <input
              type="search"
              aria-label="Buscar músicas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, artista ou álbum"
              onFocus={() => setFiltersOpen(true)}
            />
          </div>

          {filtersOpen && <div className="music-filters" aria-label="Filtros da biblioteca">
            <select aria-label="Filtrar por autor" value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)}>
              <option value="">Todos os autores</option>{artists.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Filtrar por gênero" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
              <option value="">Todos os gêneros</option>{genres.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Filtrar por clima" value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}>
              <option value="">Todos os climas</option>{moods.map((item) => <option key={item}>{item}</option>)}
            </select>
            {(artistFilter || genreFilter || moodFilter || playlistFilter || favoritesOnly) && <button className="ghost" onClick={() => { setArtistFilter(''); setGenreFilter(''); setMoodFilter(''); setPlaylistFilter(''); setFavoritesOnly(false); }}>Limpar filtros</button>}
          </div>}

          {filtersOpen && moods.length > 1 && (
            <div className="music-chips" role="group" aria-label="Filtrar por clima">
              <button className={`music-chip${moodFilter === '' ? ' active' : ''}`} onClick={() => setMoodFilter('')}>Todas</button>
              {moods.map((m) => (
                <button
                  key={m}
                  className={`music-chip${moodFilter === m ? ' active' : ''}`}
                  aria-pressed={moodFilter === m}
                  onClick={() => setMoodFilter(moodFilter === m ? '' : m)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="music-section-head">
            <h3>{selectionMode ? 'Marque o que quer enviar' : 'Faixas'}</h3>
            <div className="music-share-actions">
              <span>{visible.length} {visible.length === 1 ? 'resultado' : 'resultados'}</span>
              <button className="ghost" onClick={() => void downloadAll()} disabled={downloading || !tracks.length}>
                <IconDownload size={15} /> {downloading ? 'Baixando…' : 'Baixar todas'}
              </button>
              <button className="ghost" onClick={selectionMode ? openSendShare : openShare}>{selectionMode ? `Gerar código (${selectedTrackIds.length})` : 'Compartilhar lista'}</button>
            </div>
          </div>

          <div className="track-list">
            {visible.length > 0 && (
              <div className="track-head" aria-hidden="true">
                {selectionMode && <span className="track-select" />}
                <span className="track-index">#</span>
                <span className="track-head-title">Título</span>
                <span className="track-mood">Clima</span>
                <span className="track-duration">⏱</span>
                <span className="track-head-actions" />
              </div>
            )}
            {visible.map((track, index) => {
              const isCurrent = current?.id === track.id;
              return (
                <div
                  className={`track-row${isCurrent ? ' playing' : ''}${openTrackMenu === track.id ? ' menu-open' : ''}`}
                  key={track.id}
                  style={{ '--i': Math.min(index, 14) } as React.CSSProperties}
                  onDoubleClick={() => play(track, visible.slice(index + 1))}
                >
                  {selectionMode && <label className="track-select" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTrackIds.includes(track.id)}
                        onChange={() => setSelectedTrackIds((ids) => ids.includes(track.id) ? ids.filter((id) => id !== track.id) : [...ids, track.id])}
                        aria-label={`Selecionar ${track.title} para compartilhar`}
                      />
                    </label>}
                  <span className="track-index">
                    <span className="track-index-label">{isCurrent ? (playing ? <Equalizer /> : <span className="track-current-marker">●</span>) : index + 1}</span>
                    <button
                      className="track-play"
                      onClick={() => (isCurrent ? toggle() : play(track, visible.slice(index + 1)))}
                      aria-label={isCurrent && playing ? `Pausar ${track.title}` : `Tocar ${track.title}`}
                    >
                      {isCurrent && playing ? <IconPause /> : <IconPlay />}
                    </button>
                  </span>
                  <MusicCover src={track.coverDataUrl} title={track.title} className="track-art" />
                  <div className="track-info">
                    <strong title={track.title}>{track.title}</strong>
                    <span>{track.artist || 'Artista desconhecido'}{track.album ? ` · ${track.album}` : ''}</span>
                    <small className="track-format">{track.genre}{track.genre ? ' · ' : ''}{getAudioFormat(track.fileName) || 'formato desconhecido'}</small>
                  </div>
                  <span className="track-mood">{track.mood && <span className="music-chip small">{track.mood}</span>}</span>
                  <button
                    className={`track-fav${track.favorite ? ' on' : ''}`}
                    onClick={() => void toggleFavorite(track.id)}
                    aria-pressed={track.favorite}
                    aria-label={track.favorite ? `Desfavoritar ${track.title}` : `Favoritar ${track.title}`}
                    title={track.favorite ? 'Desfavoritar' : 'Favoritar'}
                  >
                    <IconHeart filled={track.favorite} size={17} />
                  </button>
                  <span className="track-duration">{fmtDuration(track.duration)}</span>
                  <div className="track-menu-wrap">
                    <button
                      className="icon-btn track-menu-trigger"
                      onClick={(event) => { event.stopPropagation(); setOpenTrackMenu((id) => id === track.id ? null : track.id); }}
                      aria-label={`Ações para ${track.title}`}
                      aria-expanded={openTrackMenu === track.id}
                    >
                      <IconMoreVertical />
                    </button>
                    {openTrackMenu === track.id && (
                      <div className="track-menu" role="menu">
                        <button role="menuitem" onClick={() => { setOpenTrackMenu(null); void toggleFavorite(track.id); }}>{track.favorite ? 'Desfavoritar' : 'Favoritar'}</button>
                        <button role="menuitem" onClick={() => {
                          if (!playlists.length) {
                            setOpenTrackMenu(null);
                            setMessage({ text: 'Nenhuma playlist criada. Crie uma playlist antes de adicionar músicas.', error: true });
                            return;
                          }
                          setOpenPlaylistMenu((id) => id === track.id ? null : track.id);
                        }}>
                          {openPlaylistMenu === track.id ? 'Voltar' : 'Adicionar à playlist'}
                        </button>
                        {openPlaylistMenu === track.id && (
                          <div className="track-menu-playlists" role="menu" aria-label="Escolher playlist">
                            <span>Escolha uma playlist</span>
                            {playlists.map((playlist) => (
                              <button key={playlist.id} role="menuitem" onClick={() => { addToPlaylist(track.id, playlist.id); setOpenTrackMenu(null); setOpenPlaylistMenu(null); setMessage({ text: `"${track.title}" adicionada à playlist "${playlist.name}".` }); }}>
                                {playlist.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <button role="menuitem" onClick={() => { setOpenTrackMenu(null); void downloadOne(track); }} disabled={downloading}><IconDownload size={16} /> Baixar</button>
                        <button role="menuitem" onClick={() => { setOpenTrackMenu(null); openEdit(track); }}>Editar</button>
                        <button role="menuitem" className="danger" onClick={() => { setOpenTrackMenu(null); remove(track.id); }}>Excluir</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!visible.length && (
              <div className="music-empty">
                <span className="music-empty-icon">{favoritesOnly ? <IconHeart size={30} /> : <IconMusic size={30} />}</span>
                <h3>
                  {activePlaylist && tracks.length
                    ? 'Playlist vazia'
                    : favoritesOnly && tracks.length && !query ? 'Nenhuma favorita ainda' : emptyTitle}
                </h3>
                <p>
                  {activePlaylist && tracks.length
                    ? 'Abra o menu ⋮ de uma música e escolha "Adicionar à playlist".'
                    : favoritesOnly && tracks.length && !query ? 'Toque no coração ao lado de uma música para guardá-la aqui.' : emptyText}
                </p>
                {!tracks.length && <button className="music-add" onClick={() => setUploadOpen(true)}><IconPlus size={16} /> Adicionar músicas</button>}
              </div>
            )}
          </div>
        </main>

        <aside className={`music-side-panel${current && playing ? ' is-playing' : ''}`} aria-label="Tocando agora">
          <span className="eyebrow">{current ? (playing ? 'Tocando agora' : 'Pausado') : 'Nada tocando'}</span>
          <div className="music-side-art-wrap">
            <MusicCover src={current?.coverDataUrl} title={current?.title || '♪'} className="music-side-art" />
          </div>
          <h3 key={current?.id}>{current?.title || 'Sua biblioteca'}</h3>
          <p>{current?.artist || 'Escolha uma música para começar'}</p>
          {current && <div className="music-side-meta">
            <span>{current.album || 'Sem álbum'}</span>
            <span>{current.genre || 'Sem gênero'} · {current.mood || 'Sem clima'}</span>
            <span>{playlists.find((playlist) => playlist.trackIds.includes(current.id))?.name || 'Músicas'}</span>
            <span>{current.duration > 0 ? fmtDuration(current.duration) : 'Duração não informada'}</span>
          </div>}
          {queue.length > 0 && (
            <div className="music-queue">
              <span className="music-queue-title">A seguir</span>
              {queue.slice(0, 6).map((track, index) => (
                <button key={`${track.id}-${index}`} className="music-queue-item" onClick={() => play(track, queue.slice(index + 1))} title={`Tocar ${track.title}`}>
                  <MusicCover src={track.coverDataUrl} title={track.title} className="track-art" />
                  <span><b>{track.title}</b><small>{track.artist || 'Artista desconhecido'}</small></span>
                </button>
              ))}
              {queue.length > 6 && <small className="music-queue-more">+ {queue.length - 6} na fila</small>}
            </div>
          )}
        </aside>
      </div>

      {uploadOpen && (
        <div
          className="music-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}
        >
          <section className="music-modal" role="dialog" aria-modal="true" aria-labelledby="music-modal-title">
            <div className="music-modal-head">
              <h2 id="music-modal-title">{editingTrack ? 'Editar informações da música' : 'Adicione à sua biblioteca'}</h2>
              <button className="track-remove" style={{ opacity: 1 }} onClick={closeUpload} aria-label="Fechar">×</button>
            </div>
            <p className="muted">Escolha um ou mais arquivos e complete os detalhes para encontrá-los depois.</p>
            <div className="music-upload-fields">
              <label>Autor * <input list="music-artists" autoFocus required value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ex.: Liniker" /></label>
              <datalist id="music-artists">{artists.map((item) => <option key={item} value={item} />)}</datalist>
              <label>Álbum <input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Opcional" /></label>
              <label>Gênero * <input required value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Ex.: Indie pop" /></label>
              <label>Clima *
                <select value={mood} onChange={(e) => setMood(e.target.value)}>
                  <option value="">Selecione</option><option>calma</option><option>agressiva</option><option>foco</option><option>feliz</option><option>melancólica</option>
                </select>
              </label>
              <label>Nome da música <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Usar nome do arquivo" /></label>
              <label>Playlist <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}><option value="">Sem playlist</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select></label>
              <label>Nova playlist <div className="music-inline-field"><input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="Opcional" /><button type="button" className="ghost" onClick={handleCreatePlaylist}>Criar</button></div></label>
            </div>
            {!editingTrack && <div
              className={`music-dropzone${dragging ? ' dragover' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <strong>Arraste seus arquivos aqui</strong>
              <span>ou</span>
              <button className="primary" onClick={() => inputRef.current?.click()} disabled={uploading}>
                Escolher arquivos
              </button>
              <small>{SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')} · vários arquivos · nada é salvo ainda</small>
            </div>}
            {!editingTrack && pendingFiles.length > 0 && (
              <div className="music-pending-files">
                <strong>{pendingFiles.length} arquivo(s) selecionado(s)</strong>
                {pendingFiles.map((file, index) => (
                  <div className="music-pending-file" key={`${file.file.name}-${file.file.lastModified}-${index}`}>
                    <span><strong>{file.title}</strong> · {file.artist || 'Autor não encontrado'}<small>{file.file.name} · {file.album}</small></span>
                    <button type="button" className="track-remove" onClick={() => setPendingFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${file.file.name}`}>×</button>
                  </div>
                ))}
                <button type="button" className="music-confirm-upload" onClick={() => void confirmUpload()} disabled={uploading}>
                  {uploading ? 'Adicionando…' : 'Confirmar e adicionar músicas'}
                </button>
              </div>
            )}

            {editingTrack && <button type="button" className="music-confirm-upload" onClick={saveEdit}>Salvar alterações</button>}
          </section>
        </div>
      )}

      {shareOpen && (
        <div className="music-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeShare(); }}>
          <section className="music-modal music-share-modal" role="dialog" aria-modal="true" aria-labelledby="music-share-title">
            <div className="music-modal-head">
              <h2 id="music-share-title">Compartilhar músicas</h2>
              <button className="track-remove" style={{ opacity: 1 }} onClick={closeShare} aria-label="Fechar">×</button>
            </div>
            {shareMode === 'choose' && (
              <>
                <p className="muted">Escolha o que deseja fazer com as músicas.</p>
                <div className="music-share-options">
                  <button className="primary" onClick={() => { setShareMode('send'); setSelectionMode(true); setShareOpen(false); }}>Enviar músicas</button>
                  <button className="ghost" onClick={() => { setShareMode('receive'); setSelectionMode(false); }}>Receber músicas</button>
                </div>
              </>
            )}
            {shareMode === 'send' && (
              <>
                <p className="muted">Marque as músicas na lista e volte aqui para gerar um código. O código expira em 24 horas e só pode ser usado uma vez.</p>
                <button className="music-confirm-upload" onClick={() => void createMusicShare()} disabled={!selectedTrackIds.length || sharing}>
                  {sharing ? 'Preparando pacote…' : `Gerar código (${selectedTrackIds.length} selecionada(s))`}
                </button>
                {shareCode && <div className="music-share-code"><span>Código para enviar</span><strong>{shareCode}</strong><button className="ghost" onClick={() => void copyShareCode()}><IconCopy size={16} /> {copied ? 'Copiado' : 'Copiar código'}</button></div>}
                <button className="ghost share-back-button" onClick={() => { setShareMode('choose'); setSelectionMode(false); setSelectedTrackIds([]); }}>Voltar</button>
              </>
            )}
            {shareMode === 'receive' && (
              <>
                <p className="muted">Digite o código recebido. O pacote será baixado e as músicas serão importadas para sua biblioteca.</p>
                <label>Código recebido
                  <input
                    autoFocus
                    value={claimCode}
                    onChange={(event) => setClaimCode(event.target.value.replace(/[\s-]/g, '').toUpperCase())}
                    placeholder="Ex.: A1B2C3D4E5"
                    maxLength={10}
                    inputMode="text"
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="primary" onClick={() => void claimMusicShare()} disabled={!claimCode.trim() || sharing}>{sharing ? 'Baixando pacote…' : 'Baixar e importar pacote'}</button>
                <button className="ghost share-back-button" onClick={() => setShareMode('choose')}>Voltar</button>
              </>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
