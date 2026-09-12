/**
 * GET /api/cron-trivia — one small batch of new trivia questions, nightly.
 *
 * ── The cost ceiling, which is structural ───────────────────────────────────
 * One category per night, round-robin, one LLM request, at most
 * MAX_PER_NIGHT questions. The number of calls is fixed by the schedule and
 * not by traffic, so this cannot run away: at gemini-3.6-flash prices a run is
 * a fraction of a cent and a month is a few cents, well inside the $10 budget.
 *
 * Round-robin rather than "whichever is smallest" so the four categories grow
 * evenly and the same one cannot absorb every run.
 *
 * ── Why it publishes without review ─────────────────────────────────────────
 * That was the explicit choice. It means `rejectionReason` is the only thing
 * between a draft and a student, so the generator is restricted to categories
 * where correctness is structural — arithmetic, vocabulary, symbols, anatomy —
 * and the Haitian history, culture, proverb and sport banks are never touched
 * by it. A fabricated date reads exactly like a real one; a wrong multiplication
 * does not survive contact with a calculator.
 *
 * ── Why a bad batch is dropped whole ────────────────────────────────────────
 * If fewer than MIN_TO_PUBLISH survive validation, nothing is written. A run
 * that yields two usable questions out of twelve is a run that went wrong, and
 * publishing its remnants would put the least-checked output of a bad night
 * into the game.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';

import { getDb, isAdminConfigured } from './_lib/firebaseAdmin';
import { GENERATABLE, draftQuestions, normalise, type GeneratableCategory } from './_lib/triviaGenerate';
// Plain data, no browser imports — safe to load in a serverless function.
import { TRIVIA_QUESTIONS } from '../src/data/triviaData';

export const maxDuration = 60;

/** ~15 a night doubles the four thin banks in about a month. */
const MAX_PER_NIGHT = 15;
/** Below this the run is treated as failed and nothing is published. */
const MIN_TO_PUBLISH = 5;
/** A ceiling no run may push a category past without a person deciding to. */
const CATEGORY_CAP = 400;

const QUESTIONS = 'trivia_questions';
const STATE_DOC = 'internalCache/triviaGenerator';

function authorised(req: VercelRequest): boolean {
  const secret = String(process.env.CRON_SECRET ?? '').trim();
  // Vercel signs its own cron calls; a manual run needs the shared secret.
  if (req.headers['x-vercel-cron']) return true;
  if (!secret) return false;
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  return given === secret;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!authorised(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!isAdminConfigured()) { res.status(503).json({ error: 'server_misconfigured' }); return; }

  const db = getDb();
  try {
    // Whose turn it is. Stored so the rotation survives cold starts.
    const stateRef = db.doc(STATE_DOC);
    const state = (await stateRef.get()).data() as { lastIndex?: number } | undefined;
    const index = ((state?.lastIndex ?? -1) + 1) % GENERATABLE.length;
    const category: GeneratableCategory = GENERATABLE[index];

    /*
      Everything already in this category, so a draft cannot restate one — and
      that means the SHIPPED bank as well as Firestore.

      Deduping against Firestore alone looked sufficient and is not: the ~100
      hand-written questions per category live in src/data/triviaData.ts, not
      in the collection. The first dry run of this generator duly produced
      "Quelle est la racine carrée de 81 ?", which the shipped maths bank has
      had all along. The read-time merge would have dropped it, so no student
      would have seen it twice — but the slot would have been wasted every
      night on questions that already exist.
    */
    const snap = await db.collection(QUESTIONS).where('categoryId', '==', category).get();
    const existing = new Set<string>();
    for (const q of (TRIVIA_QUESTIONS as Record<string, Array<{ q?: string }>>)[category] ?? []) {
      if (q?.q) existing.add(normalise(q.q));
    }
    for (const doc of snap.docs) {
      const q = (doc.data() as { q?: string }).q;
      if (q) existing.add(normalise(q));
    }

    if (snap.size >= CATEGORY_CAP) {
      await stateRef.set({ lastIndex: index, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ category, skipped: 'category_at_cap', size: snap.size });
      return;
    }

    const { accepted, rejected } = await draftQuestions(category, MAX_PER_NIGHT, existing);

    if (accepted.length < MIN_TO_PUBLISH) {
      await stateRef.set({ lastIndex: index, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ category, published: 0, accepted: accepted.length, rejected, note: 'below MIN_TO_PUBLISH, nothing written' });
      return;
    }

    const batch = db.batch();
    for (const q of accepted) {
      batch.set(db.collection(QUESTIONS).doc(), {
        categoryId: category,
        q: q.q,
        qHt: q.qHt,
        options: q.options,
        answer: q.answer,
        // What makes the reader APPEND this to the shipped bank rather than
        // replace it — see the merge in src/hooks/useTriviaContent.ts.
        source: 'generated',
        created_at: FieldValue.serverTimestamp(),
      });
    }
    batch.set(stateRef, { lastIndex: index, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();

    res.status(200).json({ category, published: accepted.length, rejected });
  } catch (err) {
    console.error('[cron-trivia]', err);
    res.status(500).json({ error: 'generation_failed' });
  }
}
