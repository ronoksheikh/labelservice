import type { Coupon, CouponInput } from '../shared/types';
import { HttpError } from './errors';
import { normalizeCode, type CouponRow } from './pricing';

const toCoupon = (row: CouponRow & { course_title: string | null }): Coupon => ({
  id: row.id, code: row.code, kind: row.kind, amount: row.amount, courseId: row.course_id, courseTitle: row.course_title,
  maxUses: row.max_uses, usedCount: row.used_count, expiresAt: row.expires_at, active: Boolean(row.active), createdAt: row.created_at,
});

export class Coupons {
  constructor(private readonly db: D1Database) {}

  byCode(code: string) {
    return this.db.prepare('SELECT * FROM coupons WHERE code = ?').bind(normalizeCode(code)).first<CouponRow>();
  }

  async list() {
    const { results } = await this.db.prepare(`SELECT k.*, c.title AS course_title FROM coupons k
      LEFT JOIN courses c ON c.id = k.course_id ORDER BY k.active DESC, k.created_at DESC`).all<CouponRow & { course_title: string | null }>();
    return results.map(toCoupon);
  }

  async save(id: number | null, input: CouponInput) {
    const code = normalizeCode(input.code);
    const clash = await this.db.prepare('SELECT id FROM coupons WHERE code = ? AND id IS NOT ?').bind(code, id).first();
    if (clash) throw new HttpError(409, 'A coupon with this code already exists.');
    const values = [code, input.kind, input.amount, input.courseId, input.maxUses, input.expiresAt, input.active ? 1 : 0];
    if (id === null) {
      await this.db.prepare(`INSERT INTO coupons (code, kind, amount, course_id, max_uses, expires_at, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, Date.now()).run();
    } else {
      const result = await this.db.prepare(`UPDATE coupons SET code = ?, kind = ?, amount = ?, course_id = ?, max_uses = ?,
        expires_at = ?, active = ? WHERE id = ?`).bind(...values, id).run();
      if (!result.meta.changes) throw new HttpError(404, 'Coupon not found.');
    }
  }

  remove(id: number) {
    return this.db.prepare('DELETE FROM coupons WHERE id = ?').bind(id).run();
  }
}
