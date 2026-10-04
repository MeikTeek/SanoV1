import { useEffect, useRef, useState } from 'react';
import { IconMic, IconStop } from '../ui/icons';

export interface Recording {
  blob: Blob;
  mime: string;
  seconds: number;
}

interface Props {
  /** Recebe a gravação pronta para cifrar e enviar. */
  onRecorded: (recording: Recording) => void;
  disabled?: boolean;
}

const MAX_SECONDS = 120;

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Grava áudio com `MediaRecorder` e devolve o blob bruto.
 *
 * O arquivo NÃO é cifrado aqui de propósito: a gravação sai do componente já
 * pronta e quem cifra é a camada do chat, com a chave da conversa. Assim a
 * gravação nunca existe em claro depois de solta.
 *
 * O formato do arquivo é negociado com o navegador: nem todos aceitam
 * `audio/webm`.
 */
export default function AudioRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Libera a microfone ao desmontar: sem isso o indicador do sistema fica aceso.
  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Preferimos Opus/WebM; caímos para o que o navegador der.
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

      const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];

      media.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      media.onstop = () => {
        const type = media.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        stopEverything();
        setRecording(false);
        setSeconds(0);
        if (blob.size > 0) onRecorded({ blob, mime: type, seconds: Math.max(1, Math.round(blob.size / 16_000)) });
      };

      media.start();
      mediaRef.current = media;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          // Corta em 2 minutos para não estourar o limite do envelope.
          if (s + 1 >= MAX_SECONDS) media.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError('Não consegui acessar o microfone. Verifique a permissão do navegador.');
    }
  };

  const stop = () => mediaRef.current?.stop();

  return (
    <>
      <button
        className={`icon-btn ${recording ? 'rec' : ''}`}
        onClick={() => (recording ? stop() : void start())}
        disabled={disabled}
        title={recording ? 'Parar e enviar' : 'Gravar áudio'}
        aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
      >
        {recording ? <IconStop /> : <IconMic />}
      </button>
      {recording && <span className="rec-dot" aria-live="polite">gravando {fmt(seconds)}</span>}
      {error && <span className="rec-error">{error}</span>}
    </>
  );
}