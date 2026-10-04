import { useEffect, useRef, useState } from 'react';
import { IconPause, IconPlay } from '../ui/icons';

interface Props {
  /** URL de objeto já decifrada (criada no hook da tela). */
  url: string;
  /** Duração aproximada, exibida até o navegador carregar os metadados. */
  seconds?: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Player simples de áudio já decifrado.
 *
 * Usa um `<audio>` nativo em vez de desenhar a forma de onda: menos código e o
 * áudio continua acessível (controles do teclado, leitor de tela).
 */
export default function AudioPlayer({ url, seconds = 0 }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(seconds);
  const [total, setTotal] = useState(seconds);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
        setTotal(el.duration);
      }
    };
    const onEnd = () => setPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [url]);

  // Pausa se a URL mudar (outra mensagem) — evita áudio tocando sozinho.
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [url]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = Number(e.target.value);
    setCurrent(el.currentTime);
  };

  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={ref} src={url} preload="metadata" />
      <button className="icon-btn" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <span className="audio-time">{fmt(current)}</span>
      <input
        type="range"
        min={0}
        max={total || 1}
        step={0.1}
        value={current}
        onChange={seek}
        aria-label="Posição do áudio"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
      <span className="audio-time">{fmt(total)}</span>
    </div>
  );
}