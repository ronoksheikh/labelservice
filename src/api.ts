export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'X-Requested-With': 'twobytes', ...(init.body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }) },
    ...(init.body === undefined ? {} : { body: isForm ? (init.body as FormData) : JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => ({ error: `Request failed (HTTP ${response.status}).` }));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/admin/') && path !== '/admin/login') window.dispatchEvent(new Event('twobytes:admin-signed-out'));
    throw new ApiError(response.status, result.error ?? 'Request failed.');
  }
  return result as T;
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
