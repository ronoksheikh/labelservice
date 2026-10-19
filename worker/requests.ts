import { Arvono, UpstreamUnavailable } from './arvono';
import { HttpError } from './errors';
import type { ArvonoOrder, PrintEvent, PrintRequest, RequestMode, RequestStatus } from '../shared/api';

interface Row {
  id: string; token: string; mode: RequestMode; note: string | null; reason: string | null; status: RequestStatus;
  upstream_job_id: string | null; expires_at: string | null;
  claim_key: string; confirm_key: string; release_key: string;
  requested_ids: string; orders: string; printed_ids: string | null; release_reason: string | null;
  error: string | null; created_at: string; updated_at: string;
}

const now = () => new Date().toISOString();
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
};

export function toPublic(row: Row, events?: PrintEvent[]): PrintRequest {
  return {
    id: row.id, token: row.token, mode: row.mode, note: row.note, reason: row.reason, status: row.status,
    expired: row.mode === 'new' && row.status === 'ready' && !!row.expires_at && Date.parse(row.expires_at) <= Date.now(),
    upstreamJobId: row.upstream_job_id, expiresAt: row.expires_at,
    requestedCount: (JSON.parse(row.requested_ids) as number[]).length,
    orders: JSON.parse(row.orders), printedIds: row.printed_ids ? JSON.parse(row.printed_ids) : null,
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at, ...(events ? { events } : {}),
  };
}

export class Requests {
  private readonly arvono: Arvono;
  constructor(private readonly env: Env) { this.arvono = new Arvono(env); }
  private get db() { return this.env.DB; }

  byId(id: string) { return this.db.prepare('SELECT * FROM print_requests WHERE id = ?').bind(id).first<Row>(); }
  byToken(value: string) { return this.db.prepare('SELECT * FROM print_requests WHERE token = ?').bind(value).first<Row>(); }

  async list(limit: number) {
    const { results } = await this.db.prepare('SELECT * FROM print_requests ORDER BY created_at DESC LIMIT ?').bind(limit).all<Row>();
    return results.map((row) => toPublic(row));
  }

  async events(id: string) {
    const { results } = await this.db.prepare(
      'SELECT id, action, actor, detail, created_at AS createdAt FROM print_events WHERE request_id = ? ORDER BY id',
    ).bind(id).all<PrintEvent>();
    return results;
  }

  private event(id: string, action: string, actor: string, detail?: string | null) {
    return this.db.prepare('INSERT INTO print_events (request_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, action, actor, detail ?? null, now());
  }

  private async set(id: string, fields: Partial<Row>, events: D1PreparedStatement[] = []) {
    const keys = Object.keys(fields) as (keyof Row)[];
    await this.db.batch([
      this.db.prepare(`UPDATE print_requests SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .bind(...keys.map((key) => fields[key] ?? null), now(), id),
      ...events,
    ]);
    return (await this.byId(id))!;
  }

  /** Move to an in-flight state only from one of the allowed states: a lock without transactions. */
  private async transition(id: string, from: string[], fields: Partial<Row>) {
    const keys = Object.keys(fields) as (keyof Row)[];
    const result = await this.db.prepare(
      `UPDATE print_requests SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ?
       WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`,
    ).bind(...keys.map((key) => fields[key] ?? null), now(), id, ...from).run();
    return result.meta.changes === 1;
  }

  /** Idempotent on `id`: retrying the same request resumes it instead of claiming twice. */
  async create(input: { id: string; mode: RequestMode; orderIds: number[]; note: string | null; reason: string | null; upTo: string }) {
    const requested = JSON.stringify(input.orderIds);
    const existing = await this.byId(input.id);
    if (existing) {
      if (existing.mode !== input.mode || existing.requested_ids !== requested) {
        throw new HttpError(422, 'This request id was already used for different labels.');
      }
      return this.resume(existing);
    }
    let orders: ArvonoOrder[] = [];
    if (input.mode === 'reprint') {
      // Reprints are recorded here; ARVONO only accepts /reprint from a staff session, not an API key.
      const found = await this.arvono.printedOrders(input.orderIds, input.upTo);
      const missing = input.orderIds.filter((id) => !found.has(id));
      if (missing.length) {
        throw new HttpError(409, `${missing.length} selected label(s) are no longer printed and printable in ARVONO. Reload the list.`);
      }
      orders = input.orderIds.map((id) => found.get(id)!);
    }
    const at = now();
    await this.db.batch([
      this.db.prepare(`INSERT INTO print_requests (id, token, mode, note, reason, status, claim_key, confirm_key, release_key,
        requested_ids, orders, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(input.id, token(), input.mode, input.note, input.reason, input.mode === 'reprint' ? 'ready' : 'claiming',
          crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), requested, JSON.stringify(orders), at, at),
      this.event(input.id, input.mode === 'reprint' ? 'reprint_requested' : 'created', 'staff',
        input.mode === 'reprint' ? input.reason : `${input.orderIds.length} label(s) requested`),
    ]);
    return this.resume((await this.byId(input.id))!);
  }

  /** Finish whatever in-flight step a request was left in. */
  async resume(row: Row): Promise<Row> {
    if (row.status === 'claiming') return this.claim(row);
    if (row.status === 'confirming') return this.confirm(row, JSON.parse(row.printed_ids!), 'retry');
    if (row.status === 'releasing') return this.release(row, row.release_reason ?? 'Released', 'retry');
    return row;
  }

  private async claim(row: Row): Promise<Row> {
    try {
      const claim = await this.arvono.claim(JSON.parse(row.requested_ids), row.claim_key);
      if (!claim.jobId || !claim.orders.length) {
        return this.set(row.id, { status: 'failed', error: 'None of these labels are waiting to be printed any more.' },
          [this.event(row.id, 'failed', 'system', 'Nothing could be reserved in ARVONO')]);
      }
      const requested = (JSON.parse(row.requested_ids) as number[]).length;
      return this.set(row.id, { status: 'ready', upstream_job_id: claim.jobId, expires_at: claim.expiresAt,
        orders: JSON.stringify(claim.orders), error: null },
        [this.event(row.id, 'reserved', 'system', `${claim.orders.length} of ${requested} label(s) reserved for 24 hours`)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reservation failed';
      await this.set(row.id, error instanceof UpstreamUnavailable ? { error: message } : { status: 'failed', error: message });
      throw error;
    }
  }

  async confirm(row: Row, printedIds: number[], actor: string): Promise<Row> {
    const ids = JSON.stringify([...printedIds].sort((a, b) => a - b));
    const orders: ArvonoOrder[] = JSON.parse(row.orders);
    if (printedIds.some((id) => !orders.some((order) => order.orderId === id))) {
      throw new HttpError(400, 'Only confirm labels from this print link.');
    }
    if ((row.status === 'printed' || row.status === 'partial') && row.printed_ids === ids) return row;
    if (row.status === 'confirming' ? row.printed_ids !== ids
      : !(await this.transition(row.id, ['ready'], { status: 'confirming', printed_ids: ids, error: null }))) {
      throw new HttpError(409, 'This print link was already confirmed or released. Reload it.');
    }
    const failed = orders.map((order) => order.orderId).filter((id) => !printedIds.includes(id));
    let confirmed = printedIds.length;
    if (row.mode === 'new') {
      try {
        const result = await this.arvono.printed(row.upstream_job_id!, failed, row.confirm_key);
        confirmed = result.results.filter((entry) => entry.result === 'printed' || entry.result === 'already_printed').length;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Confirmation failed';
        await this.set(row.id, error instanceof UpstreamUnavailable ? { error: message }
          : { status: 'ready', printed_ids: null, error: message });
        throw error;
      }
    }
    const complete = !failed.length && confirmed === printedIds.length;
    return this.set(row.id, { status: complete ? 'printed' : 'partial', error: null },
      [this.event(row.id, 'printed', actor === 'retry' ? 'system' : actor,
        `${confirmed} printed${failed.length ? `, ${failed.length} not printed (released)` : ''}`)]);
  }

  async release(row: Row, reason: string, actor: string): Promise<Row> {
    if (row.status === 'released') return row;
    if (row.status !== 'releasing' &&
        !(await this.transition(row.id, ['ready', 'failed'], { status: 'releasing', release_reason: reason, error: null }))) {
      throw new HttpError(409, 'Only labels that are not printed yet can be released.');
    }
    if (row.mode === 'new' && row.upstream_job_id) {
      try {
        await this.arvono.release(row.upstream_job_id, reason, row.release_key);
      } catch (error) {
        await this.set(row.id, { error: error instanceof Error ? error.message : 'Release failed' });
        throw error;
      }
    }
    return this.set(row.id, { status: 'released', error: null },
      [this.event(row.id, 'released', actor === 'retry' ? 'system' : actor, row.release_reason ?? reason)]);
  }

  logDownload(row: Row, format: string) {
    return this.event(row.id, 'downloaded', 'print shop', format).run();
  }
}
