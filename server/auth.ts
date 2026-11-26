import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import { verifySessionToken, type SessionPayload } from './domain.ts';

export const SESSION_COOKIE = 'doptube_session';

const FALLBACK_SESSION_SECRET = createHash('sha256')
  .update('sodium-booster-bv9wh:ai-studio-doptube-aa4523de-08c1-49e2-88b8-a324bef5d6ed:doptube-session-v1')
  .digest('hex');

export function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || FALLBACK_SESSION_SECRET).trim();
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
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function hydrateSessionUserIfMissing(payload: SessionPayload): { id: string; role: 'user' | 'creator' | 'admin' } | null {
  const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.userId) as
    | { id: string; role: 'user' | 'creator' | 'admin' }
    | undefined;
  if (existing) return existing;

  // On ephemeral Vercel serverless /tmp SQLite instances, re-hydrate verified signed token claims
  if (!payload.email) return null;

  const nowIso = new Date().toISOString();
  const safeName = (payload.name || payload.email.split('@')[0] || 'DopTube User').trim();
  const safeEmail = payload.email.trim().toLowerCase();
  const safeLang = payload.preferredLanguage || 'English';
  const chId = `ch_${payload.userId.replace(/^u_/, '')}`;
  const avatarUrl = payload.avatarUrl || `/api/avatars/${chId}.svg`;
  const cleanBase = (payload.handle || `@${safeName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator'}`).replace(/^@*/, '@');

  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar_url, birthday, role, preferred_language, email_verified, created_at)
      VALUES (?, ?, ?, 'session_hydrated', ?, ?, ?, ?, 1, ?)
    `).run(payload.userId, safeName, safeEmail, avatarUrl, payload.birthday || '', payload.role, safeLang, nowIso);

    const existingChannel = db.prepare('SELECT id FROM channels WHERE user_id = ?').get(payload.userId);
    if (!existingChannel) {
      let handle = cleanBase;
      if (db.prepare('SELECT id FROM channels WHERE handle = ?').get(handle)) {
        handle = `${cleanBase}_${payload.userId.slice(-4)}`;
      }
      db.prepare(`
        INSERT OR IGNORE INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '#000000', 0, 0, ?)
      `).run(chId, payload.userId, safeName, handle, `Official DopTube channel of ${safeName}.`, avatarUrl, nowIso);
    }

    db.prepare(`
      INSERT OR IGNORE INTO user_preferences (
        user_id, preferred_languages_json, preferred_categories_json, selected_interests_json,
        preferred_format, personalization_enabled, infinite_scroll_enabled, autoplay_enabled,
        onboarding_completed, updated_at
      ) VALUES (?, ?, '[]', '[]', 'all', 1, 1, 1, 1, ?)
    `).run(payload.userId, JSON.stringify([safeLang]), nowIso);

    return { id: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearerToken || cookies[SESSION_COOKIE];
  if (token) {
    const payload = verifySessionToken(token, getSessionSecret());
    if (payload) {
      const userRow = hydrateSessionUserIfMissing(payload);
      if (userRow) {
        req.auth = { ...payload, role: userRow.role };
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

export function setSessionCookie(res: Response, token: string, req?: Request) {
  const isHttps =
    Boolean(req?.secure) ||
    req?.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL || '').startsWith('https://');

  if (isHttps) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  } else {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearSessionCookie(res: Response, req?: Request) {
  const isHttps =
    Boolean(req?.secure) ||
    req?.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL || '').startsWith('https://');

  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    ...(isHttps ? { secure: true, sameSite: 'none', partitioned: true } : { sameSite: 'lax' }),
  });
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
