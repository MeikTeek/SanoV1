import { useRef } from 'react';

/** Histórico de comandos navegável com ↑ / ↓, como num terminal. */
export function useCommandHistory(limit = 50) {
  const items = useRef<string[]>([]);
  const idx = useRef(-1);

  const push = (cmd: string) => {
    if (items.current[0] !== cmd) items.current = [cmd, ...items.current].slice(0, limit);
    idx.current = -1;
  };

  const prev = (): string | null => {
    if (!items.current.length) return null;
    if (idx.current < items.current.length - 1) idx.current++;
    return items.current[idx.current];
  };

  const next = (): string | null => {
    if (idx.current <= 0) {
      idx.current = -1;
      return '';
    }
    idx.current--;
    return items.current[idx.current];
  };

  return { push, prev, next };
}