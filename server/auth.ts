import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import { verifySessionToken, type SessionPayload } from './domain.ts';

export const SESSION_COOKIE = 'doptube_session';

const FALLBACK_DEV_SECRET = 'doptube-india-dev-session-secret-key-2026';

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || FALLBACK_DEV_SECRET;
}

export interface AuthedRequest extends Request {
  auth?: SessionPayload;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const payload = verifySessionToken(token, getSessionSecret());
    if (payload) {
      const exists = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.userId) as
        | { id: string; role: 'user' | 'creator' | 'admin' }
        | undefined;
      if (exists) {
        req.auth = { ...payload, role: exists.role };
      }
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.auth.role !== 'admin') {
    res.status(403).json({ error: 'Administrator permission required.' });
    return;
  }
  next();
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}
