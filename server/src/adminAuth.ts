/**
 * 运营后台鉴权（对齐 hbtc-mechanism）：
 * - ADMIN_TOKEN 只存在服务端环境变量，登录后发 HttpOnly Cookie
 * - 口令不进 localStorage；失败尝试按 IP 限流
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { HttpError } from './chain.ts';

export const ADMIN_COOKIE = 'chipet_admin';
export const ADMIN_SESSION_TTL_SEC = 8 * 3600;
export const MIN_ADMIN_TOKEN_LEN = 16;

type SessionStore = Map<string, number>;

const sessions: SessionStore = new Map();

/** 每 IP：15 分钟窗口最多 10 次失败（登录或鉴权失败）。 */
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60_000;
const fails = new Map<string, { n: number; resetAt: number }>();

export function adminTokenConfigured(): boolean {
  const t = process.env.ADMIN_TOKEN ?? '';
  return t.length >= MIN_ADMIN_TOKEN_LEN;
}

export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN ?? '';
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

export function tokenMatches(want: string, got: string): boolean {
  if (want.length < MIN_ADMIN_TOKEN_LEN || !got) return false;
  const a = sha256(want);
  const b = sha256(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientIp(c: Context): string {
  const xf = c.req.header('x-forwarded-for');
  if (xf) return xf.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

/** @returns false 若已超限 */
export function allowFailAttempt(ip: string): boolean {
  const now = Date.now();
  const cur = fails.get(ip);
  if (!cur || now >= cur.resetAt) {
    fails.set(ip, { n: 1, resetAt: now + FAIL_WINDOW_MS });
    return true;
  }
  if (cur.n >= FAIL_LIMIT) return false;
  cur.n += 1;
  return true;
}

export function createSession(): string {
  const id = randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + ADMIN_SESSION_TTL_SEC * 1000);
  return id;
}

export function sessionValid(id: string | undefined): boolean {
  if (!id) return false;
  const exp = sessions.get(id);
  if (exp == null) return false;
  if (Date.now() > exp) {
    sessions.delete(id);
    return false;
  }
  sessions.set(id, Date.now() + ADMIN_SESSION_TTL_SEC * 1000);
  return true;
}

export function revokeSession(id: string | undefined) {
  if (id) sessions.delete(id);
}

function cookieSecure(c: Context): boolean {
  if (c.req.header('x-forwarded-proto')?.toLowerCase() === 'https') return true;
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function setAdminSessionCookie(c: Context, id: string) {
  setCookie(c, ADMIN_COOKIE, id, {
    path: '/api/admin',
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Strict',
    maxAge: ADMIN_SESSION_TTL_SEC,
  });
}

export function clearAdminSessionCookie(c: Context) {
  deleteCookie(c, ADMIN_COOKIE, { path: '/api/admin' });
}

export function readAdminSession(c: Context): string | undefined {
  return getCookie(c, ADMIN_COOKIE);
}

function bearerToken(c: Context): string {
  const h = c.req.header('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** 保护 /api/admin/*（login 除外）：Cookie 会话或 Bearer ADMIN_TOKEN。 */
export function requireAdmin(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!adminTokenConfigured()) {
      throw new HttpError(503, 'admin is not configured');
    }
    const cookie = readAdminSession(c);
    const bearer = bearerToken(c);
    if (sessionValid(cookie) || tokenMatches(getAdminToken(), bearer)) {
      await next();
      return;
    }
    const probed = Boolean(cookie) || Boolean(bearer);
    if (probed && !allowFailAttempt(clientIp(c))) {
      c.header('Retry-After', '900');
      throw new HttpError(429, 'too many failed attempts, try again later');
    }
    throw new HttpError(401, 'unauthorized');
  };
}

export { clientIp };
