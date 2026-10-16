import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { parseBlob } from 'music-metadata';
import AppShell from '../../components/layout/AppShell';
import { IconPlay, IconPlus, IconSearch } from '../../components/ui/icons';
import { useMusic } from '../../music/musicStore';
import { getAudioFormat, isAudioFile, SUPPORTED_AUDIO_ACCEPT, SUPPORTED_AUDIO_EXTENSIONS, type EditableMusicMetadata, type MusicTrack } from '../../music/musicTypes';
import { api } from '../../services/api';

interface PendingMusicFile {
  file: File;
  title: string;
  artist: string;
  album: string;
}

function Equalizer() {
  return (
    <span className="track-eq" aria-label="Tocando agora">
      <i /><i /><i />
    </span>
  );
}

export default function MusicPage() {
  const { tracks, playlists, current, playing, play, addFiles, updateTrack, remove, search, createPlaylist, deletePlaylist, playPlaylist, exportPackage, importPackage } = useMusic();
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

  const claimMusicShare = async () => {
    if (!claimCode.trim() || sharing) return;
    setSharing(true);
    try {
      const result = await api.post<{ downloadUrl: string }>('/music/shares/claim', { code: claimCode });
      const response = await fetch(result.downloadUrl);
      if (!response.ok) throw new Error('Não foi possível baixar o pacote.');
      const blob = await response.blob();
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
            <div className="music-share-actions">
              <span>{visible.length} {visible.length === 1 ? 'resultado' : 'resultados'}</span>
              <button className="ghost" onClick={selectionMode ? openSendShare : openShare}>{selectionMode ? `Gerar código (${selectedTrackIds.length})` : 'Compartilhar lista'}</button>
            </div>
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
                  {selectionMode && <label className="track-select" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTrackIds.includes(track.id)}
                        onChange={() => setSelectedTrackIds((ids) => ids.includes(track.id) ? ids.filter((id) => id !== track.id) : [...ids, track.id])}
                        aria-label={`Selecionar ${track.title} para compartilhar`}
                      />
                    </label>}
                  <span className="track-index">{isCurrent && playing ? <Equalizer /> : index + 1}</span>
                  <div className="track-art" aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</div>
                  <div className="track-info">
                    <strong title={track.title}>{track.title}</strong>
                    <span>{track.artist} · {track.genre} · {track.mood}</span>
                    <small className="track-format">Formato: {getAudioFormat(track.fileName) || 'desconhecido'}</small>
                  </div>
                  <button className="icon-btn track-play" onClick={() => play(track, visible.slice(index + 1))} aria-label={`Tocar ${track.title}`}><IconPlay /></button>
                  <button className="track-edit" onClick={() => openEdit(track)}>Editar</button>
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
                {shareCode && <div className="music-share-code"><span>Código para enviar</span><strong>{shareCode}</strong></div>}
                <button className="ghost share-back-button" onClick={() => { setShareMode('choose'); setSelectionMode(false); setSelectedTrackIds([]); }}>Voltar</button>
              </>
            )}
            {shareMode === 'receive' && (
              <>
                <p className="muted">Digite o código recebido. O pacote será baixado e as músicas serão importadas para sua biblioteca.</p>
                <label>Código recebido
                  <input autoFocus value={claimCode} onChange={(event) => setClaimCode(event.target.value.toUpperCase())} placeholder="Ex.: A1B2C3D4E5" maxLength={10} />
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
