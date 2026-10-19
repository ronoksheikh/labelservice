import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../dist/routes.js';
import { dhakaDate, downloadName } from '../dist/download.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'arvono-print-test-'));
  const orders = [1, 2].map((orderId) => ({ orderId, orderName: `#${1000 + orderId}`, invoice: `INVOICE-${orderId}`,
    consignmentId: `00012345${orderId}`, customer: { name: 'রাকিব হাসান', phone: '01700000000' },
    shippingAddress: { address: 'বাড়ি ১২, শান্তিনগর, ঢাকা', city: 'ঢাকা', zip: '1217' },
    codAmount: 849, bookedDate: '2026-10-18', labelStatus: 'unprinted', dispatchStatus: 'pending' }));
  const calls = [], replies = new Map(); let dropConfirmation = false;
  const fetch = async (url, options) => {
    const path = new URL(url).pathname.split('/').at(-1);
    const query = new URL(url).searchParams;
    const body = options.body ? JSON.parse(options.body) : undefined;
    assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    assert.ok(['printable', 'summary', 'claim', 'printed', 'release'].includes(path), 'No dispatch/sorting API call');
    calls.push({ path, body, key: options.headers['Idempotency-Key'] });
    if (body) assert.match(options.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
    const key = `${path}:${options.headers['Idempotency-Key']}`;
    if (body && replies.has(key)) return Response.json(replies.get(key));
    let result;
    if (path === 'printable') result = { orders: orders.filter((order) => order.labelStatus === query.get('status')), nextCursor: null };
    if (path === 'summary') result = { unprinted: orders.filter((o) => o.labelStatus === 'unprinted').length };
    if (path === 'claim') {
      const selected = orders.filter((order) => body.orderIds.includes(order.orderId) && order.labelStatus === 'unprinted');
      for (const order of selected) order.labelStatus = 'reserved';
      result = { jobId: selected.length ? randomUUID() : null, expiresAt: new Date(Date.now() + 3600000).toISOString(), orders: selected, count: selected.length };
    }
    if (path === 'printed') {
      const results = orders.filter((order) => order.labelStatus === 'reserved').map((order) => {
        const failed = body.failedOrderIds.includes(order.orderId); order.labelStatus = failed ? 'unprinted' : 'printed';
        return { orderId: order.orderId, result: failed ? 'released' : 'printed' };
      });
      result = { printed: results.filter((r) => r.result === 'printed').length, released: results.filter((r) => r.result === 'released').length, results };
    }
    if (path === 'release') { for (const order of orders) if (order.labelStatus === 'reserved') order.labelStatus = 'unprinted'; result = { released: 2 }; }
    const copy = structuredClone(result);
    if (body) replies.set(key, copy);
    if (path === 'printed' && dropConfirmation) { dropConfirmation = false; throw new Error('Connection dropped after upstream commit'); }
    return Response.json(copy);
  };
  const options = { fulfillment: { apiKey: 'private-test-key', baseUrl: 'https://fulfillment.test/api/v1/dispatch', dataDir: directory, fetch } };
  let app = buildApp(false, options);
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const create = async (body = {}, key = randomUUID()) => app.inject({ method: 'POST', url: '/fulfillment/jobs', headers: { 'idempotency-key': key },
    payload: { orderIds: [1, 2], mode: 'pending', upTo: '2026-10-19', options: { format: 'a4' }, ...body } });
  const post = (id, action, payload = {}) => app.inject({ method: 'POST', url: `/fulfillment/jobs/${id}/${action}`, payload });
  return { get app() { return app; }, orders, calls, create, post,
    dropConfirmation: () => { dropConfirmation = true; },
    restart: async () => { await app.close(); app = buildApp(false, options); } };
}

test('pending labels reserve once, download a dated A4 PDF, and confirm only selected labels without dispatching', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.app.inject('/fulfillment/orders?upTo=2026-10-19')).statusCode, 200);
  assert.ok(f.orders.every((order) => order.labelStatus === 'unprinted'));
  const key = randomUUID();
  const [a, b] = await Promise.all([f.create({}, key), f.create({}, key)]);
  assert.equal(a.statusCode, 201, a.body); assert.equal(b.statusCode, 201, b.body);
  assert.equal(f.calls.filter((call) => call.path === 'claim').length, 1);
  const job = a.json();
  assert.ok(f.orders.every((order) => order.labelStatus === 'reserved'));
  assert.match(job.filename, /^arvono-a4-2-labels-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-BDT-[a-f0-9]{8}\.pdf$/);
  const file = await f.app.inject(`/fulfillment/jobs/${job.id}/file`);
  assert.equal(file.rawPayload.subarray(0, 5).toString(), '%PDF-');
  assert.match(file.rawPayload.toString('latin1'), /\/MediaBox \[0 0 595\.27559[\d]* 841\.88976[\d]*\]/);
  assert.equal(f.calls.filter((call) => call.path === 'printed').length, 0);
  assert.equal((await f.create({ orderIds: [1] }, key)).statusCode, 422);
  await f.restart();
  assert.equal((await f.app.inject('/fulfillment/jobs')).json().jobs[0].id, job.id);
  const confirmed = await f.post(job.id, 'printed', { orderIds: [1] });
  assert.equal(confirmed.statusCode, 200, confirmed.body); assert.equal(confirmed.json().status, 'partial');
  assert.equal(f.orders[0].labelStatus, 'printed'); assert.equal(f.orders[1].labelStatus, 'unprinted');
  assert.ok(f.orders.every((order) => order.dispatchStatus === 'pending'));
  assert.equal((await f.app.inject(`/fulfillment/jobs/${job.id}/file`)).statusCode, 409);
  assert.ok(!JSON.stringify((await f.app.inject('/fulfillment/jobs')).json()).includes('private-test-key'));
});

test('confirmation retry reuses the committed request and local reprints require and save a reason', async (t) => {
  const f = await fixture(t), created = await f.create(), id = created.json().id;
  f.dropConfirmation();
  assert.equal((await f.post(id, 'printed', { orderIds: [1, 2] })).statusCode, 502);
  await f.restart();
  const retried = await f.post(id, 'printed', { orderIds: [1, 2] });
  assert.equal(retried.statusCode, 200, retried.body); assert.equal(retried.json().status, 'printed');
  const calls = f.calls.filter((call) => call.path === 'printed'); assert.equal(calls[0].key, calls[1].key);
  assert.equal((await f.create({ mode: 'reprint' })).statusCode, 400);
  const countBefore = f.calls.filter((call) => call.body).length;
  for (const options of [{ format: 'individual', size: { width: 3, height: 3, unit: 'in' } }, { format: 'thermal', preset: '4x6', dpi: 203 }, { format: 'a4', splitSheets: true }]) {
    const reprint = await f.create({ mode: 'reprint', reason: 'Printer jam', options });
    assert.equal(reprint.statusCode, 201, reprint.body);
    assert.equal(reprint.json().reason, 'Printer jam'); assert.match(reprint.json().filename, /-reprint-/);
    const download = await f.app.inject(`/fulfillment/jobs/${reprint.json().id}/file`);
    assert.equal(download.statusCode, 200);
    assert.equal(download.headers['content-type'], options.splitSheets ? 'application/zip' : 'application/pdf');
    const done = await f.post(reprint.json().id, 'printed', { orderIds: [1, 2] });
    assert.equal(done.json().status, 'printed');
  }
  assert.equal(f.calls.filter((call) => call.body).length, countBefore, 'Reprints change only studio history');
});

test('generation failure releases reserved labels and filenames use the Dhaka business date', async (t) => {
  const f = await fixture(t); f.orders[0].consignmentId = 'A'.repeat(80);
  const failed = await f.create(); assert.equal(failed.statusCode, 422, failed.body);
  assert.ok(f.orders.every((order) => order.labelStatus === 'unprinted'));
  assert.equal(f.calls.at(-1).path, 'release');
  assert.equal(dhakaDate(new Date('2026-10-18T20:30:00Z')), '2026-10-19');
  assert.match(downloadName('a4', 10, { now: new Date('2026-10-18T20:30:00Z'), id: '12345678' }), /2026-10-19_02-30-00-BDT-12345678$/);
});
