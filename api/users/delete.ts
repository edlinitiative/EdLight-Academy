/**
 * Self-service account deletion.
 * ---------------------------------------------------------------------------
 * POST /api/users/delete   (Authorization: Bearer <Firebase ID token>)
 *
 * Deletes the CALLER'S own account: their Firebase Auth user AND all of their
 * Firestore data. Server-side (Admin SDK) so it works without a recent-login
 * re-auth and guarantees data is actually removed — required for the in-app
 * "Delete account" flow (Apple Guideline 5.1.1(v), Google Play data-deletion).
 *
 * Data removed (see firestore.rules for the full model):
 *   • users/{uid} + all subcollections (progress, quizAttempts, notifications,
 *     reminders, settings, pushSubscriptions, examAttempts, examResults,
 *     studyPlans, streaks, gamification) — via recursiveDelete
 *   • leaderboards/{period}/entries/{uid} across every period
 *   • comments authored by the user (+ their replies) and replies the user
 *     left under others' comments
 *   • chatConversations (Sandra transcripts) and commentReports they filed
 *
 * Data steps are best-effort and logged; the Auth deletion is the one that
 * must succeed for the response to be a success.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getAuthAdmin, isAdminConfigured } from '../_lib/firebaseAdmin';
import { requireAuth } from '../_lib/requireAuth';

/** Delete an array of doc refs in chunked batches (Firestore caps at 500/batch). */
async function deleteRefs(db: FirebaseFirestore.Firestore, refs: FirebaseFirestore.DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured', message: 'Firebase Admin is not configured.' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return; // response already sent

  const db = getDb();
  const warnings: string[] = [];

  // Each data step is best-effort — a failure in one must not block the rest
  // or the Auth deletion. We collect warnings for observability.
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      warnings.push(`${label}: ${e?.message || 'failed'}`);
      console.error(`[delete-account] ${label} failed for ${uid}:`, e);
    }
  };

  // 1. The user document tree (doc + every subcollection).
  await step('user_tree', () => db.recursiveDelete(db.collection('users').doc(uid)));

  // 2. Leaderboard entries: entry id == uid, one per period. Enumerate periods
  //    (avoids a collection-group index dependency).
  await step('leaderboard_entries', async () => {
    const periods = await db.collection('leaderboards').listDocuments();
    await Promise.all(periods.map((p) => p.collection('entries').doc(uid).delete()));
  });

  // 3. Comments the user authored (+ their replies, via recursiveDelete).
  await step('comments', async () => {
    const snap = await db.collection('comments').where('authorId', '==', uid).get();
    for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
  });

  // 4. Replies the user left under other people's comments.
  await step('replies', async () => {
    const snap = await db.collectionGroup('replies').where('authorId', '==', uid).get();
    await deleteRefs(db, snap.docs.map((d) => d.ref));
  });

  // 5. Sandra chat transcripts.
  await step('chat', async () => {
    const snap = await db.collection('chatConversations').where('uid', '==', uid).get();
    await deleteRefs(db, snap.docs.map((d) => d.ref));
  });

  // 6. Comment reports the user filed.
  await step('reports', async () => {
    const snap = await db.collection('commentReports').where('reporterId', '==', uid).get();
    await deleteRefs(db, snap.docs.map((d) => d.ref));
  });

  // 7. The Auth account itself — this one must succeed.
  try {
    await getAuthAdmin().deleteUser(uid);
  } catch (e: any) {
    // user-not-found means it's already gone — treat as success.
    if (e?.code !== 'auth/user-not-found') {
      console.error(`[delete-account] auth deletion failed for ${uid}:`, e);
      res.status(500).json({ error: 'auth_delete_failed', message: 'Could not delete the account. Please try again.', warnings });
      return;
    }
  }

  res.status(200).json({ ok: true, deleted: uid, warnings });
}
