import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { HttpError } from './errors';

type C = Context<{ Bindings: Env }>;

const ADMIN_COOKIE = 'tb_admin';
const STUDENT_COOKIE = 'tb_session';
const ADMIN_MAX_AGE = 14 * 24 * 60 * 60;
const STUDENT_MAX_AGE = 180 * 24 * 60 * 60;
const encoder = new TextEncoder();

export const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(value: string) {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function secret(c: C) {
  const value = c.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new HttpError(500, 'SESSION_SECRET is not set (use at least 16 characters).');
  return value;
}

async function sign(key: string, value: string) {
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', hmac, encoder.encode(value)));
}

export async function equal(a: string, b: string) {
  const [x, y] = await Promise.all([a, b].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(x!, y!);
}

/** Cookie value "<subject>.<expires>.<signature>"; returns the subject when valid. */
async function readCookie(c: C, name: string, key: string) {
  const [subject, expires, signature] = (getCookie(c, name) ?? '').split('.');
  if (!subject || !expires || !signature || Number(expires) < Date.now()) return null;
  return (await equal(signature, await sign(key, `${name}.${subject}.${expires}`))) ? subject : null;
}

async function writeCookie(c: C, name: string, key: string, subject: string, maxAge: number) {
  const expires = String(Date.now() + maxAge * 1000);
  setCookie(c, name, `${subject}.${expires}.${await sign(key, `${name}.${subject}.${expires}`)}`, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge,
  });
}

/* ---------- Admin: one shared password; changing it signs every admin out ---------- */

const adminKey = (c: C) => `${secret(c)}:admin:${c.env.ADMIN_PASSWORD ?? ''}`;

export async function isAdmin(c: C) {
  return Boolean(c.env.ADMIN_PASSWORD) && (await readCookie(c, ADMIN_COOKIE, adminKey(c))) === 'admin';
}

export async function adminSignIn(c: C, password: string) {
  const expected = c.env.ADMIN_PASSWORD;
  if (!expected || !(await equal(password, expected))) return false;
  await writeCookie(c, ADMIN_COOKIE, adminKey(c), 'admin', ADMIN_MAX_AGE);
  return true;
}

export const adminSignOut = (c: C) => deleteCookie(c, ADMIN_COOKIE, { path: '/' });

/* ---------- Students: passwordless, signed in by an email link or right after paying ---------- */

const studentKey = (c: C) => `${secret(c)}:student`;

export async function studentId(c: C) {
  const subject = await readCookie(c, STUDENT_COOKIE, studentKey(c));
  return subject && /^\d+$/.test(subject) ? Number(subject) : null;
}

export const studentSignIn = (c: C, id: number) => writeCookie(c, STUDENT_COOKIE, studentKey(c), String(id), STUDENT_MAX_AGE);
export const studentSignOut = (c: C) => deleteCookie(c, STUDENT_COOKIE, { path: '/' });
