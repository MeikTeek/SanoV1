import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import AppShell from '../../components/layout/AppShell';
import { IconPlay, IconPlus, IconSearch } from '../../components/ui/icons';
import { useMusic } from '../../music/musicStore';
import { isAudioFile, SUPPORTED_AUDIO_ACCEPT, SUPPORTED_AUDIO_EXTENSIONS } from '../../music/musicTypes';

function Equalizer() {
  return (
    <span className="track-eq" aria-label="Tocando agora">
      <i /><i /><i />
    </span>
  );
}

export default function MusicPage() {
  const { tracks, current, playing, play, addFiles, remove, search } = useMusic();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('calma');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const found = search(query);
  const visible = moodFilter ? found.filter((t) => t.mood === moodFilter) : found;
  const moods = Array.from(new Set(tracks.map((t) => t.mood).filter(Boolean)));

  // Fecha o modal com Esc
  useEffect(() => {
    if (!uploadOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUploadOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uploadOpen]);

  // Se o filtro de clima deixar de existir (ex.: removeu a última música), limpa
  useEffect(() => {
    if (moodFilter && !moods.includes(moodFilter)) setMoodFilter(null);
  }, [moodFilter, moods]);

  // Único ponto de upload (seletor de arquivos e arrastar e soltar)
  const uploadFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    const audio = files.filter(isAudioFile);
    if (!audio.length) {
      setMessage({ text: `Nenhum arquivo de áudio encontrado. Use ${SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')}.`, error: true });
      return;
    }
    const ignored = files.length - audio.length;
    setUploading(true);
    setMessage(null);
    try {
      await addFiles(audio, {
        artist: artist.trim() || 'Artista independente',
        album: 'Uploads do Sano',
        genre: genre.trim() || 'Geral',
        mood,
      });
      const added = `${audio.length} ${audio.length === 1 ? 'música adicionada' : 'músicas adicionadas'} à sua biblioteca.`;
      setMessage({ text: ignored ? `${added} ${ignored} arquivo(s) que não eram áudio foram ignorados.` : added });
      setUploadOpen(false);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível adicionar as músicas.', error: true });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => void uploadFiles(Array.from(event.target.files || []));

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  };
  const onDragOver = (event: DragEvent) => { event.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

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
          <button className="music-library-item" disabled title="Em breve">▦ Playlists</button>
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

          {moods.length > 1 && (
            <div className="music-chips" role="group" aria-label="Filtrar por clima">
              <button className={`music-chip${moodFilter === null ? ' active' : ''}`} onClick={() => setMoodFilter(null)}>Todas</button>
              {moods.map((m) => (
                <button
                  key={m}
                  className={`music-chip${moodFilter === m ? ' active' : ''}`}
                  aria-pressed={moodFilter === m}
                  onClick={() => setMoodFilter(moodFilter === m ? null : m)}
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
                  </div>
                  <button className="icon-btn track-play" onClick={() => play(track, visible.slice(index + 1))} aria-label={`Tocar ${track.title}`}><IconPlay /></button>
                  <button className="track-remove" onClick={() => remove(track.id)} aria-label={`Remover ${track.title}`}>×</button>
                </div>
              );
            })}
            {!visible.length && (
              <div className="music-empty">
                <h3>{emptyTitle}</h3>
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
          onMouseDown={(event) => { if (event.target === event.currentTarget) setUploadOpen(false); }}
        >
          <section className="music-modal" role="dialog" aria-modal="true" aria-labelledby="music-modal-title">
            <div className="music-modal-head">
              <h2 id="music-modal-title">Adicione à sua biblioteca</h2>
              <button className="track-remove" style={{ opacity: 1 }} onClick={() => setUploadOpen(false)} aria-label="Fechar">×</button>
            </div>
            <p className="muted">Escolha um ou mais arquivos e complete os detalhes para encontrá-los depois.</p>
            <div className="music-upload-fields">
              <label>Artista <input autoFocus value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ex.: Liniker" /></label>
              <label>Gênero <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Ex.: Indie pop" /></label>
              <label>Clima
                <select value={mood} onChange={(e) => setMood(e.target.value)}>
                  <option>calma</option><option>agressiva</option><option>foco</option><option>feliz</option><option>melancólica</option>
                </select>
              </label>
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
                {uploading ? 'Adicionando…' : 'Escolher arquivos'}
              </button>
              <small>{SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')} · vários arquivos</small>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
