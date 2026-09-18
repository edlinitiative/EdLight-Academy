/**
 * Vercel serverless function: /api/arena/questions
 * ────────────────────────────────────────────────
 * Authoring for tournament questions — the ONLY way they can be read or
 * written, because `firestore.rules` denies every client read of
 * `tournaments/{tid}/questions/**`, admins included.
 *
 * That denial is not an oversight to work around here. The entire integrity
 * model of the Arena rests on the answer key existing server-side only: the
 * product's everyday trivia bank ships inside the app WITH its answers, and a
 * tournament with prize money cannot do that. A rule that admits "admins can
 * read" would put the key behind a browser session, and a browser session is
 * exactly what a compromised laptop or a shared login hands over.
 *
 * So the key travels through this endpoint, under a server-verified admin
 * check, and nowhere else.
 *
 * GET  ?tid=…            → list questions WITHOUT answerIndex (for the table)
 * GET  ?tid=…&index=3    → one question WITH answerIndex (for the editor)
 * POST { tid, question } → upsert one question
 *
 * Admin is verified by reading `users/{uid}.role` with the Admin SDK — never
 * from a custom claim the client could stale-cache, and never from the request.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';

/** A prompt nobody can finish reading is a prompt nobody can answer in time. */
const MAX_PROMPT = 240;
const MAX_OPTION = 120;
const OPTION_COUNT = 4;

interface AuthoredQuestion {
  index: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  answerIndex: number;
  explanation?: string;
  category?: string;
  difficulty?: number;
}

const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').trim().slice(0, max);

/**
 * What the LIST view may see. The editor asks for one question at a time and
 * gets the key; the table never does, so a screenshot of an authoring session
 * cannot leak twenty-five answers at once.
 */
function withoutKey(q: AuthoredQuestion): Omit<AuthoredQuestion, 'answerIndex'> & { authored: boolean } {
  const { answerIndex, ...rest } = q;
  return { ...rest, authored: answerIndex >= 0 };
}

export function validateQuestion(raw: unknown): { ok: true; value: AuthoredQuestion } | { ok: false; reason: string } {
  const q = (raw ?? {}) as Record<string, unknown>;
  const index = Math.round(Number(q.index));
  if (!Number.isFinite(index) || index < 0 || index > 200) return { ok: false, reason: 'index' };

  const prompt = str(q.prompt, MAX_PROMPT);
  if (prompt.length < 8) return { ok: false, reason: 'prompt' };

  const options = Array.isArray(q.options) ? q.options.map((o) => str(o, MAX_OPTION)) : [];
  if (options.length !== OPTION_COUNT || options.some((o) => !o)) return { ok: false, reason: 'options' };

  const optionsHt = Array.isArray(q.optionsHt) ? q.optionsHt.map((o) => str(o, MAX_OPTION)) : [];
  // Kreyòl is optional per option, but a PARTIAL translation is worse than
  // none: a student reading in Kreyòl would get some options in French and
  // could not tell whether that was the question or a bug.
  if (optionsHt.length > 0 && (optionsHt.length !== OPTION_COUNT || optionsHt.some((o) => !o))) {
    return { ok: false, reason: 'optionsHt' };
  }

  const answerIndex = Math.round(Number(q.answerIndex));
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= OPTION_COUNT) {
    return { ok: false, reason: 'answerIndex' };
  }

  return {
    ok: true,
    value: {
      index,
      prompt,
      promptHt: str(q.promptHt, MAX_PROMPT),
      options,
      optionsHt,
      answerIndex,
      explanation: str(q.explanation, 600),
      category: str(q.category, 60),
      difficulty: Number.isFinite(Number(q.difficulty)) ? Math.round(Number(q.difficulty)) : 3,
    },
  };
}

async function isAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDb().doc(`users/${uid}`).get();
    return snap.exists && (snap.data() as { role?: string })?.role === 'admin';
  } catch {
    // A failed role lookup is NOT an admin. This endpoint hands out answer
    // keys; the safe direction on an error is always "no".
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;

  const { allowed } = await checkRateLimit(decoded.uid, 'arena-questions');
  if (!allowed) {
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return;
  }

  if (!(await isAdmin(decoded.uid))) {
    res.status(403).json({ error: 'not_admin' });
    return;
  }

  const db = getDb();

  if (req.method === 'GET') {
    const tid = String(req.query.tid ?? '');
    if (!tid) { res.status(400).json({ error: 'missing_tid' }); return; }

    const indexRaw = req.query.index;
    if (indexRaw !== undefined) {
      const index = Math.round(Number(indexRaw));
      const snap = await db.doc(`tournaments/${tid}/questions/${index}`).get();
      if (!snap.exists) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ ok: true, question: snap.data() });
      return;
    }

    const snap = await db.collection(`tournaments/${tid}/questions`).orderBy('index').get();
    res.status(200).json({
      ok: true,
      questions: snap.docs.map((d) => withoutKey(d.data() as AuthoredQuestion)),
    });
    return;
  }

  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as Record<string, unknown>;
    const tid = String(body.tid ?? '');
    if (!tid) { res.status(400).json({ error: 'missing_tid' }); return; }

    const parsed = validateQuestion(body.question);
    if (!parsed.ok) { res.status(400).json({ error: 'invalid_question', field: parsed.reason }); return; }

    // A question cannot be edited once its window has opened: the students who
    // already answered answered a different question, and re-scoring them
    // against a new key would be indefensible.
    const live = await db.doc(`tournaments/${tid}/live/${parsed.value.index}`).get();
    if (live.exists) { res.status(409).json({ error: 'already_delivered' }); return; }

    await db.doc(`tournaments/${tid}/questions/${parsed.value.index}`).set(parsed.value, { merge: true });
    res.status(200).json({ ok: true, index: parsed.value.index });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
