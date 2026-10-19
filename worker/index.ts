import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { Arvono } from './arvono';
import { isSignedIn, signIn, signOut } from './auth';
import { badRequest, HttpError } from './errors';
import { Requests, toPublic } from './requests';
import type { SharedPrintRequest } from '../shared/api';

type App = { Bindings: Env };
const app = new Hono<App>().basePath('/api');

const dhakaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function businessDate(value: unknown) {
  if (value === undefined || value === '') return dhakaDate();
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return badRequest('Use a YYYY-MM-DD date.');
  }
  return value;
}
function orderIds(value: unknown, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.length > 500 ||
      value.some((id) => !Number.isSafeInteger(id) || id < 1)) return badRequest('Select 1–500 labels.');
  return [...new Set(value as number[])].sort((a, b) => a - b);
}
function text(value: unknown, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > max) return badRequest(`Text must be at most ${max} characters.`);
  return value.trim() || null;
}
async function body(c: { req: { json: () => Promise<unknown> } }) {
  const value = await c.req.json().catch(() => undefined);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return badRequest('Send a JSON object.');
  return value as Record<string, unknown>;
}

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
  console.error(error);
  return c.json({ error: 'Something went wrong.' }, 500);
});

app.use('*', async (c, next) => {
  // A custom header can't be sent cross-site without CORS, which blocks CSRF on cookie-authenticated POSTs.
  if (c.req.method !== 'GET' && c.req.header('X-Requested-With') !== 'arvono-labels') {
    throw new HttpError(403, 'Missing X-Requested-With header.');
  }
  await next();
  c.header('Cache-Control', 'no-store');
});

/* ---------- Print shop links (public, the token is the credential) ---------- */

const shared = async (requests: Requests, token: string) => {
  const row = token.length === 24 ? await requests.byToken(token) : null;
  if (!row) throw new HttpError(404, 'This print link does not exist.');
  return row;
};
const forShop = (row: Parameters<typeof toPublic>[0]): SharedPrintRequest => {
  const { token: _token, upstreamJobId: _job, events: _events, ...rest } = toPublic(row);
  return rest;
};

app.get('/share/:token', async (c) => c.json(forShop(await shared(new Requests(c.env), c.req.param('token')))));

app.post('/share/:token/download', async (c) => {
  const requests = new Requests(c.env);
  const row = await shared(requests, c.req.param('token'));
  const request = toPublic(row);
  if (request.status !== 'ready') throw new HttpError(409, 'These labels were already confirmed or released.');
  if (request.expired) throw new HttpError(409, 'This print link has expired. Ask ARVONO for a new link.');
  await requests.logDownload(row, text((await body(c)).format, 120) ?? 'unknown');
  return c.json({ ok: true });
});

app.post('/share/:token/printed', async (c) => {
  const requests = new Requests(c.env);
  const row = await shared(requests, c.req.param('token'));
  return c.json(forShop(await requests.confirm(row, orderIds((await body(c)).printedIds), 'print shop')));
});

app.post('/share/:token/release', async (c) => {
  const requests = new Requests(c.env);
  const row = await shared(requests, c.req.param('token'));
  const reason = text((await body(c)).reason, 500);
  if (!reason || reason.length < 3) return badRequest('Tell us what went wrong (at least 3 characters).');
  return c.json(forShop(await requests.release(row, reason, 'print shop')));
});

/* ---------- Staff ---------- */

app.get('/session', async (c) => c.json({
  authenticated: await isSignedIn(c), configured: new Arvono(c.env).configured, today: dhakaDate(),
}));
app.post('/login', async (c) => {
  if (!c.env.DASHBOARD_PASSWORD) throw new HttpError(503, 'Set the DASHBOARD_PASSWORD secret first.');
  const password = (await body(c)).password;
  if (typeof password !== 'string' || !(await signIn(c, password))) throw new HttpError(401, 'Wrong password.');
  return c.json({ ok: true });
});
app.post('/logout', (c) => { signOut(c); return c.json({ ok: true }); });

const staff = createMiddleware<App>(async (c, next) => {
  if (!(await isSignedIn(c))) throw new HttpError(401, 'Please sign in.');
  await next();
});

app.get('/summary', staff, async (c) => c.json(await new Arvono(c.env).summary(businessDate(c.req.query('upTo')))));

app.get('/orders', staff, async (c) => {
  const status = c.req.query('status') ?? 'unprinted';
  if (!['unprinted', 'reserved', 'printed'].includes(status)) return badRequest('Unknown label status.');
  const query = new URLSearchParams({ upTo: businessDate(c.req.query('upTo')), status, limit: '500' });
  const cursor = c.req.query('cursor');
  if (cursor) query.set('cursor', cursor);
  return c.json(await new Arvono(c.env).printable(query));
});

app.get('/requests', staff, async (c) => c.json(await new Requests(c.env).list(200)));

app.get('/requests/:id', staff, async (c) => {
  const requests = new Requests(c.env);
  const row = await requests.byId(c.req.param('id'));
  if (!row) throw new HttpError(404, 'Print link not found.');
  return c.json(toPublic(row, await requests.events(row.id)));
});

app.post('/requests', staff, async (c) => {
  const input = await body(c);
  if (typeof input.id !== 'string' || !uuid.test(input.id)) return badRequest('Send a UUID id.');
  if (input.mode !== 'new' && input.mode !== 'reprint') return badRequest('mode must be "new" or "reprint".');
  const reason = text(input.reason, 500);
  if (input.mode === 'reprint' && (!reason || reason.length < 3)) return badRequest('A reason is required for reprints.');
  const requests = new Requests(c.env);
  const row = await requests.create({ id: input.id, mode: input.mode, orderIds: orderIds(input.orderIds),
    note: text(input.note, 200), reason: input.mode === 'reprint' ? reason : null, upTo: businessDate(input.upTo) });
  return c.json(toPublic(row), 201);
});

app.post('/requests/:id/retry', staff, async (c) => {
  const requests = new Requests(c.env);
  const row = await requests.byId(c.req.param('id'));
  if (!row) throw new HttpError(404, 'Print link not found.');
  return c.json(toPublic(await requests.resume(row)));
});

app.post('/requests/:id/release', staff, async (c) => {
  const requests = new Requests(c.env);
  const row = await requests.byId(c.req.param('id'));
  if (!row) throw new HttpError(404, 'Print link not found.');
  const reason = text((await body(c)).reason, 500) ?? 'Cancelled by staff';
  return c.json(toPublic(await requests.release(row, reason, 'staff')));
});

app.all('*', (c) => c.json({ error: 'Not found.' }, 404));

export default app;
