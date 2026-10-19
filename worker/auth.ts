import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';

const COOKIE = 'arvono_session';
const MAX_AGE = 14 * 24 * 60 * 60;
const encoder = new TextEncoder();
const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Sessions are signed with the dashboard password, so changing it signs everyone out.
async function sign(password: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`arvono-labels:${password}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function equal(a: string, b: string) {
  const [x, y] = await Promise.all([a, b].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(x!, y!);
}

export async function isSignedIn(c: Context<{ Bindings: Env }>) {
  const password = c.env.DASHBOARD_PASSWORD;
  const cookie = getCookie(c, COOKIE);
  if (!password || !cookie) return false;
  const [expires, signature] = cookie.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return equal(signature, await sign(password, expires));
}

export async function signIn(c: Context<{ Bindings: Env }>, password: string) {
  const expected = c.env.DASHBOARD_PASSWORD;
  if (!expected || !(await equal(password, expected))) return false;
  const expires = String(Date.now() + MAX_AGE * 1000);
  setCookie(c, COOKIE, `${expires}.${await sign(expected, expires)}`, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: MAX_AGE,
  });
  return true;
}

export const signOut = (c: Context) => deleteCookie(c, COOKIE, { path: '/' });
