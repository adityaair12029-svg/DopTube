import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

interface FirebaseAppletConfig {
  projectId?: string;
}

function loadProjectId(): string | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
    if (!raw.projectId || raw.projectId === 'remixed-project-id') return null;
    return raw.projectId;
  } catch {
    return null;
  }
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
