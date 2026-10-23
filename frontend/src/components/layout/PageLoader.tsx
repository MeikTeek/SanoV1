import { useEffect, useState } from 'react';
import { network } from '../../services/api';

/** Tempo mínimo na tela: evita um "piscar" quando os dados chegam na hora. */
const MIN_MS = 350;
/** Quanto tempo a rede precisa ficar parada para a tela ser considerada pronta. */
const QUIET_MS = 160;
/** Limite: com rede lenta, mostra a página do jeito que estiver. */
const MAX_MS = 4000;

/**
 * Fica `true` desde a montagem até a rede assentar: nenhuma requisição pendente
 * por QUIET_MS (pega cadeias "carrega A, depois B"), respeitando MIN/MAX.
 */
export function usePageReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const idle = network.pending() === 0 && network.quietFor() >= QUIET_MS;
      if ((elapsed >= MIN_MS && idle) || elapsed >= MAX_MS) {
        window.clearInterval(timer);
        setReady(true);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, []);
  return ready;
}

/** Tela de carregamento: marca do Sano pulsando, nome do módulo e barra. */
export default function PageLoader({ label, leaving = false, fullscreen = false }: {
  label?: string;
  leaving?: boolean;
  fullscreen?: boolean;
}) {
  return (
    <div className={`page-loader${leaving ? ' leaving' : ''}${fullscreen ? ' fullscreen' : ''}`} role="status" aria-live="polite">
      <div className="page-loader-mark" aria-hidden="true">
        <span className="page-loader-ring" />
        <span className="page-loader-ring delay" />
        <span className="page-loader-logo">S</span>
      </div>
      <span className="page-loader-label">{label ? `Carregando ${label}` : 'Carregando'}</span>
      <span className="page-loader-bar" aria-hidden="true"><i /></span>
    </div>
  );
}
