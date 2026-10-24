import { useEffect, useState } from 'react';
import { isDesktopApp } from './desktop';

/** Arquivos publicados em `public/downloads` (copiados para o build). */
export const WINDOWS_URL = '/downloads/sano-windows.exe';
const MANIFEST_URL = '/downloads/windows.json';

export interface WindowsRelease {
  version: string;
  /** Tamanho do instalador em bytes. */
  size: number;
  releasedAt: string;
  notes: string[];
}

let releaseCache: Promise<WindowsRelease | null> | null = null;
const fetchWindowsRelease = () => {
  releaseCache ??= fetch(MANIFEST_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<WindowsRelease>) : null))
    .catch(() => null);
  return releaseCache;
};

/** "0.10.0" > "0.9.2": compara número a número. */
const isNewer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

/** Última versão publicada + versão instalada (quando dentro do app Windows). */
export function useWindowsRelease() {
  const [release, setRelease] = useState<WindowsRelease | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchWindowsRelease().then((r) => { if (alive) setRelease(r); });
    return () => { alive = false; };
  }, []);
  const installed = isDesktopApp() ? window.SanoDesktop!.version : null;
  const outdated = Boolean(release && installed && isNewer(release.version, installed));
  return { release, installed, outdated };
}
