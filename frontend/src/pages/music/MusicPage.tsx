import { useRef, useState, type ChangeEvent } from 'react';
import AppShell from '../../components/layout/AppShell';
import { IconPlay, IconPlus, IconSearch } from '../../components/ui/icons';
import { useMusic } from '../../music/musicStore';

export default function MusicPage() {
  const { tracks, current, play, addFiles, remove, search } = useMusic();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('calma');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const visible = search(query);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setMessage('');
    try {
      await addFiles(files, { artist: artist || 'Artista independente', album: 'Uploads do Sano', genre: genre || 'Geral', mood });
      setMessage(`${files.length} ${files.length === 1 ? 'música adicionada' : 'músicas adicionadas'} à sua biblioteca.`);
      setUploadOpen(false);
      event.target.value = '';
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar as músicas.');
    } finally { setUploading(false); }
  };
  const uploadDropped = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      await addFiles(files, { artist: artist || 'Artista independente', album: 'Uploads do Sano', genre: genre || 'Geral', mood });
      setMessage(`${files.length} ${files.length === 1 ? 'música adicionada' : 'músicas adicionadas'} à sua biblioteca.`);
      setUploadOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar as músicas.');
    } finally { setUploading(false); }
  };

  return (
    <AppShell title="Música" status={`${tracks.length} na sua biblioteca`} actions={<button className="ghost music-add-button" onClick={() => setUploadOpen(true)}><IconPlus size={16} /> Criar</button>}>
      <div className="music-page">
        <aside className="music-library-nav">
          <div className="music-library-title"><strong>Sua Biblioteca</strong><button className="icon-btn" onClick={() => setUploadOpen(true)} aria-label="Adicionar música"><IconPlus size={17} /></button></div>
          <button className="music-library-item active">♫ Músicas</button>
          <button className="music-library-item">♡ Músicas curtidas</button>
          <button className="music-library-item">▦ Playlists</button>
        </aside>
        <main className="music-main-column">
          <section className="music-hero" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadDropped(Array.from(event.dataTransfer.files)); }}>
            <div><span className="eyebrow">SUA BIBLIOTECA</span><h2>Trilha sonora do seu dia.</h2><p>Envie suas músicas, organize por humor e peça ao Sano para tocar o que você quiser.</p></div>
          </section>
          <input ref={inputRef} hidden type="file" accept="audio/*" multiple onChange={upload} />
        {message && <p className="music-message">{message}</p>}
        <div className="music-search"><IconSearch /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, artista ou álbum" /></div>
        <div className="music-section-head"><h3>Suas músicas</h3><span>{visible.length} resultados</span></div>
        <div className="track-list">
          {visible.map((track, index) => <div className="track-row" key={track.id}>
            <span className="track-index">{index + 1}</span><div className="track-art">{track.title.slice(0, 1).toUpperCase()}</div>
            <div className="track-info"><strong>{track.title}</strong><span>{track.artist} · {track.genre} · {track.mood}</span></div>
            <button className="icon-btn track-play" onClick={() => play(track, visible.slice(index + 1))} aria-label={`Tocar ${track.title}`}><IconPlay /></button>
            <button className="track-remove" onClick={() => remove(track.id)} aria-label={`Remover ${track.title}`}>×</button>
          </div>)}
          {!visible.length && <div className="music-empty"><h3>Sua biblioteca começa aqui</h3><p>Adicione arquivos MP3, WAV, OGG ou outros formatos suportados pelo navegador.</p></div>}
        </div>
        </main>
        <aside className="music-side-panel">
          <span className="eyebrow">SUA MÚSICA</span>
          <div className="music-side-art">{current?.title.slice(0, 1).toUpperCase() || '♪'}</div>
          <h3>{current?.title || 'Sua biblioteca'}</h3>
          <p>{current?.artist || 'Adicione uma música para começar'}</p>
          <button className="ghost" onClick={() => setUploadOpen(true)}><IconPlus size={15} /> Adicionar música</button>
        </aside>
      </div>
      {uploadOpen && <div className="music-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUploadOpen(false); }}>
        <section className="music-modal" role="dialog" aria-modal="true" aria-labelledby="music-modal-title">
          <div className="music-modal-head"><div><span className="eyebrow">NOVA MÚSICA</span><h2 id="music-modal-title">Adicione à sua biblioteca</h2></div><button className="track-remove" onClick={() => setUploadOpen(false)} aria-label="Fechar">×</button></div>
          <p className="muted">Escolha um ou mais arquivos e complete os detalhes para encontrá-los depois.</p>
          <div className="music-upload-fields">
            <label>Artista <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ex.: Liniker" /></label>
            <label>Gênero <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Ex.: Indie pop" /></label>
            <label>Clima <select value={mood} onChange={(e) => setMood(e.target.value)}><option>calma</option><option>agressiva</option><option>foco</option><option>feliz</option><option>melancólica</option></select></label>
          </div>
          <div className="music-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadDropped(Array.from(event.dataTransfer.files)); }}>
            <strong>Arraste seus arquivos aqui</strong><span>ou</span><button onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? 'Adicionando…' : 'Escolher arquivos'}</button><small>MP3, WAV, OGG e formatos aceitos pelo navegador · vários arquivos</small>
          </div>
        </section>
      </div>}
    </AppShell>
  );
}
