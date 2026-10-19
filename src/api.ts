export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'X-Requested-With': 'arvono-labels', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => ({ error: `Request failed (HTTP ${response.status}).` }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/share') && path !== '/login') window.dispatchEvent(new Event('arvono:signed-out'));
    throw new ApiError(response.status, result.error ?? 'Request failed.');
  }
  return result as T;
}
