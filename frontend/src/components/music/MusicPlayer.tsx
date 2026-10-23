import { useEffect, useRef, type CSSProperties } from 'react';
import { useMusic } from '../../music/musicStore';
import { IconBack, IconPause, IconPlay } from '../ui/icons';
import MusicCover from './MusicCover';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function IconVolume({ level }: { level: 'mute' | 'low' | 'high' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 4V5L7 9H3z" />
      {level === 'low' && <path d="M15.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2l1.4-1.4z" />}
      {level === 'high' && (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2l1.4-1.4z" />
          <path d="M18.4 5.6a9 9 0 0 1 0 12.8l-1.4-1.4a7 7 0 0 0 0-10l1.4-1.4z" />
        </>
      )}
      {level === 'mute' && (
        <path d="M16 9.4 17.4 8l2.1 2.1L21.6 8 23 9.4 20.9 11.5 23 13.6 21.6 15l-2.1-2.1L17.4 15 16 13.6l2.1-2.1L16 9.4z" />
      )}
    </svg>
  );
}

export default function MusicPlayer() {
  const { current, playing, progress, duration, volume, error, queue, toggle, next, previous, setProgress, setVolume, toggleFavorite } = useMusic();
  const lastVolume = useRef(0.7);

  // Espaço toca/pausa de qualquer tela, menos quando se está digitando.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, button, [contenteditable="true"], a')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, toggle]);

  if (!current) return null;

  const hasDuration = duration > 0;
  const max = hasDuration ? duration : 1;
  const value = Math.min(progress, max);
  const progressPct = hasDuration ? (value / max) * 100 : 0;
  const volumeLevel = volume === 0 ? 'mute' : volume < 0.5 ? 'low' : 'high';

  const toggleMute = () => {
    if (volume > 0) {
      lastVolume.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolume.current || 0.7);
    }
  };

  return (
    <div className={`music-player${playing ? ' is-playing' : ''}`} role="region" aria-label="Player de música">
      <span className="music-player-glow" style={{ '--progress': `${progressPct}%` } as CSSProperties} aria-hidden="true" />
      <div className="music-now">
        <MusicCover src={current.coverDataUrl} title={current.title} className={`music-cover${playing ? ' is-playing' : ''}`} />
        <div className="music-now-text" key={current.id}>
          <strong title={current.title}>{current.title}</strong>
          {error
            ? <button type="button" className="music-player-error" onClick={toggle} title="Tentar novamente">{error}</button>
            : <span>{current.artist || 'Artista desconhecido'}</span>}
        </div>
        <button
          type="button"
          className={`player-btn player-fav${current.favorite ? ' on' : ''}`}
          onClick={() => void toggleFavorite(current.id)}
          aria-pressed={current.favorite}
          aria-label={current.favorite ? 'Desfavoritar' : 'Favoritar'}
          title={current.favorite ? 'Desfavoritar' : 'Favoritar'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={current.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
          </svg>
        </button>
      </div>

      <div className="music-controls">
        <div className="music-buttons">
          <button type="button" className="player-btn" onClick={previous} aria-label="Anterior">
            <IconBack />
          </button>
          <button type="button" className="player-main" onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'} title={`${playing ? 'Pausar' : 'Tocar'} (espaço)`}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="player-btn" onClick={next} aria-label="Próxima" title={queue[0] ? `Próxima: ${queue[0].title}` : 'Próxima'}>
            <IconBack size={20} />
          </button>
        </div>

        <div className="music-progress">
          <span className="music-time">{formatTime(value)}</span>
          <input
            aria-label="Progresso da música"
            aria-valuetext={`${formatTime(value)} de ${formatTime(duration)}`}
            type="range"
            min="0"
            max={max}
            step="0.1"
            value={value}
            disabled={!hasDuration}
            style={{ '--progress': `${progressPct}%` } as CSSProperties}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
          <span className="music-time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="music-volume">
        <button
          type="button"
          className="player-btn"
          onClick={toggleMute}
          aria-label={volume === 0 ? 'Ativar som' : 'Silenciar'}
        >
          <IconVolume level={volumeLevel} />
        </button>
        <input
          aria-label="Volume"
          aria-valuetext={`${Math.round(volume * 100)}%`}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          style={{ '--progress': `${volume * 100}%` } as CSSProperties}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
