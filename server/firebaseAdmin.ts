import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface FirebaseAppletConfig {
  projectId?: string;
}

const FALLBACK_FIREBASE_PROJECT_ID = 'sodium-booster-bv9wh';
const GOOGLE_X509_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

function loadProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
      if (raw.projectId && raw.projectId !== 'remixed-project-id') return raw.projectId;
    }
  } catch {
    // fall through to embedded project id
  }
  return process.env.FIREBASE_PROJECT_ID || FALLBACK_FIREBASE_PROJECT_ID;
}

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as T;
}

async function fetchGoogleSecureTokenCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const resp = await fetch(GOOGLE_X509_CERTS_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    throw new Error(`Unable to fetch Google public token certificates (${resp.status}).`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheHeader = resp.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheHeader);
  const ttlSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  cachedCerts = {
    certs,
    expiresAt: Date.now() + ttlSec * 1000,
  };
  return certs;
}

async function verifyJwtWithGoogleCerts(idToken: string, projectId: string): Promise<VerifiedGoogleIdentity | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }>(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) return null;

  const certs = await fetchGoogleSecureTokenCerts();
  const certPem = certs[header.kid];
  if (!certPem) return null;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const sigBuf = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!verifier.verify(certPem, sigBuf)) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 300) return null;
  if (!payload.email || payload.email_verified !== true) return null;

  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name || payload.email.split('@')[0] || 'DopTube User',
    picture: payload.picture || '',
  };
}

export async function verifyFirebaseGoogleToken(idToken: string): Promise<VerifiedGoogleIdentity | null> {
  const projectId = loadProjectId();
  if (!projectId || !idToken || typeof idToken !== 'string') {
    return null;
  }

  try {
    const [{ getApp, getApps, initializeApp }, { getAuth }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
    ]);
    const app = getApps().length ? getApp() : initializeApp({ projectId });
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (!decoded.email || decoded.email_verified !== true) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      emailVerified: Boolean(decoded.email_verified),
      name: decoded.name || decoded.email.split('@')[0] || 'DopTube User',
      picture: decoded.picture || '',
    };
  } catch {
    return verifyJwtWithGoogleCerts(idToken, projectId);
  }
}
