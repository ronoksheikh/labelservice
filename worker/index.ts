import { Hono, type Context } from 'hono';
import { FAQ, STATIC_PAGES } from '../shared/content';
import { markdownToText, renderMarkdown, escapeHtml } from '../shared/markdown';
import { isBdPhone, isEmail, normalizePhone, SITE, slugify } from '../shared/site';
import type { AdminCourseInput, CouponInput, CouponQuote, OrderReceipt } from '../shared/types';
import { isBot, recordView, stats } from './analytics';
import { adminSignIn, adminSignOut, isAdmin, studentId, studentSignIn, studentSignOut } from './auth';
import { Coupons } from './coupons';
import { Courses } from './courses';
import { loginEmail, sendEmail } from './email';
import { badRequest, HttpError, notFound } from './errors';
import { Orders } from './orders';
import { paymentGateway } from './payments';
import { applyCoupon } from './pricing';
import { breadcrumbs, courseHtml, courseList, courseSchema, homeHtml, organization, renderPage, shellHtml, website } from './seo';
import { LOGIN_LINK_MINUTES, Students } from './students';
import { int, intOrNull, jsonBody, oneOf, str, url } from './validate';

type App = { Bindings: Env };
type C = Context<App>;

const origin = (c: C) => new URL(c.req.url).origin;
const siteBase = (c: C) => c.env.SITE_URL.replace(/\/$/, '');
const waitUntil = (c: C) => (promise: Promise<unknown>) => c.executionCtx.waitUntil(promise);

/* ====================================================================== */
/*  JSON API                                                              */
/* ====================================================================== */

const api = new Hono<App>();

api.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
  console.error(error);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

api.use('*', async (c, next) => {
  // A custom header can't be sent cross-site without a CORS preflight, which blocks CSRF on cookie-authenticated requests.
  // Payment gateways post back to /payments/* from their own pages, so those routes are exempt (they verify server-side).
  if (c.req.method !== 'GET' && !c.req.path.startsWith('/api/payments/') && c.req.header('X-Requested-With') !== 'twobytes') throw new HttpError(403, 'Missing X-Requested-With header.');
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

/* ---------- Public catalogue ---------- */

api.get('/courses', async (c) => c.json(await new Courses(c.env.DB).published()));

api.get('/courses/:slug', async (c) => {
  const course = await new Courses(c.env.DB).detail(c.req.param('slug'));
  return course ? c.json(course) : notFound('This course is not available.');
});

api.post('/coupons/check', async (c) => {
  const body = await jsonBody(c);
  const course = await new Courses(c.env.DB).bySlug(str(body.slug, 'Course', { required: true }));
  if (!course || course.status !== 'published') return notFound('This course is not available.');
  const code = str(body.code, 'Coupon', { max: 40, required: true });
  const coupon = await new Coupons(c.env.DB).byCode(code);
  const check = applyCoupon(coupon, course.id, course.price);
  if (!check.ok) return badRequest(check.error);
  return c.json({ code: coupon!.code, discount: check.discount, label: check.label } satisfies CouponQuote);
});

/* ---------- Checkout ---------- */

function buyer(body: Record<string, unknown>) {
  const name = str(body.name, 'Name', { max: 100, required: true });
  const email = str(body.email, 'Email', { max: 200, required: true }).toLowerCase();
  if (!isEmail(email)) badRequest('Enter a valid email address.');
  const phone = normalizePhone(str(body.phone, 'Phone', { max: 20, required: true }));
  if (!isBdPhone(phone)) badRequest('Enter a valid Bangladeshi mobile number, like 01712345678.');
  return { name, email, phone };
}

api.post('/checkout', async (c) => {
  const body = await jsonBody(c);
  const visitorId = str(body.visitorId, 'Visitor', { max: 64 }) || undefined;
  const source = str(body.source, 'Source', { max: 40 }) || undefined;
  const result = await new Orders(c.env).checkout({
    slug: str(body.slug, 'Course', { required: true }),
    ...buyer(body),
    coupon: str(body.coupon, 'Coupon', { max: 40 }) || undefined,
    bump: body.bump === true,
    visitorId,
    source,
  }, origin(c), c.req.header('CF-Connecting-IP') ?? null, waitUntil(c));
  return c.json(result);
});

/**
 * EPS sends the buyer back here (success, fail or cancel URL). We never trust the query string: the payment is
 * verified with EPS before the order is marked paid. Then the buyer lands on their order page.
 */
api.on(['GET', 'POST'], '/payments/eps/return', async (c) => {
  const id = c.req.query('order') ?? '';
  const key = c.req.query('k') ?? '';
  const orders = new Orders(c.env);
  const order = await orders.byId(id);
  if (!order || order.access_key !== key) return c.redirect('/', 302);
  let paid = false;
  try {
    paid = await orders.confirmPayment(order, origin(c), waitUntil(c));
  } catch (error) {
    console.error(`Verifying EPS payment for order ${id} failed`, error);
  }
  const result = c.req.query('result');
  if (!paid && (result === 'failed' || result === 'cancelled')) await orders.setStatus(id, result).catch(() => undefined);
  return c.redirect(`/checkout/${id}?k=${encodeURIComponent(key)}`, 302);
});

/** The buyer's browser polls this after checkout. Once paid, it signs that browser in to the course area. */
api.get('/orders/:id', async (c) => {
  const orders = new Orders(c.env);
  const id = c.req.param('id');
  const key = c.req.query('k') ?? '';
  // Still waiting: ask the gateway in case the buyer paid but never came back through the return URL.
  const pending = await orders.byId(id);
  if (pending && pending.access_key === key && pending.status === 'initiated' && pending.payment_txn) {
    await orders.confirmPayment(pending, origin(c), waitUntil(c)).catch((error) => console.error(`Payment check for ${id} failed`, error));
  }
  const receipt = await orders.receipt(id, key);
  if (!receipt) return notFound('Order not found.');
  let signedIn = false;
  if (receipt.status === 'paid') {
    const student = await new Students(c.env.DB).byEmail(receipt.email);
    if (student) {
      const current = await studentId(c);
      // Sign in only a student this order created (anyone can type someone else's email at checkout),
      // and only during the first day, so an old receipt link can't be used as a permanent login.
      if (current === student.id) signedIn = true;
      else if (current === null && student.created_at >= receipt.createdAt && receipt.paidAt
        && Date.now() - receipt.paidAt < 24 * 60 * 60 * 1000) {
        await studentSignIn(c, student.id);
        signedIn = true;
      }
    }
  }
  return c.json({ ...receipt, signedIn } satisfies OrderReceipt);
});

/* ---------- Analytics ---------- */

api.post('/track', async (c) => {
  const body = await jsonBody(c);
  const userAgent = c.req.header('User-Agent') ?? '';
  const visitorId = str(body.visitorId, 'Visitor', { max: 64 });
  const path = str(body.path, 'Path', { max: 300 });
  if (isBot(userAgent) || !visitorId || !path.startsWith('/')) return c.json({ ok: true });
  let courseId: number | null = null;
  const slug = /^\/courses\/([^/?#]+)/.exec(path)?.[1];
  if (slug) courseId = (await new Courses(c.env.DB).bySlug(decodeURIComponent(slug)))?.id ?? null;
  c.executionCtx.waitUntil(recordView(c.env.DB, {
    visitorId, path, courseId, userAgent,
    source: str(body.source, 'Source', { max: 40 }) || 'direct',
    country: (c.req.raw.cf?.country as string | undefined) ?? null,
  }));
  return c.json({ ok: true });
});

/* ---------- Student course area ---------- */

async function signedInStudent(c: C) {
  const id = await studentId(c);
  if (id === null) throw new HttpError(401, 'Please sign in to see your courses.');
  return id;
}

api.get('/me', async (c) => {
  const id = await studentId(c);
  return c.json({ student: id === null ? null : await new Students(c.env.DB).me(id) });
});

api.post('/auth/request', async (c) => {
  const body = await jsonBody(c);
  const email = str(body.email, 'Email', { max: 200, required: true }).toLowerCase();
  if (!isEmail(email)) return badRequest('Enter a valid email address.');
  const students = new Students(c.env.DB);
  const found = await students.byEmail(email);
  // Same answer either way, so this can't be used to find out who is a student.
  if (found && (await students.recentTokens(found.id, 15 * 60 * 1000)) < 5) {
    const token = await students.createLoginToken(found.id, LOGIN_LINK_MINUTES * 60 * 1000);
    c.executionCtx.waitUntil(sendEmail(c.env, loginEmail(email, `${origin(c)}/auth?token=${encodeURIComponent(token)}`))
      .catch((error) => console.error('Sign-in email failed', error)));
  }
  return c.json({ ok: true });
});

api.post('/auth/verify', async (c) => {
  const token = str((await jsonBody(c)).token, 'Token', { max: 100, required: true });
  const id = await new Students(c.env.DB).redeem(token);
  await studentSignIn(c, id);
  return c.json({ student: await new Students(c.env.DB).me(id) });
});

api.post('/auth/logout', (c) => { studentSignOut(c); return c.json({ ok: true }); });

api.get('/my/courses', async (c) => c.json(await new Students(c.env.DB).courses(await signedInStudent(c))));

api.get('/my/courses/:slug', async (c) => c.json(await new Students(c.env.DB).classroom(await signedInStudent(c), c.req.param('slug'))));

api.put('/my/lessons/:id/progress', async (c) => {
  const id = await signedInStudent(c);
  const completed = (await jsonBody(c)).completed === true;
  await new Students(c.env.DB).setProgress(id, int(c.req.param('id'), 'Lesson', { min: 1 }), completed);
  return c.json({ ok: true });
});

/* ---------- Admin ---------- */

api.get('/admin/session', async (c) => c.json({
  signedIn: await isAdmin(c), configured: Boolean(c.env.ADMIN_PASSWORD),
  payments: paymentGateway(c.env) ? c.env.EPS_MODE : 'off',
}));

api.post('/admin/login', async (c) => {
  const password = str((await jsonBody(c)).password, 'Password', { max: 200 });
  if (!(await adminSignIn(c, password))) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    throw new HttpError(401, 'Wrong password.');
  }
  return c.json({ ok: true });
});

api.post('/admin/logout', (c) => { adminSignOut(c); return c.json({ ok: true }); });

const admin = new Hono<App>();
admin.use('*', async (c, next) => {
  if (!(await isAdmin(c))) throw new HttpError(401, 'Please sign in.');
  await next();
});

admin.get('/stats', async (c) => c.json(await stats(c.env, int(c.req.query('days') ?? '30', 'Days', { min: 1, max: 365 }))));

admin.get('/courses', async (c) => c.json(await new Courses(c.env.DB).adminList()));

admin.get('/courses/:id/lessons', async (c) => c.json(await new Courses(c.env.DB).adminLessons(int(c.req.param('id'), 'Course', { min: 1 }))));

function courseInput(body: Record<string, unknown>): AdminCourseInput {
  const title = str(body.title, 'Title', { max: 160, required: true });
  const slug = slugify(str(body.slug, 'URL slug', { max: 100 }) || title);
  if (!slug) badRequest('The URL slug needs at least one letter or number.');
  if (!Array.isArray(body.lessons) || body.lessons.length > 500) badRequest('Lessons must be a list of at most 500.');
  return {
    slug, title,
    subtitle: str(body.subtitle, 'Subtitle', { max: 300 }),
    description: str(body.description, 'Description', { max: 20_000 }),
    imageUrl: url(body.imageUrl, 'Image'),
    price: int(body.price, 'Price', { max: 1_000_000 }),
    comparePrice: intOrNull(body.comparePrice, 'Regular price', { max: 1_000_000 }),
    status: oneOf(body.status, 'Status', ['draft', 'published'] as const),
    position: int(body.position ?? 0, 'Position', { max: 10_000 }),
    bumpCourseId: intOrNull(body.bumpCourseId, 'Offer course', { min: 1 }),
    bumpPrice: intOrNull(body.bumpPrice, 'Offer price', { max: 1_000_000 }),
    lessons: (body.lessons as unknown[]).map((raw, index) => {
      const lesson = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const at = `Lesson ${index + 1}`;
      return {
        id: intOrNull(lesson.id, `${at} id`, { min: 1, max: Number.MAX_SAFE_INTEGER }) ?? undefined,
        section: str(lesson.section, `${at} section`, { max: 120 }),
        title: str(lesson.title, `${at} title`, { max: 200, required: true }),
        videoUrl: url(lesson.videoUrl, `${at} video`),
        body: str(lesson.body, `${at} notes`, { max: 20_000 }),
        durationMinutes: int(lesson.durationMinutes ?? 0, `${at} minutes`, { max: 10_000 }),
      };
    }),
  };
}

admin.post('/courses', async (c) => c.json({ id: await new Courses(c.env.DB).save(null, courseInput(await jsonBody(c))) }));

admin.put('/courses/:id', async (c) => {
  const id = int(c.req.param('id'), 'Course', { min: 1 });
  return c.json({ id: await new Courses(c.env.DB).save(id, courseInput(await jsonBody(c))) });
});

admin.delete('/courses/:id', async (c) => {
  await new Courses(c.env.DB).remove(int(c.req.param('id'), 'Course', { min: 1 }));
  return c.json({ ok: true });
});

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

admin.post('/uploads', async (c) => {
  const file = (await c.req.formData().catch(() => null))?.get('file');
  if (!file || typeof file === 'string') return badRequest('Choose an image to upload.');
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return badRequest('Upload a JPG, PNG, WebP, AVIF or GIF image.');
  if (file.size > 8 * 1024 * 1024) return badRequest('Images must be 8 MB or smaller.');
  const key = `images/${crypto.randomUUID()}.${extension}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return c.json({ url: `/media/${key}` });
});

function couponInput(body: Record<string, unknown>): CouponInput {
  const code = str(body.code, 'Code', { max: 40, required: true });
  if (!/^[A-Za-z0-9_-]+$/.test(code)) badRequest('Codes can use letters, numbers, - and _.');
  const kind = oneOf(body.kind, 'Type', ['percent', 'fixed'] as const);
  return {
    code, kind,
    amount: int(body.amount, 'Amount', { min: 1, max: kind === 'percent' ? 100 : 1_000_000 }),
    courseId: intOrNull(body.courseId, 'Course', { min: 1 }),
    maxUses: intOrNull(body.maxUses, 'Max uses', { min: 1 }),
    expiresAt: intOrNull(body.expiresAt, 'Expiry', { min: 0, max: Number.MAX_SAFE_INTEGER }),
    active: body.active !== false,
  };
}

admin.get('/coupons', async (c) => c.json(await new Coupons(c.env.DB).list()));
admin.post('/coupons', async (c) => { await new Coupons(c.env.DB).save(null, couponInput(await jsonBody(c))); return c.json({ ok: true }); });
admin.put('/coupons/:id', async (c) => {
  await new Coupons(c.env.DB).save(int(c.req.param('id'), 'Coupon', { min: 1 }), couponInput(await jsonBody(c)));
  return c.json({ ok: true });
});
admin.delete('/coupons/:id', async (c) => {
  await new Coupons(c.env.DB).remove(int(c.req.param('id'), 'Coupon', { min: 1 }));
  return c.json({ ok: true });
});

admin.get('/orders', async (c) => c.json(await new Orders(c.env).list({
  status: c.req.query('status') ? oneOf(c.req.query('status'), 'Status', ['initiated', 'paid', 'failed', 'cancelled'] as const) : undefined,
  search: c.req.query('q')?.slice(0, 100),
})));

/** Record a payment taken outside the gateway (or test fulfilment): enrolls the buyer and emails them. */
admin.post('/orders/:id/mark-paid', async (c) => {
  const reference = str((await jsonBody(c)).reference, 'Reference', { max: 120 }) || null;
  await new Orders(c.env).fulfill(c.req.param('id'), 'manual', reference, origin(c), waitUntil(c));
  return c.json({ ok: true });
});

/** Ask EPS about an unpaid order (e.g. the buyer says they paid). Fulfils it if EPS confirms the payment. */
admin.post('/orders/:id/check-payment', async (c) => {
  const orders = new Orders(c.env);
  const order = await orders.byId(c.req.param('id'));
  if (!order) return notFound('Order not found.');
  if (!order.payment_txn) return badRequest('This order never reached the payment gateway.');
  return c.json({ paid: await orders.confirmPayment(order, origin(c), waitUntil(c)) });
});

admin.post('/orders/:id/cancel', async (c) => {
  await new Orders(c.env).setStatus(c.req.param('id'), 'cancelled');
  return c.json({ ok: true });
});

admin.get('/students', async (c) => c.json(await new Students(c.env.DB).list(c.req.query('q')?.slice(0, 100) ?? '')));

/** Give someone a course without an order (gifts, support cases). */
admin.post('/students/grant', async (c) => {
  const body = await jsonBody(c);
  const email = str(body.email, 'Email', { max: 200, required: true }).toLowerCase();
  if (!isEmail(email)) return badRequest('Enter a valid email address.');
  const course = await new Courses(c.env.DB).byId(int(body.courseId, 'Course', { min: 1 }));
  if (!course) return notFound('Course not found.');
  const students = new Students(c.env.DB);
  const id = await students.upsert(email, str(body.name, 'Name', { max: 100 }), '');
  await students.enrollStatement(id, course.id, null).run();
  if (body.notify === true) {
    const token = await students.createLoginToken(id, 7 * 24 * 60 * 60 * 1000);
    c.executionCtx.waitUntil(sendEmail(c.env, {
      to: email, subject: `You now have access to ${course.title}`,
      lines: [`You've been given access to ${course.title} on ${SITE.name}.`, 'Use the button below to start watching. No password needed.'],
      button: { label: 'Start learning', url: `${origin(c)}/auth?token=${encodeURIComponent(token)}` },
    }).catch((error) => console.error('Grant email failed', error)));
  }
  return c.json({ ok: true });
});

admin.post('/students/:id/revoke', async (c) => {
  await new Students(c.env.DB).revoke(int(c.req.param('id'), 'Student', { min: 1 }), int((await jsonBody(c)).courseId, 'Course', { min: 1 }));
  return c.json({ ok: true });
});

api.route('/admin', admin);
api.all('*', (c) => c.json({ error: 'Not found.' }, 404));

/* ====================================================================== */
/*  Pages, SEO files and media                                            */
/* ====================================================================== */

const app = new Hono<App>();
app.route('/api', api);

app.onError((error, c) => {
  console.error(error);
  return c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)));
});

app.get('/', async (c) => {
  const courses = await new Courses(c.env.DB).published();
  const base = siteBase(c);
  return renderPage(c.env, c.req.raw, {
    path: '/', title: SITE.name, description: SITE.description,
    jsonLd: [organization(base), website(base), courseList(base, courses), {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
    }],
    body: homeHtml(courses), boot: courses,
  });
});

app.get('/courses/:slug', async (c) => {
  const course = await new Courses(c.env.DB).detail(c.req.param('slug'));
  if (!course) {
    return renderPage(c.env, c.req.raw, {
      path: new URL(c.req.url).pathname, title: 'Course not found', description: SITE.description, noindex: true, status: 404,
      body: shellHtml('<h1>Course not found</h1><p><a href="/">See all courses</a></p>'), boot: null,
    });
  }
  return renderPage(c.env, c.req.raw, {
    path: `/courses/${course.slug}`, title: course.title, type: 'product',
    description: markdownToText(course.subtitle || course.description) || SITE.description,
    image: course.imageUrl, jsonLd: courseSchema(siteBase(c), course), body: courseHtml(course), boot: course,
  });
});

for (const page of STATIC_PAGES) {
  app.get(page.path, (c) => renderPage(c.env, c.req.raw, {
    path: page.path, title: page.title, description: page.description, type: 'article',
    jsonLd: [breadcrumbs(siteBase(c), [[page.title, page.path]]), ...(page.path === '/about' ? [organization(siteBase(c))] : [])],
    body: shellHtml(`<article><h1>${escapeHtml(page.title)}</h1>${renderMarkdown(page.body)}</article>`),
  }));
}

app.get('/robots.txt', (c) => c.text(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /my
Disallow: /learn/
Disallow: /checkout/
Disallow: /auth

Sitemap: ${siteBase(c)}/sitemap.xml
`, 200, { 'Cache-Control': 'public, max-age=3600' }));

app.get('/sitemap.xml', async (c) => {
  const base = siteBase(c);
  const { results } = await c.env.DB.prepare(`SELECT slug, updated_at FROM courses WHERE status = 'published' ORDER BY position, id DESC`)
    .all<{ slug: string; updated_at: number }>();
  const entries = [
    { loc: `${base}/`, lastmod: results.reduce((latest, row) => Math.max(latest, row.updated_at), 0), priority: '1.0' },
    ...results.map((row) => ({ loc: `${base}/courses/${encodeURIComponent(row.slug)}`, lastmod: row.updated_at, priority: '0.9' })),
    ...STATIC_PAGES.map((page) => ({ loc: `${base}${page.path}`, lastmod: 0, priority: page.path === '/about' ? '0.6' : '0.3' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url><loc>${escapeHtml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : ''}<priority>${entry.priority}</priority></url>`).join('\n')}
</urlset>`;
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
});

app.get('/media/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.slice('/media/'.length));
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

export default app;
