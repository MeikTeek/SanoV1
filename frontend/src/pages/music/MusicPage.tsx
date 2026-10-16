import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import AppShell from '../../components/layout/AppShell';
import { IconPlay, IconPlus, IconSearch } from '../../components/ui/icons';
import { useMusic } from '../../music/musicStore';
import { getAudioFormat, isAudioFile, SUPPORTED_AUDIO_ACCEPT, SUPPORTED_AUDIO_EXTENSIONS } from '../../music/musicTypes';

function Equalizer() {
  return (
    <span className="track-eq" aria-label="Tocando agora">
      <i /><i /><i />
    </span>
  );
}

export default function MusicPage() {
  const { tracks, playlists, current, playing, play, addFiles, remove, search, createPlaylist, deletePlaylist, playPlaylist } = useMusic();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [title, setTitle] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const found = search(query);
  const artists = Array.from(new Set(tracks.map((t) => t.artist).filter(Boolean))).sort();
  const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean))).sort();
  const moods = Array.from(new Set(tracks.map((t) => t.mood).filter(Boolean))).sort();
  const visible = found.filter((track) =>
    (!artistFilter || track.artist === artistFilter) &&
    (!genreFilter || track.genre === genreFilter) &&
    (!moodFilter || track.mood === moodFilter) &&
    (!playlistFilter || playlists.find((playlist) => playlist.id === playlistFilter)?.trackIds.includes(track.id)),
  );

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
    setPendingFiles([]);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Selecionar/soltar apenas prepara a prévia. O IndexedDB só é alterado em
  // confirmUpload, depois que o usuário revisar os dados.
  const stageFiles = (files: File[]) => {
    if (!files.length || uploading) return;
    const audio = files.filter(isAudioFile);
    const rejectedNames = files.filter((file) => !isAudioFile(file)).map((file) => file.name);
    if (rejectedNames.length) {
      setMessage({ text: `Arquivo(s) não suportado(s): ${rejectedNames.join(', ')}`, error: true });
    } else {
      setMessage(null);
    }
    if (audio.length) setPendingFiles((currentFiles) => [...currentFiles, ...audio]);
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
      await addFiles(pendingFiles, {
        artist: artist.trim() || 'Artista independente',
        album: 'Uploads do Sano',
        genre: genre.trim() || 'Geral',
        mood,
        title,
        playlistId: playlistId || undefined,
      });
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
    stageFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    stageFiles(Array.from(event.dataTransfer.files));
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

  const emptyTitle = tracks.length ? 'Nada encontrado' : 'Sua biblioteca começa aqui';
  const emptyText = tracks.length
    ? 'Tente outro termo de busca ou limpe o filtro de clima.'
    : `Adicione arquivos ${SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')}. A reprodução depende do suporte do navegador.`;

  return (
    <AppShell
      title="Música"
      status={`${tracks.length} na sua biblioteca`}
      actions={<button className="ghost music-add-button" onClick={() => setUploadOpen(true)}><IconPlus size={16} /> Criar</button>}
    >
      <div className="music-page">
        <aside className="music-library-nav" aria-label="Sua biblioteca">
          <div className="music-library-title">
            <strong>Sua biblioteca</strong>
            <button className="icon-btn" onClick={() => setUploadOpen(true)} aria-label="Adicionar música"><IconPlus size={17} /></button>
          </div>
          <button className="music-library-item active" aria-current="page">♫ Músicas</button>
          <button className="music-library-item" disabled title="Em breve">♡ Músicas curtidas</button>
          <button className={`music-library-item${playlistFilter === '' ? '' : ' active'}`} onClick={() => setPlaylistFilter('')}>▦ Playlists</button>
          {playlists.map((playlist) => (
            <div className="music-playlist-item" key={playlist.id}>
              <button className={`music-library-item${playlistFilter === playlist.id ? ' active' : ''}`} onClick={() => setPlaylistFilter(playlist.id)} title={`Tocar playlist ${playlist.name}`}>
                {playlist.name}
              </button>
              <button className="music-playlist-play" onClick={() => playPlaylist(playlist)} aria-label={`Tocar playlist ${playlist.name}`}>▶</button>
              <button className="music-playlist-delete" onClick={() => { deletePlaylist(playlist.id); if (playlistFilter === playlist.id) setPlaylistFilter(''); }} aria-label={`Excluir playlist ${playlist.name}`}>×</button>
            </div>
          ))}
          <button className="music-library-item music-create-playlist" onClick={() => setUploadOpen(true)}>＋ Nova playlist</button>
        </aside>

        <main className="music-main-column">
          <section
            className={`music-hero${dragging ? ' dragover' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div>
              <span className="eyebrow">Sua biblioteca</span>
              <h2>Trilha sonora do seu dia.</h2>
              <p>Envie suas músicas, organize por clima e peça ao Sano para tocar o que você quiser. Você também pode soltar arquivos aqui.</p>
            </div>
            <button onClick={() => setUploadOpen(true)}>Adicionar músicas</button>
          </section>

          <input ref={inputRef} hidden type="file" accept={SUPPORTED_AUDIO_ACCEPT} multiple onChange={onPick} />

          {message && <p className={`music-message${message.error ? ' error' : ''}`} role="status">{message.text}</p>}

          <div className="music-search">
            <IconSearch />
            <input
              type="search"
              aria-label="Buscar músicas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, artista ou álbum"
            />
          </div>

          <div className="music-filters" aria-label="Filtros da biblioteca">
            <select aria-label="Filtrar por autor" value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)}>
              <option value="">Todos os autores</option>{artists.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Filtrar por gênero" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
              <option value="">Todos os gêneros</option>{genres.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Filtrar por clima" value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}>
              <option value="">Todos os climas</option>{moods.map((item) => <option key={item}>{item}</option>)}
            </select>
            {(artistFilter || genreFilter || moodFilter || playlistFilter) && <button className="ghost" onClick={() => { setArtistFilter(''); setGenreFilter(''); setMoodFilter(''); setPlaylistFilter(''); }}>Limpar filtros</button>}
          </div>

          {moods.length > 1 && (
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
            <h3>Suas músicas</h3>
            <span>{visible.length} {visible.length === 1 ? 'resultado' : 'resultados'}</span>
          </div>

          <div className="track-list">
            {visible.map((track, index) => {
              const isCurrent = current?.id === track.id;
              return (
                <div
                  className={`track-row${isCurrent ? ' playing' : ''}`}
                  key={track.id}
                  onDoubleClick={() => play(track, visible.slice(index + 1))}
                >
                  <span className="track-index">{isCurrent && playing ? <Equalizer /> : index + 1}</span>
                  <div className="track-art" aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</div>
                  <div className="track-info">
                    <strong title={track.title}>{track.title}</strong>
                    <span>{track.artist} · {track.genre} · {track.mood}</span>
                    <small className="track-format">Formato: {getAudioFormat(track.fileName) || 'desconhecido'}</small>
                  </div>
                  <button className="icon-btn track-play" onClick={() => play(track, visible.slice(index + 1))} aria-label={`Tocar ${track.title}`}><IconPlay /></button>
                  <button className="track-remove" onClick={() => remove(track.id)} aria-label={`Remover ${track.title}`}>×</button>
                </div>
              );
            })}
            {!visible.length && (
              <div className="music-empty">
                <h3>{playlistFilter ? playlists.find((p) => p.id === playlistFilter)?.name || emptyTitle : emptyTitle}</h3>
                <p>{emptyText}</p>
              </div>
            )}
          </div>
        </main>

        <aside className="music-side-panel" aria-label="Tocando agora">
          <span className="eyebrow">Tocando agora</span>
          <div className="music-side-art" aria-hidden="true">{current?.title.slice(0, 1).toUpperCase() || '♪'}</div>
          <h3>{current?.title || 'Sua biblioteca'}</h3>
          <p>{current?.artist || 'Adicione uma música para começar'}</p>
          <button className="ghost" onClick={() => setUploadOpen(true)}><IconPlus size={15} /> Adicionar música</button>
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
              <h2 id="music-modal-title">Adicione à sua biblioteca</h2>
              <button className="track-remove" style={{ opacity: 1 }} onClick={closeUpload} aria-label="Fechar">×</button>
            </div>
            <p className="muted">Escolha um ou mais arquivos e complete os detalhes para encontrá-los depois.</p>
            <div className="music-upload-fields">
              <label>Autor * <input list="music-artists" autoFocus required value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ex.: Liniker" /></label>
              <datalist id="music-artists">{artists.map((item) => <option key={item} value={item} />)}</datalist>
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
            <div
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
            </div>
            {pendingFiles.length > 0 && (
              <div className="music-pending-files">
                <strong>{pendingFiles.length} arquivo(s) selecionado(s)</strong>
                {pendingFiles.map((file, index) => (
                  <div className="music-pending-file" key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" className="track-remove" onClick={() => setPendingFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${file.name}`}>×</button>
                  </div>
                ))}
                <button type="button" className="music-confirm-upload" onClick={() => void confirmUpload()} disabled={uploading}>
                  {uploading ? 'Adicionando…' : 'Confirmar e adicionar músicas'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
