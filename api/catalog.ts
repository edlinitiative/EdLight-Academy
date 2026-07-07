/**
 * GET /api/catalog  (CDN-edge-cached course catalog)
 * ---------------------------------------------------------------------------
 * Reads the `courses`, `videos` and `quizzes` collections ONCE server-side via
 * Firebase Admin and returns them as a single combined JSON payload. The
 * response is cached at Vercel's CDN edge (`s-maxage`), so many concurrent
 * mobile clients hit the CDN instead of each reading the whole collections
 * straight from Firestore.
 *
 * Response shape:
 *   { courses: [{id, ...}], videos: [{id, ...}], quizzes: [{id, ...}],
 *     generatedAt: <ISO string> }
 *
 * Caching: `public, s-maxage=3600, stale-while-revalidate=86400` — the CDN
 * serves a cached copy for 1h, then serves a stale copy for up to 24h more
 * while it refreshes in the background. Read-only endpoint.
 *
 * Credentials are handled by _lib/firebaseAdmin (FIREBASE_SERVICE_ACCOUNT_JSON
 * or Application Default Credentials). Same env var used by send-reminders.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, isAdminConfigured } from './_lib/firebaseAdmin';

async function readCollection(
  db: FirebaseFirestore.Firestore,
  name: string,
): Promise<Array<Record<string, unknown>>> {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(501).json({
      error: 'not_configured',
      message:
        'Set FIREBASE_SERVICE_ACCOUNT_JSON (or Application Default Credentials) to enable /api/catalog.',
    });
    return;
  }

  try {
    const db = getDb();
    const [courses, videos, quizzes] = await Promise.all([
      readCollection(db, 'courses'),
      readCollection(db, 'videos'),
      readCollection(db, 'quizzes'),
    ]);

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      courses,
      videos,
      quizzes,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[catalog] failed to read collections', err);
    res.status(500).json({ error: 'catalog_failed', message: (err as Error).message });
  }
}
