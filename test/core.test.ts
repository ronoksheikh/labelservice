import { describe, expect, test } from 'bun:test';
import { markdownToText, renderMarkdown } from '../shared/markdown';
import { isBdPhone, normalizePhone, slugify, taka, videoEmbed } from '../shared/site';
import { trafficSource } from '../shared/source';
import { applyCoupon, orderTotal, type CouponRow } from '../worker/pricing';

const coupon = (patch: Partial<CouponRow> = {}): CouponRow => ({
  id: 1, code: 'LAUNCH20', kind: 'percent', amount: 20, course_id: null, max_uses: null, used_count: 0,
  expires_at: null, active: 1, created_at: 0, ...patch,
});

describe('pricing', () => {
  test('percent and fixed coupons', () => {
    expect(applyCoupon(coupon(), 1, 2990)).toEqual({ ok: true, discount: 598, label: '20% off' });
    expect(applyCoupon(coupon({ kind: 'fixed', amount: 500 }), 1, 2990)).toMatchObject({ ok: true, discount: 500 });
  });
  test('a discount never exceeds the price', () => {
    expect(applyCoupon(coupon({ kind: 'fixed', amount: 9999 }), 1, 990)).toMatchObject({ ok: true, discount: 990 });
    expect(applyCoupon(coupon({ amount: 150 }), 1, 990)).toMatchObject({ ok: true, discount: 990 });
  });
  test('rejects inactive, expired, used-up and wrong-course coupons', () => {
    expect(applyCoupon(null, 1, 100).ok).toBe(false);
    expect(applyCoupon(coupon({ active: 0 }), 1, 100).ok).toBe(false);
    expect(applyCoupon(coupon({ expires_at: 10 }), 1, 100, 20).ok).toBe(false);
    expect(applyCoupon(coupon({ max_uses: 3, used_count: 3 }), 1, 100).ok).toBe(false);
    expect(applyCoupon(coupon({ course_id: 2 }), 1, 100).ok).toBe(false);
  });
  test('order total adds the offer and subtracts the discount', () => {
    expect(orderTotal(2990, 598, 490)).toEqual({ subtotal: 3480, discount: 598, total: 2882 });
    expect(orderTotal(990, 990, null).total).toBe(0);
  });
});

describe('markdown', () => {
  test('escapes HTML', () => {
    expect(renderMarkdown('<script>alert(1)</script> **hi**')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>hi</strong></p>');
  });
  test('lists, headings and links', () => {
    expect(renderMarkdown('## Title\n- a\n- *b*\n\n[x](https://a.com) /path')).toBe(
      '<h3>Title</h3>\n<ul><li>a</li><li><em>b</em></li></ul>\n<p><a href="https://a.com" target="_blank" rel="noopener noreferrer">x</a> /path</p>');
  });
  test('does not allow javascript: or protocol-relative links', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a');
    expect(renderMarkdown('[x](//evil.com)')).not.toContain('<a');
  });
  test('plain text for meta descriptions', () => {
    expect(markdownToText('## Hi\n**Bold** [link](https://a.com)')).toBe('Hi Bold link');
  });
});

describe('site helpers', () => {
  test('taka uses Bangladeshi grouping', () => expect(taka(125000)).toBe('৳1,25,000'));
  test('phone numbers', () => {
    expect(normalizePhone('+880 1712-345678')).toBe('01712345678');
    expect(normalizePhone('1712345678')).toBe('01712345678');
    expect(isBdPhone('01712345678')).toBe(true);
    expect(isBdPhone('01212345678')).toBe(false);
  });
  test('slugify', () => expect(slugify('The YouTube Blueprint: Make Content!')).toBe('the-youtube-blueprint-make-content'));
  test('video embeds', () => {
    expect(videoEmbed('https://youtu.be/M7lc1UVf-VE')?.src).toContain('youtube-nocookie.com/embed/M7lc1UVf-VE');
    expect(videoEmbed('https://vimeo.com/123456')?.src).toBe('https://player.vimeo.com/video/123456');
    expect(videoEmbed('https://cdn.example.com/a.mp4')?.kind).toBe('file');
    expect(videoEmbed('javascript:alert(1)')).toBeNull();
  });
  test('traffic sources', () => {
    expect(trafficSource('https://twobytes.dev/?fbclid=x', '', 'twobytes.dev')).toBe('facebook');
    expect(trafficSource('https://twobytes.dev/', 'https://l.facebook.com/', 'twobytes.dev')).toBe('facebook');
    expect(trafficSource('https://twobytes.dev/?utm_source=Newsletter', '', 'twobytes.dev')).toBe('newsletter');
    expect(trafficSource('https://twobytes.dev/', 'https://twobytes.dev/about', 'twobytes.dev')).toBe('direct');
  });
});
