import { api, ApiError } from './api';
import type { DomainStreamLine, EmailStreamLine, OsintCatalog, UsernameStreamLine } from '../types/osint';

/**
 * As varreduras respondem em NDJSON (um JSON por linha) para a tela ir
 * preenchendo enquanto o servidor ainda trabalha. `signal` cancela a busca.
 */
async function streamNdjson<T>(path: string, body: unknown, onLine: (line: T) => void, signal?: AbortSignal) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    const details = data.details ? Object.values(data.details).flat().join(' · ') : '';
    throw new ApiError(res.status, [data.error ?? 'Erro inesperado', details].filter(Boolean).join(': '));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onLine(JSON.parse(line) as T);
    }
  }
  if (buffer.trim()) onLine(JSON.parse(buffer) as T);
}

export const osintApi = {
  catalog: () => api.get<OsintCatalog>('/osint'),
  variations: (username: string) => api.get<{ variations: string[] }>(`/osint/variations?username=${encodeURIComponent(username)}`),
  scanDomain: (target: string, onLine: (l: DomainStreamLine) => void, signal?: AbortSignal) =>
    streamNdjson('/osint/domain', { target }, onLine, signal),
  scanEmail: (email: string, onLine: (l: EmailStreamLine) => void, signal?: AbortSignal) =>
    streamNdjson('/osint/email', { email }, onLine, signal),
  scanUsername: (
    input: { usernames: string[]; categories?: string[]; nsfw?: boolean },
    onLine: (l: UsernameStreamLine) => void,
    signal?: AbortSignal,
  ) => streamNdjson('/osint/username', input, onLine, signal),
};
