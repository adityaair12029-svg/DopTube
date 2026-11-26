import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGooglePopup(): Promise<{ idToken: string }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const idToken = await credential.user.getIdToken();
  return { idToken };
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signout error if not signed into firebase
  }
}

export function onFirebaseAuthState(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function syncUserProfileToFirestore(params: {
  displayName: string;
  handle: string;
  avatarUrl: string;
  email: string;
  preferredLanguage: string;
  historyPaused: boolean;
  personalizationEnabled: boolean;
  restrictedMode: boolean;
  theme: 'dark' | 'light';
  selectedInterests: string[];
}): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const uid = current.uid.slice(0, 128);
  const safeDisplayName = params.displayName.trim().slice(0, 100) || 'DopTube Creator';
  const safeHandle = params.handle.trim().slice(0, 64) || `@user${uid.slice(0, 6)}`;
  const safeAvatar = (params.avatarUrl || '').slice(0, 512);
  const safeEmail = params.email.trim().slice(0, 200);
  const safeLang = params.preferredLanguage.trim().slice(0, 40) || 'English';
  const safeInterests = params.selectedInterests
    .map((i) => i.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 15);

  const publicPath = `users/${uid}/public/profile`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'public', 'profile'),
      {
        uid,
        displayName: safeDisplayName,
        handle: safeHandle,
        avatarUrl: safeAvatar,
        preferredLanguage: safeLang,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  const privatePath = `users/${uid}/private/info`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'private', 'info'),
      {
        uid,
        email: safeEmail,
        historyPaused: Boolean(params.historyPaused),
        personalizationEnabled: Boolean(params.personalizationEnabled),
        restrictedMode: Boolean(params.restrictedMode),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    // Only ignore createdAt conflict on subsequent updates; otherwise surface structured error
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, privatePath);
    }
  }

  const prefPath = `user_preferences/${uid}`;
  try {
    await setDoc(
      doc(db, 'user_preferences', uid),
      {
        uid,
        theme: params.theme,
        preferredLanguage: safeLang,
        selectedInterests: safeInterests,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, prefPath);
  }
}
