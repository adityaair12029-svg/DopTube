import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

interface FirebaseAppletConfig {
  projectId?: string;
}

const FALLBACK_FIREBASE_PROJECT_ID = 'sodium-booster-bv9wh';

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

export async function verifyFirebaseGoogleToken(idToken: string): Promise<VerifiedGoogleIdentity | null> {
  const projectId = loadProjectId();
  if (!projectId || !idToken || typeof idToken !== 'string') {
    return null;
  }
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
}
