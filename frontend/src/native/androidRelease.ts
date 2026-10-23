import { useEffect, useState } from 'react';
import { isNativeApp, nativeInfo, type NativeInfo } from './bridge';

/** Arquivos publicados em `public/downloads` (copiados para o build). */
export const APK_URL = '/downloads/sano-android.apk';
const MANIFEST_URL = '/downloads/android.json';

export interface AndroidRelease {
  version: string;
  build: number;
  /** Tamanho do APK em bytes. */
  size: number;
  releasedAt: string;
  notes: string[];
}

let releaseCache: Promise<AndroidRelease | null> | null = null;
export const fetchAndroidRelease = () => {
  releaseCache ??= fetch(MANIFEST_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<AndroidRelease>) : null))
    .catch(() => null);
  return releaseCache;
};

export const fmtSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Última versão publicada + versão instalada (quando dentro do app). */
export function useAndroidRelease() {
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [installed, setInstalled] = useState<NativeInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAndroidRelease().then((r) => { if (alive) setRelease(r); });
    if (isNativeApp()) void nativeInfo().then((i) => { if (alive) setInstalled(i); });
    return () => { alive = false; };
  }, []);
  const outdated = Boolean(release && installed && installed.build < release.build);
  return { release, installed, outdated };
}
