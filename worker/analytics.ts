import type { DailyStat, Stats } from '../shared/types';
import { Orders } from './orders';

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|preview|headless|lighthouse|pingdom|curl|wget|python|axios|go-http/i;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Bangladesh calendar day of a unix-ms column.
const day = (column: string) => `date((${column} + ${DHAKA_OFFSET_MS}) / 1000, 'unixepoch')`;

export function device(userAgent: string) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(userAgent)) return 'tablet';
  return /mobi|iphone|android/i.test(userAgent) ? 'mobile' : 'desktop';
}

export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent);

export async function recordView(db: D1Database, view: {
  visitorId: string; path: string; courseId: number | null; source: string; country: string | null; userAgent: string;
}) {
  await db.prepare(`INSERT INTO page_views (visitor_id, path, course_id, source, country, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(view.visitorId, view.path, view.courseId, view.source, view.country, device(view.userAgent), Date.now()).run();
}

export async function stats(env: Env, days: number): Promise<Stats> {
  const db = env.DB;
  // Start of the first Bangladesh day in the range.
  const todayStart = Math.floor((Date.now() + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
  const since = todayStart - (days - 1) * DAY_MS;

  const [views, checkouts, purchases, courses, sources, countries, totals, recentOrders] = await Promise.all([
    db.prepare(`SELECT ${day('created_at')} AS date, COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS views
      FROM page_views WHERE created_at >= ? GROUP BY date`).bind(since).all<{ date: string; visitors: number; views: number }>(),
    db.prepare(`SELECT ${day('created_at')} AS date, COUNT(*) AS checkouts FROM orders WHERE created_at >= ? GROUP BY date`)
      .bind(since).all<{ date: string; checkouts: number }>(),
    db.prepare(`SELECT ${day('paid_at')} AS date, COUNT(*) AS purchases, SUM(total) AS revenue FROM orders
      WHERE status = 'paid' AND paid_at >= ? GROUP BY date`).bind(since).all<{ date: string; purchases: number; revenue: number }>(),
    db.prepare(`SELECT c.id, c.title,
        (SELECT COUNT(DISTINCT visitor_id) FROM page_views v WHERE v.course_id = c.id AND v.created_at >= ?1) AS views,
        (SELECT COUNT(*) FROM orders o WHERE o.course_id = c.id AND o.created_at >= ?1) AS checkouts,
        (SELECT COUNT(*) FROM orders o WHERE o.course_id = c.id AND o.status = 'paid' AND o.paid_at >= ?1) AS purchases,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.course_id = c.id AND o.status = 'paid' AND o.paid_at >= ?1) AS revenue
      FROM courses c ORDER BY revenue DESC, views DESC LIMIT 20`).bind(since)
      .all<{ id: number; title: string; views: number; checkouts: number; purchases: number; revenue: number }>(),
    db.prepare(`SELECT v.source, COUNT(DISTINCT v.visitor_id) AS visitors,
        (SELECT COUNT(*) FROM orders o WHERE o.source = v.source AND o.status = 'paid' AND o.paid_at >= ?1) AS purchases
      FROM page_views v WHERE v.created_at >= ?1 GROUP BY v.source ORDER BY visitors DESC LIMIT 10`).bind(since)
      .all<{ source: string; visitors: number; purchases: number }>(),
    db.prepare(`SELECT COALESCE(country, '??') AS country, COUNT(DISTINCT visitor_id) AS visitors FROM page_views
      WHERE created_at >= ? GROUP BY country ORDER BY visitors DESC LIMIT 8`).bind(since).all<{ country: string; visitors: number }>(),
    db.prepare('SELECT COUNT(DISTINCT visitor_id) AS visitors FROM page_views WHERE created_at >= ?').bind(since).first<{ visitors: number }>(),
    new Orders(env).list({ limit: 8 }),
  ]);

  const byDate = new Map<string, DailyStat>();
  for (let index = 0; index < days; index++) {
    const date = new Date(since + index * DAY_MS + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
    byDate.set(date, { date, visitors: 0, views: 0, checkouts: 0, purchases: 0, revenue: 0 });
  }
  for (const row of views.results) Object.assign(byDate.get(row.date) ?? {}, { visitors: row.visitors, views: row.views });
  for (const row of checkouts.results) Object.assign(byDate.get(row.date) ?? {}, { checkouts: row.checkouts });
  for (const row of purchases.results) Object.assign(byDate.get(row.date) ?? {}, { purchases: row.purchases, revenue: row.revenue });
  const daily = [...byDate.values()];
  const sum = (key: keyof Omit<DailyStat, 'date'>) => daily.reduce((total, row) => total + row[key], 0);
  const visitors = totals?.visitors ?? 0;
  const checkoutCount = sum('checkouts');
  const purchaseCount = sum('purchases');

  return {
    days,
    totals: {
      visitors, views: sum('views'), checkouts: checkoutCount, purchases: purchaseCount, revenue: sum('revenue'),
      conversionRate: visitors ? purchaseCount / visitors : 0,
      checkoutRate: checkoutCount ? purchaseCount / checkoutCount : 0,
    },
    daily,
    courses: courses.results,
    sources: sources.results,
    countries: countries.results,
    recentOrders,
  };
}
