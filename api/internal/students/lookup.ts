/**
 * GET /api/internal/students/lookup?emailKey=&nameSortKey=&phoneKey=
 * ─────────────────────────────────────────────────────────────────
 * READ-ONLY. Answers "do you already know this person?" so the admissions
 * platform can deduplicate a licence candidate against learners this Academy
 * already holds, without ever holding a credential for this project.
 *
 * Any combination of keys may be supplied; a learner matching ANY of the
 * present keys is returned (a union, per the contract). No keys at all returns
 * an empty list rather than the whole roster.
 *
 * The keys are the admissions platform's own normalised forms; the mirrored
 * implementations, and why they are duplicated rather than shared, are in
 * api/_lib/internalDirectory.ts.
 *
 * Auth: shared secret in a header — see api/_lib/internalAuth.ts.
 *
 * Response: { platform: 'academy', students: [ <person, minus score/rank> ] }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireInternalSecret } from '../../_lib/internalAuth';
import { getDb, isAdminConfigured } from '../../_lib/firebaseAdmin';
import {
  emptyEvidence,
  matchStudents,
  scoreLearning,
  toPerson,
} from '../../_lib/internalDirectory';
import { loadEvidenceFor, loadIdentityRows } from '../../_lib/internalDirectoryStore';

/** First value only — a repeated query parameter arrives as an array. */
function one(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireInternalSecret(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured' });
    return;
  }

  const query = {
    emailKey: one(req.query.emailKey),
    nameSortKey: one(req.query.nameSortKey),
    phoneKey: one(req.query.phoneKey),
  };

  try {
    const db = getDb();
    // One identity scan, then evidence for the matches only — a candidate check
    // must not cost a full collection-group sweep of everybody's coursework.
    const identities = await loadIdentityRows(db);
    const matched = matchStudents(identities, query);

    if (!matched.length) {
      res.status(200).json({ platform: 'academy', students: [] });
      return;
    }

    const evidence = await loadEvidenceFor(db, matched.map((row) => row.id));
    const students = matched.map((row) => {
      const { completedCount } = scoreLearning(evidence.get(row.id) ?? emptyEvidence());
      return toPerson(row, completedCount);
    });

    res.status(200).json({ platform: 'academy', students });
  } catch (err) {
    console.error('[internal/students/lookup] error:', err);
    res.status(500).json({ error: 'lookup_failed' });
  }
}
