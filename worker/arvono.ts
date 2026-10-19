import { HttpError } from './errors';
import type { ArvonoOrder, OrdersPage, Summary } from '../shared/api';

type Path = '/printable' | '/summary' | '/claim' | '/printed' | '/release';

/** A failed call that is safe to retry later with the same Idempotency-Key. */
export class UpstreamUnavailable extends HttpError {}

/**
 * Client for the ARVONO dispatch API. Only label reads and print-state calls:
 * no scanning, sorting or dispatching. The API key never leaves the Worker.
 */
export class Arvono {
  private readonly base: string;
  constructor(private readonly env: Env) {
    this.base = env.ARVONO_API_BASE_URL.replace(/\/$/, '');
  }

  get configured() { return !!this.env.ARVONO_API_KEY; }

  private async call<T>(path: Path, query?: URLSearchParams, body?: unknown, idempotencyKey?: string): Promise<T> {
    const key = this.env.ARVONO_API_KEY;
    if (!key) throw new HttpError(503, 'ARVONO is not connected. Set the ARVONO_API_KEY secret.');
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}${query?.size ? `?${query}` : ''}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey! }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new UpstreamUnavailable(502, 'Could not reach ARVONO. Try again.');
    }
    const result = await response.json<any>().catch(() => undefined);
    if (!response.ok || result === undefined) {
      const message = typeof result?.error === 'string' ? result.error.replaceAll(key, '[redacted]') : `HTTP ${response.status}`;
      // 409: the same key is still running upstream; 5xx: retry with the same key.
      if (response.status >= 500 || response.status === 409 || result === undefined) {
        throw new UpstreamUnavailable(502, `ARVONO: ${message}. Try again.`);
      }
      throw new HttpError(response.status === 401 || response.status === 403 ? 502 : response.status, `ARVONO: ${message}`);
    }
    return result as T;
  }

  printable(query: URLSearchParams) { return this.call<OrdersPage>('/printable', query); }
  summary(upTo: string) { return this.call<Summary>('/summary', new URLSearchParams({ upTo })); }

  claim(orderIds: number[], key: string) {
    // 24 hours (the API maximum) so a print shop has time to act on the link.
    return this.call<{ jobId: string | null; expiresAt: string | null; count: number; orders: ArvonoOrder[] }>(
      '/claim', undefined, { orderIds, ttlSeconds: 86_400 }, key);
  }

  printed(jobId: string, failedOrderIds: number[], key: string) {
    return this.call<{ printed: number; released: number; results: { orderId: number; result: string }[] }>(
      '/printed', undefined, { jobId, failedOrderIds }, key);
  }

  release(jobId: string, reason: string, key: string) {
    return this.call<{ released: number; orderIds: number[] }>('/release', undefined, { jobId, reason }, key);
  }

  /** Current data for printed labels, paging through GET /printable?status=printed. */
  async printedOrders(orderIds: number[], upTo: string): Promise<Map<number, ArvonoOrder>> {
    const wanted = new Set(orderIds);
    const found = new Map<number, ArvonoOrder>();
    const query = new URLSearchParams({ upTo, status: 'printed', limit: '500' });
    for (let page = 0; page < 20 && found.size < wanted.size; page++) {
      const result = await this.printable(query);
      for (const order of result.orders) if (wanted.has(order.orderId)) found.set(order.orderId, order);
      if (!result.nextCursor) break;
      query.set('cursor', result.nextCursor);
    }
    return found;
  }
}
