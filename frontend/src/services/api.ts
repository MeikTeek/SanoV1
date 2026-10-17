export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const rawBody = body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': rawBody ? 'application/zip' : 'application/json' } : undefined,
    body: body ? (rawBody ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details ? Object.values(data.details).flat().join(' · ') : '';
    throw new ApiError(res.status, [data.error ?? 'Erro inesperado', details].filter(Boolean).join(': '));
  }
  return data as T;
}

async function requestBlob(method: string, path: string, body?: unknown): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const details = data.details ? Object.values(data.details).flat().join(' · ') : '';
    throw new ApiError(res.status, [data.error ?? 'Erro inesperado', details].filter(Boolean).join(': '));
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  postBlob: (path: string, body?: unknown) => requestBlob('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
