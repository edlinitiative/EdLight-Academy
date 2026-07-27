/**
 * GET|POST /api/aggregate-question-stats  (cron job)
 * ───────────────────────────────────────────────────
 * Rolls the append-only `answerEvents` log into per-question crowd difficulty:
 *   questionStats/{questionId} = { seen, correct, updatedAtMs }
 * from which clients derive difficulty (adaptiveEngine.crowdDifficulty) to serve
 * each learner questions in their challenge band (Adaptive Engine, Slice 3b).
 *
 * Incremental + idempotent: a cursor doc (aggregatorState/questionStats) tracks
 * the last-processed event timestamp, so each run only folds in NEW events and
 * uses FieldValue.increment — re-running never double-counts already-processed
 * events (only ones strictly newer than the cursor are read).
 *
 * Security: same model as api/leaderboard/aggregate-snapshot.ts — Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` to cron invocations; we require it (also
 * accepting `x-cron-secret`) so the public can't trigger the scan.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './_lib/firebaseAdmin';

/** Events folded per run — bounds Firestore read cost; cron runs often enough. */
const BATCH = 5000;
/** Per-batch write cap (Firestore batches allow 500 ops; stay under). */
const WRITE_CHUNK = 400;
const CURSOR_DOC = 'aggregatorState/questionStats';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false; // refuse to run unprotected
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  return (
    (!!bearer && timingSafeEqual(bearer, secret)) ||
    (!!headerSecret && timingSafeEqual(headerSecret, secret))
  );
}

/** A questionId must be a non-empty, slash-free string (it's a doc id). */
function isValidQuestionId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && !id.includes('/');
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const db = getDb();
  try {
    const cursorRef = db.doc(CURSOR_DOC);
    const cursorSnap = await cursorRef.get();
    const lastMs: number = cursorSnap.exists ? Number(cursorSnap.data()?.lastProcessedMs ?? 0) : 0;

    // Only events strictly newer than the cursor — makes re-runs idempotent.
    const snap = await db
      .collection('answerEvents')
      .where('createdMs', '>', lastMs)
      .orderBy('createdMs', 'asc')
      .limit(BATCH)
      .get();

    if (snap.empty) {
      res.status(200).json({ ok: true, processed: 0, cursor: lastMs });
      return;
    }

    // Accumulate per-question deltas in memory, then write increments in bulk.
    const deltas = new Map<string, { seen: number; correct: number }>();
    let maxMs = lastMs;
    snap.forEach((d) => {
      const e = d.data() as { questionId?: unknown; correct?: unknown; createdMs?: unknown };
      const qid = e.questionId;
      if (isValidQuestionId(qid)) {
        const cur = deltas.get(qid) || { seen: 0, correct: 0 };
        cur.seen += 1;
        if (e.correct === true) cur.correct += 1;
        deltas.set(qid, cur);
      }
      if (typeof e.createdMs === 'number' && e.createdMs > maxMs) maxMs = e.createdMs;
    });

    const nowMs = Date.now();
    const entries = [...deltas.entries()];
    for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
      const batch = db.batch();
      for (const [qid, delta] of entries.slice(i, i + WRITE_CHUNK)) {
        batch.set(
          db.doc(`questionStats/${qid}`),
          {
            seen: FieldValue.increment(delta.seen),
            correct: FieldValue.increment(delta.correct),
            updatedAtMs: nowMs,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    // Advance the cursor past the newest event folded in this run.
    await cursorRef.set(
      { lastProcessedMs: maxMs, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    res.status(200).json({
      ok: true,
      processed: snap.size,
      questionsTouched: deltas.size,
      cursor: maxMs,
    });
  } catch (err) {
    console.error('[aggregate-question-stats] error:', err);
    res.status(500).json({ error: 'aggregation_failed' });
  }
}
