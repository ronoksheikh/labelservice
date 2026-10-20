import type { AdminOrder, CheckoutRequest, OrderReceipt, OrderStatus } from '../shared/types';
import { randomToken } from './auth';
import { Courses } from './courses';
import { Coupons } from './coupons';
import { purchaseEmail, sendEmail } from './email';
import { HttpError } from './errors';
import { newTransactionId, paymentGateway } from './payments';
import { applyCoupon, orderTotal } from './pricing';
import { PURCHASE_LINK_DAYS, Students } from './students';

interface OrderRow {
  id: string;
  access_key: string;
  course_id: number;
  name: string;
  email: string;
  phone: string;
  coupon_code: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  payment_provider: string | null;
  payment_ref: string | null;
  payment_txn: string | null;
  payment_method: string | null;
  visitor_id: string | null;
  source: string | null;
  created_at: number;
  paid_at: number | null;
}

interface ItemRow { order_id: string; course_id: number; title: string; price: number; is_bump: number; slug: string | null }

export class Orders {
  private readonly db: D1Database;
  constructor(private readonly env: Env) {
    this.db = env.DB;
  }

  byId(id: string) {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  }

  private async items(ids: string[]) {
    if (!ids.length) return new Map<string, ItemRow[]>();
    const { results } = await this.db.prepare(`SELECT i.*, c.slug FROM order_items i LEFT JOIN courses c ON c.id = i.course_id
      WHERE i.order_id IN (SELECT value FROM json_each(?)) ORDER BY i.is_bump`).bind(JSON.stringify(ids)).all<ItemRow>();
    const map = new Map<string, ItemRow[]>();
    for (const item of results) map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    return map;
  }

  /** Price the cart on the server, save the order and start payment. */
  async checkout(input: Required<Omit<CheckoutRequest, 'coupon' | 'visitorId' | 'source'>> & Pick<CheckoutRequest, 'coupon' | 'visitorId' | 'source'>,
    origin: string, ip: string | null, waitUntil: (promise: Promise<unknown>) => void) {
    const courses = new Courses(this.db);
    const course = await courses.bySlug(input.slug);
    if (!course || course.status !== 'published') throw new HttpError(404, 'This course is not available.');

    const owned = await this.db.prepare(`SELECT 1 FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE s.email = ? AND e.course_id = ?`).bind(input.email, course.id).first();
    if (owned) throw new HttpError(409, 'You already own this course. Sign in with this email to watch it.');

    const bump = input.bump ? await courses.bump(course) : null;
    let discount = 0;
    let couponCode: string | null = null;
    if (input.coupon) {
      const coupon = await new Coupons(this.db).byCode(input.coupon);
      const check = applyCoupon(coupon, course.id, course.price);
      if (!check.ok) throw new HttpError(400, check.error);
      discount = check.discount;
      couponCode = coupon!.code;
    }
    const { subtotal, total } = orderTotal(course.price, discount, bump?.price ?? null);

    const id = crypto.randomUUID();
    const key = randomToken(18);
    const items = [{ courseId: course.id, title: course.title, price: course.price, isBump: 0 },
      ...(bump ? [{ courseId: bump.courseId, title: bump.title, price: bump.price, isBump: 1 }] : [])];
    await this.db.batch([
      this.db.prepare(`INSERT INTO orders (id, access_key, course_id, name, email, phone, coupon_code, subtotal, discount, total,
        visitor_id, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, key, course.id, input.name, input.email, input.phone, couponCode, subtotal, discount, total,
          input.visitorId ?? null, input.source ?? null, Date.now()),
      ...items.map((item) => this.db.prepare('INSERT INTO order_items (order_id, course_id, title, price, is_bump) VALUES (?, ?, ?, ?, ?)')
        .bind(id, item.courseId, item.title, item.price, item.isBump)),
    ]);

    if (total === 0) {
      await this.fulfill(id, 'free', null, origin, waitUntil);
      return { orderId: id, key, redirectUrl: null };
    }
    const gateway = paymentGateway(this.env);
    if (!gateway) return { orderId: id, key, redirectUrl: null };
    const transactionId = newTransactionId();
    await this.db.prepare('UPDATE orders SET payment_provider = ?, payment_txn = ? WHERE id = ?').bind(gateway.name, transactionId, id).run();
    // The gateway sends the buyer back here; the Worker verifies the payment before showing the order page.
    const back = (result: string) => `${origin}/api/payments/${gateway.name}/return?order=${id}&k=${key}&result=${result}`;
    try {
      const redirectUrl = await gateway.start(
        { id, transactionId, total, name: input.name, email: input.email, phone: input.phone, ip, items },
        { success: back('success'), fail: back('failed'), cancel: back('cancelled') },
      );
      return { orderId: id, key, redirectUrl };
    } catch (error) {
      console.error(`Starting payment for order ${id} failed`, error);
      await this.db.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).bind(id).run();
      throw new HttpError(502, "We couldn't reach the payment gateway. Please try again in a minute.");
    }
  }

  /**
   * Ask the gateway whether an unpaid order has been paid, and fulfil it if so. Returns true when the order is paid.
   * Called when the buyer returns from the gateway and while the order page is open.
   */
  async confirmPayment(order: OrderRow, origin: string, waitUntil: (promise: Promise<unknown>) => void) {
    if (order.status === 'paid') return true;
    const gateway = paymentGateway(this.env);
    if (!gateway || order.payment_provider !== gateway.name || !order.payment_txn) return false;
    const result = await gateway.verify(order.payment_txn);
    if (result.status !== 'paid') return false;
    if (result.amount + 0.001 < order.total) {
      console.error(`Order ${order.id}: ${gateway.name} reports ${result.amount} paid, expected ${order.total}. Not fulfilling.`);
      return false;
    }
    await this.db.prepare('UPDATE orders SET payment_method = ? WHERE id = ?').bind(result.method, order.id).run();
    await this.fulfill(order.id, gateway.name, result.reference, origin, waitUntil);
    return true;
  }

  /**
   * Mark an order paid, enroll the buyer in every course on it and email them a sign-in link.
   * Safe to call more than once: only the first call does anything. Returns the student id.
   */
  async fulfill(id: string, provider: string, reference: string | null, origin: string, waitUntil: (promise: Promise<unknown>) => void) {
    const now = Date.now();
    const order = await this.db.prepare(`UPDATE orders SET status = 'paid', paid_at = ?, payment_provider = ?,
        payment_ref = COALESCE(?, payment_ref) WHERE id = ? AND status <> 'paid' RETURNING *`)
      .bind(now, provider, reference, id).first<OrderRow>();
    if (!order) {
      const existing = await this.byId(id);
      if (!existing) throw new HttpError(404, 'Order not found.');
      return (await new Students(this.db).byEmail(existing.email))?.id ?? null;
    }
    const students = new Students(this.db);
    const studentId = await students.upsert(order.email, order.name, order.phone);
    const items = (await this.items([id])).get(id) ?? [];
    await this.db.batch([
      ...items.map((item) => students.enrollStatement(studentId, item.course_id, id)),
      ...(order.coupon_code ? [this.db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').bind(order.coupon_code)] : []),
    ]);
    const token = await students.createLoginToken(studentId, PURCHASE_LINK_DAYS * 24 * 60 * 60 * 1000);
    const link = `${origin}/auth?token=${encodeURIComponent(token)}`;
    waitUntil(sendEmail(this.env, purchaseEmail(order.email, order.name, items, order.total, link))
      .catch((error) => console.error(`Purchase email for order ${id} failed`, error)));
    return studentId;
  }

  async receipt(id: string, key: string): Promise<Omit<OrderReceipt, 'signedIn'> | null> {
    const order = await this.byId(id);
    if (!order || order.access_key !== key) return null;
    const items = (await this.items([id])).get(id) ?? [];
    return {
      id: order.id, status: order.status, name: order.name, email: order.email,
      items: items.map((item) => ({ courseId: item.course_id, slug: item.slug ?? '', title: item.title, price: item.price })),
      subtotal: order.subtotal, discount: order.discount, total: order.total, createdAt: order.created_at, paidAt: order.paid_at,
    };
  }

  async setStatus(id: string, status: 'failed' | 'cancelled') {
    // Only unpaid orders change; a paid order is never downgraded.
    const result = await this.db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status <> 'paid'`).bind(status, id).run();
    if (!result.meta.changes) throw new HttpError(409, 'Paid orders cannot be cancelled here.');
  }

  /* ---------- Admin ---------- */

  async list(filter: { status?: string; search?: string; since?: number; limit?: number }): Promise<AdminOrder[]> {
    const where: string[] = [];
    const binds: unknown[] = [];
    if (filter.status) { where.push('o.status = ?'); binds.push(filter.status); }
    if (filter.since) { where.push('o.created_at >= ?'); binds.push(filter.since); }
    if (filter.search) {
      where.push('(o.email LIKE ? OR o.name LIKE ? OR o.phone LIKE ? OR o.id LIKE ?)');
      binds.push(...Array(4).fill(`%${filter.search.replace(/[%_]/g, '')}%`));
    }
    const { results } = await this.db.prepare(`SELECT o.*, c.title AS course_title FROM orders o JOIN courses c ON c.id = o.course_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.created_at DESC LIMIT ?`)
      .bind(...binds, filter.limit ?? 300).all<OrderRow & { course_title: string }>();
    const items = await this.items(results.map((row) => row.id));
    return results.map((row) => ({
      id: row.id, status: row.status, name: row.name, email: row.email, phone: row.phone, courseTitle: row.course_title,
      items: (items.get(row.id) ?? []).map((item) => item.title), couponCode: row.coupon_code, subtotal: row.subtotal,
      discount: row.discount, total: row.total, source: row.source, paymentProvider: row.payment_provider, paymentRef: row.payment_ref, paymentMethod: row.payment_method,
      createdAt: row.created_at, paidAt: row.paid_at,
    }));
  }
}
