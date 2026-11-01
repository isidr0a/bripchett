import { apiOrigin } from '../config';
export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public status = 0,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiOrigin + '/api/v1' + path, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiFailure(
      'NETWORK',
      'No hay conexión con el servidor. Conservamos tus datos para reintentar.',
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiFailure(
      data.error?.code || 'SERVER',
      data.error?.message || 'No se pudo completar la solicitud.',
      data.error?.details,
      response.status,
    );
  }
  return data as T;
}
