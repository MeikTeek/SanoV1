import { useMusic } from '../../music/musicStore';
import { IconBack, IconPause, IconPlay } from '../ui/icons';

export default function MusicPlayer() {
  const { current, playing, progress, duration, volume, toggle, next, previous, setProgress, setVolume } = useMusic();
  if (!current) return null;
  return (
    <div className="music-player" aria-label="Player de música">
      <div className="music-now">
        <div className="music-cover">{current.title.slice(0, 1).toUpperCase()}</div>
        <div><strong>{current.title}</strong><span>{current.artist || 'Artista desconhecido'}</span></div>
      </div>
      <div className="music-controls">
        <div className="music-buttons">
          <button className="player-btn" onClick={previous} aria-label="Anterior"><IconBack /></button>
          <button className="player-main" onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>{playing ? <IconPause /> : <IconPlay />}</button>
          <button className="player-btn" onClick={next} aria-label="Próxima"><IconBack size={20} /></button>
        </div>
        <input aria-label="Progresso da música" type="range" min="0" max={duration || 1} value={Math.min(progress, duration || 1)} onChange={(e) => setProgress(Number(e.target.value))} />
      </div>
      <label className="music-volume">Volume <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
    </div>
  );
}
