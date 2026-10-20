import { badRequest } from './errors';

export async function jsonBody(c: { req: { json: () => Promise<unknown> } }) {
  const value = await c.req.json().catch(() => undefined);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return badRequest('Send a JSON object.');
  return value as Record<string, unknown>;
}

export function str(value: unknown, field: string, { max = 200, required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') return badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) return badRequest(`${field} is required.`);
  if (trimmed.length > max) return badRequest(`${field} must be at most ${max} characters.`);
  return trimmed;
}

export function int(value: unknown, field: string, { min = 0, max = 10_000_000, nullable = false } = {}): number {
  if (nullable && (value === null || value === undefined || value === '')) return null as unknown as number;
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) {
    return badRequest(`${field} must be a whole number between ${min} and ${max}.`);
  }
  return number;
}

export const intOrNull = (value: unknown, field: string, options: { min?: number; max?: number } = {}) =>
  int(value, field, { ...options, nullable: true }) as number | null;

export function oneOf<T extends string>(value: unknown, field: string, options: readonly T[]): T {
  return options.includes(value as T) ? (value as T) : badRequest(`${field} must be one of: ${options.join(', ')}.`);
}

/** Absolute https URL or a path on this site (such as uploaded /media/…). */
export function url(value: unknown, field: string) {
  const text = str(value, field, { max: 1000 });
  if (text && !/^(https:\/\/|\/(?!\/))/.test(text)) return badRequest(`${field} must start with https:// or /.`);
  return text;
}
