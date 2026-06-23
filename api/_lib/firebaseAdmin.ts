/**
 * Shared Firebase Admin initialization for serverless API routes.
 * ---------------------------------------------------------------------------
 * Files in `api/_lib/` are NOT deployed as endpoints (Vercel ignores paths
 * beginning with `_`), so this is safe to import from any function under api/.
 *
 * Credentials follow the same convention as the repo's scripts: a service
 * account JSON string in the `FIREBASE_SERVICE_ACCOUNT_JSON` env var. As a
 * fallback we use Application Default Credentials (handy on Google infra / when
 * GOOGLE_APPLICATION_CREDENTIALS points at a key file).
 *
 * The app is initialized lazily and memoized so warm serverless invocations
 * reuse a single Admin app (re-initializing throws).
 */
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

let cachedApp: App | null = null;

function init(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApp();
    return cachedApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined;

  if (raw) {
    let parsed: Record<string, unknown>;
    try {
      // Allow either raw JSON or base64-encoded JSON (some hosts mangle newlines).
      const text = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      parsed = JSON.parse(text);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON).');
    }
    cachedApp = initializeApp({
      credential: cert(parsed as any),
      projectId: projectId || (parsed.project_id as string | undefined),
    });
  } else {
    // No explicit key — rely on Application Default Credentials.
    cachedApp = initializeApp({ credential: applicationDefault(), projectId });
  }

  return cachedApp;
}

/** Whether server-side Admin access can be initialized (a credential exists). */
export function isAdminConfigured(): boolean {
  return (
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !!process.env.GOOGLE_CLOUD_PROJECT
  );
}

/** Firestore Admin instance. */
export function getDb(): Firestore {
  return getFirestore(init());
}

/** Verify a Firebase ID token; returns the decoded token (throws if invalid). */
export function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  return getAuth(init()).verifyIdToken(idToken);
}
