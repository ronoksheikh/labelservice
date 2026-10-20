// Pure pricing rules, shared by the coupon preview and checkout so both always agree.
import { taka } from '../shared/site';

export interface CouponRow {
  id: number;
  code: string;
  kind: 'percent' | 'fixed';
  amount: number;
  course_id: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: number | null;
  active: number;
  created_at: number;
}

export type CouponCheck = { ok: true; discount: number; label: string } | { ok: false; error: string };

/** The discount a coupon gives on one course price. Coupons never touch the checkout offer. */
export function applyCoupon(coupon: CouponRow | null, courseId: number, price: number, now = Date.now()): CouponCheck {
  if (!coupon || !coupon.active) return { ok: false, error: 'This coupon code is not valid.' };
  if (coupon.expires_at !== null && coupon.expires_at < now) return { ok: false, error: 'This coupon has expired.' };
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return { ok: false, error: 'This coupon has been fully used.' };
  if (coupon.course_id !== null && coupon.course_id !== courseId) return { ok: false, error: 'This coupon is for a different course.' };
  const raw = coupon.kind === 'percent' ? Math.round((price * Math.min(coupon.amount, 100)) / 100) : coupon.amount;
  const discount = Math.max(0, Math.min(price, raw));
  return { ok: true, discount, label: coupon.kind === 'percent' ? `${Math.min(coupon.amount, 100)}% off` : `${taka(coupon.amount)} off` };
}

export function orderTotal(price: number, discount: number, bumpPrice: number | null) {
  const subtotal = price + (bumpPrice ?? 0);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
