import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { dhakaDate, downloadName, renderDownload, validatePrintOptions } from './download.js';
import { PrintStore, publicJob, type FulfillmentOrder, type PrintJob } from './print-store.js';
import { LabelError, validateShipment } from './types.js';
import { thermalRequest } from './thermal.js';

export interface FulfillmentOptions { baseUrl?: string; apiKey?: string; dataDir?: string; fetch?: typeof globalThis.fetch }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(message: string, field?: string): never { throw new LabelError(message, 400, 'INVALID_INPUT', field); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Send a JSON object.');
  return value as Record<string, unknown>;
}
function ids(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some((id) => !Number.isSafeInteger(id) || id < 1)) return invalid('Select 1–500 orders.', 'orderIds');
  return [...new Set(value)].sort((a, b) => a - b);
}
function date(value: unknown): string {
  if (value === undefined) return dhakaDate();
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return invalid('Use a valid YYYY-MM-DD business date.', 'upTo');
  return value;
}
export function orderShipment(order: FulfillmentOrder) {
  const address = order.shippingAddress;
  const parts = [address?.address];
  for (const value of [address?.city, address?.zip]) if (value && !parts.join(', ').toLowerCase().includes(value.toLowerCase())) parts.push(value);
  return validateShipment({ name: order.customer?.name, phone: order.customer?.phone, address: parts.filter(Boolean).join(', '),
    cod: order.codAmount, parcelId: order.consignmentId });
}
export function registerFulfillment(app: FastifyInstance, options: FulfillmentOptions = {}) {
  const base = (options.baseUrl ?? process.env.FULFILLMENT_API_BASE_URL ?? 'https://arvono-fulfillment-os.twriad96.workers.dev/api/v1/dispatch').replace(/\/$/, '');
  const key = options.apiKey ?? process.env.FULFILLMENT_API_KEY ?? '';
  const network = options.fetch ?? globalThis.fetch;
  const store = new PrintStore(options.dataDir ?? process.env.LABEL_DATA_DIR ?? './data');
  // Deliberately limited to label reads and print-state operations. No scanner, sorting or dispatch proxy.
  async function upstream(path: '/printable' | '/summary' | '/claim' | '/printed' | '/release', query?: URLSearchParams, body?: unknown, idempotencyKey?: string): Promise<any> {
    if (!key) throw new LabelError('Fulfillment is not connected. Configure the server API key.', 503, 'FULFILLMENT_NOT_CONFIGURED');
    let response: Response;
    try {
      response = await network(`${base}${path}${query?.size ? `?${query}` : ''}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey! }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new LabelError('Could not reach fulfillment. Retry this same job to avoid duplicate reservations.', 502, 'FULFILLMENT_UNAVAILABLE'); }
    let result: any;
    try { result = await response.json(); } catch { throw new LabelError('Fulfillment returned an unreadable response. Retry this same job.', 502, 'FULFILLMENT_UNAVAILABLE'); }
    if (!response.ok) {
      const message = typeof result.error === 'string' ? result.error.replaceAll(key, '[redacted]') : 'Fulfillment request failed.';
      throw new LabelError(`Fulfillment: ${message}`, response.status >= 500 ? 502 : response.status, 'FULFILLMENT_ERROR');
    }
    return result;
  }
  const event = (job: PrintJob, action: string, reason?: string) => { job.events.push({ at: new Date().toISOString(), action, ...(reason ? { reason } : {}) }); };
  const getJob = async (id: string) => {
    if (!uuid.test(id)) throw new LabelError('Print job not found.', 404, 'JOB_NOT_FOUND');
    const job = await store.get(id);
    if (!job) throw new LabelError('Print job not found.', 404, 'JOB_NOT_FOUND');
    return job;
  };
  async function printable(query: URLSearchParams) {
    const result = await upstream('/printable', query);
    if (!Array.isArray(result.orders)) throw new LabelError('Fulfillment returned no order list.', 502, 'INVALID_FULFILLMENT_RESPONSE');
    return result;
  }
  async function freshPrinted(job: PrintJob): Promise<FulfillmentOrder[]> {
    const found = new Map<number, FulfillmentOrder>();
    const wanted = new Set(job.request.orderIds);
    const query = new URLSearchParams({ upTo: job.request.upTo, status: 'printed', limit: '500' });
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const result = await printable(query);
      for (const order of result.orders) if (wanted.has(order.orderId) && order.labelStatus === 'printed') found.set(order.orderId, order);
      if (found.size === wanted.size) return job.request.orderIds.map((id) => found.get(id)!);
      if (!result.nextCursor || seen.has(String(result.nextCursor))) break;
      seen.add(String(result.nextCursor)); query.set('cursor', String(result.nextCursor));
    }
    throw new LabelError('Some selected orders are no longer eligible for reprinting. Reload printed labels.', 409, 'ORDERS_CHANGED');
  }
  async function prepare(job: PrintJob): Promise<PrintJob> {
    if (job.status !== 'preparing') return job;
    try {
      if (!job.orders.length) {
        if (job.request.mode === 'reprint') job.orders = await freshPrinted(job);
        else {
          const claim = await upstream('/claim', undefined, { orderIds: job.request.orderIds, ttlSeconds: 3600 }, job.claimKey);
          if (!claim.jobId || !Array.isArray(claim.orders) || !claim.orders.length) {
            job.status = 'failed'; job.error = 'These labels are no longer pending. Reload pending labels.';
            event(job, 'no_labels_available'); await store.save(job);
            throw new LabelError(job.error, 409, 'NO_LABELS_AVAILABLE');
          }
          // Persist the upstream job before rendering, so recovery can release it after a crash.
          job.upstreamJobId = claim.jobId; job.expiresAt = claim.expiresAt; job.orders = claim.orders;
        }
        await store.save(job);
      }
      let output;
      try {
        const shipments = job.orders.map((order) => validateShipment({ ...orderShipment(order),
          ...(job.request.options.format === 'individual' && job.request.options.size ? { size: job.request.options.size } : {}) }));
        const stem = downloadName(job.request.options.format, shipments.length, { now: new Date(job.createdAt), id: job.id, reprint: job.request.mode === 'reprint' });
        output = await renderDownload(shipments, job.request.options, stem);
      } catch (error) {
        job.error = error instanceof Error ? error.message : 'Unable to create these labels.';
        if (job.upstreamJobId) {
          job.status = 'release_pending'; event(job, 'generation_failed', job.error); await store.save(job);
          await upstream('/release', undefined, { jobId: job.upstreamJobId, reason: 'Label generation failed' }, job.releaseKey);
        }
        job.status = 'failed'; event(job, 'generation_failed', job.error); await store.save(job); throw error;
      }
      await store.saveFile(job.id, output.bytes);
      job.filename = output.filename; job.type = output.type; job.status = 'ready'; delete job.error;
      event(job, job.request.mode === 'reprint' ? 'reprint_prepared' : 'labels_prepared', job.request.reason || undefined);
      await store.save(job); return job;
    } catch (error) {
      job.error = error instanceof Error ? error.message : 'Preparation failed.';
      await store.save(job); throw error;
    }
  }
  app.addHook('onRequest', async (request, reply) => { if (request.url.startsWith('/fulfillment/')) reply.header('Cache-Control', 'no-store'); });
  app.get('/fulfillment/status', async () => ({ configured: !!key, timezone: 'Asia/Dhaka', today: dhakaDate(), reprintAudit: 'studio' }));
  app.get('/fulfillment/summary', async (request) => upstream('/summary', new URLSearchParams({ upTo: date((request.query as any).upTo) })));
  app.get('/fulfillment/orders', async (request) => {
    const value = request.query as Record<string, unknown>;
    if (value.status !== undefined && value.status !== 'unprinted' && value.status !== 'printed') return invalid('Choose pending or printed labels.', 'status');
    const query = new URLSearchParams({ upTo: date(value.upTo), status: String(value.status ?? 'unprinted'), limit: '500' });
    if (value.cursor !== undefined) {
      if (typeof value.cursor !== 'string' || value.cursor.length > 2048) return invalid('Invalid order cursor.', 'cursor');
      query.set('cursor', value.cursor);
    }
    return printable(query);
  });
  app.get('/fulfillment/jobs', async () => ({ jobs: (await store.list()).slice(0, 200).map(publicJob) }));
  app.get('/fulfillment/jobs/:id', async (request) => publicJob(await getJob((request.params as any).id)));
  app.post('/fulfillment/jobs', async (request, reply) => {
    const id = request.headers['idempotency-key'];
    if (typeof id !== 'string' || !uuid.test(id)) return invalid('Send a UUID Idempotency-Key header.', 'idempotencyKey');
    const body = object(request.body), orderIds = ids(body.orderIds);
    if (body.mode !== 'pending' && body.mode !== 'reprint') return invalid('Choose pending or reprint.', 'mode');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if ((body.mode === 'reprint' && reason.length < 3) || reason.length > 500) return invalid('Give a reprint reason of 3–500 characters.', 'reason');
    const printOptions = validatePrintOptions(body.options);
    const probe = validateShipment({ name: 'Sample', phone: '01700000000', address: 'Dhaka', parcelId: '123', cod: 0, ...(printOptions.size ? { size: printOptions.size } : {}) });
    if (printOptions.format === 'thermal') thermalRequest([probe], { preset: printOptions.preset, dpi: String(printOptions.dpi ?? 203) });
    const normalized: PrintJob['request'] = { orderIds, mode: body.mode, reason, upTo: date(body.upTo), options: printOptions };
    const signature = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return store.locked(id, async () => {
      let job = await store.get(id);
      if (job && job.signature !== signature) throw new LabelError('This request key was already used for different labels or settings.', 422, 'IDEMPOTENCY_CONFLICT');
      if (!job) {
        const now = new Date().toISOString();
        job = { id, createdAt: now, updatedAt: now, status: 'preparing', request: normalized, signature, claimKey: randomUUID(), confirmKey: randomUUID(), releaseKey: randomUUID(), orders: [], events: [] };
        event(job, 'preparation_started', reason || undefined); await store.save(job);
      }
      const result = await prepare(job);
      return reply.code(result.status === 'ready' ? 201 : 200).send(publicJob(result));
    });
  });
  app.post('/fulfillment/jobs/:id/resume', async (request) => {
    const id = (request.params as any).id;
    return store.locked(id, async () => publicJob(await prepare(await getJob(id))));
  });
  app.get('/fulfillment/jobs/:id/file', async (request, reply) => {
    const job = await getJob((request.params as any).id);
    if (job.status !== 'ready' || !job.filename) throw new LabelError('Prepare a new reprint with a reason to print this job again.', 409, 'JOB_NOT_READY');
    if (job.expiresAt && Date.parse(job.expiresAt) <= Date.now()) throw new LabelError('This reservation expired. Release the job and reload pending labels before preparing again.', 409, 'RESERVATION_EXPIRED');
    return reply.type(job.type!).header('Content-Disposition', `attachment; filename="${job.filename}"`).send(await store.file(job.id));
  });
  app.post('/fulfillment/jobs/:id/printed', async (request) => {
    const id = (request.params as any).id;
    return store.locked(id, async () => {
      const job = await getJob(id), orderIds = ids(object(request.body).orderIds);
      if (orderIds.some((id) => !job.orders.some((order) => order.orderId === id))) return invalid('Select orders from this print job.', 'orderIds');
      if (job.confirmationIds && JSON.stringify(job.confirmationIds) !== JSON.stringify(orderIds)) throw new LabelError('Retry confirmation with the same printed orders.', 409, 'CONFIRMATION_CONFLICT');
      if (job.status === 'printed' || job.status === 'partial') return publicJob(job);
      if (job.status !== 'ready' && job.status !== 'confirmation_pending') throw new LabelError('This job cannot be confirmed.', 409, 'JOB_NOT_READY');
      job.confirmationIds = orderIds; job.status = 'confirmation_pending'; await store.save(job);
      try {
        const failedOrderIds = job.orders.filter((order) => !orderIds.includes(order.orderId)).map((order) => order.orderId);
        const result = job.request.mode === 'reprint' ? { printed: orderIds.length, released: failedOrderIds.length,
          results: job.orders.map((order) => ({ orderId: order.orderId, result: orderIds.includes(order.orderId) ? 'printed' : 'released' })) }
          : await upstream('/printed', undefined, { jobId: job.upstreamJobId, failedOrderIds }, job.confirmKey);
        job.result = result;
        const confirmed = new Set<number>((Array.isArray(result.results) ? result.results : []).filter((entry: any) => ['printed', 'already_printed'].includes(entry.result)).map((entry: any) => entry.orderId));
        job.status = orderIds.length === job.orders.length && orderIds.every((id) => confirmed.has(id)) ? 'printed' : 'partial';
        delete job.error; event(job, job.request.mode === 'reprint' ? 'reprint_confirmed' : 'printing_confirmed', job.request.reason || undefined);
        await store.save(job); return publicJob(job);
      } catch (error) { job.error = error instanceof Error ? error.message : 'Confirmation failed.'; await store.save(job); throw error; }
    });
  });
  app.post('/fulfillment/jobs/:id/release', async (request) => {
    const id = (request.params as any).id;
    return store.locked(id, async () => {
      const job = await getJob(id);
      if (job.status === 'released' || job.status === 'failed') return publicJob(job);
      if (job.status !== 'ready' && job.status !== 'release_pending') throw new LabelError('This job cannot be released. Resume its pending operation first.', 409, 'JOB_NOT_READY');
      const reason = typeof (request.body as any)?.reason === 'string' ? String((request.body as any).reason).trim().slice(0, 500) : 'Not printed / printer failure';
      job.status = 'release_pending'; await store.save(job);
      try {
        if (job.upstreamJobId) await upstream('/release', undefined, { jobId: job.upstreamJobId, reason }, job.releaseKey);
        job.status = 'released'; delete job.error; event(job, 'job_released', reason); await store.save(job); return publicJob(job);
      } catch (error) { job.error = error instanceof Error ? error.message : 'Release failed.'; await store.save(job); throw error; }
    });
  });
}
