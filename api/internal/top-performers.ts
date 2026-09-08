/**
 * GET /api/internal/top-performers?limit=<n>&since=<ISO8601>
 * ─────────────────────────────────────────────────────────
 * READ-ONLY. The Academy's half of the cross-platform view the admissions
 * platform (`edlight-apply`) needs in order to award the 50 Coursera licences
 * reserved for EdLight's own community. EdLight Code exposes the identical
 * contract from its own deployment; apply calls both and merges the answers.
 *
 * Auth: shared secret in a header — see api/_lib/internalAuth.ts. Never a
 * query parameter. Rejections are an opaque 401.
 *
 * Ranking: a verified learning score, NOT leaderboard XP. The reasoning, and
 * what was rejected, is documented at the top of api/_lib/internalDirectory.ts.
 * Learners who opted out of the public leaderboard are excluded here too.
 *
 * Response:
 *   {
 *     platform: 'academy',
 *     metric, metricDescription, generatedAt,
 *     performers: [{ id, name, email, phone, score, rank, completedCount,
 *                    lastActiveAt, countryHint, profileUrl }]
 *   }
 *
 * `phone` is always null and `countryHint` is self-declared and often absent —
 * both are honest nulls, not placeholders. See internalDirectory.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireInternalSecret } from '../_lib/internalAuth';
import { getDb, isAdminConfigured } from '../_lib/firebaseAdmin';
import {
  clampLimit,
  emptyEvidence,
  isOptedOutOfRanking,
  parseSince,
  rankPerformers,
  type DirectoryRow,
} from '../_lib/internalDirectory';
import { loadAllEvidence, loadIdentityRows } from '../_lib/internalDirectoryStore';

const METRIC = 'Verified learning score';

const METRIC_DESCRIPTION =
  'Adds up how well each learner did on the work we can prove they finished — ' +
  'lessons confirmed by a chapter test or a scored exercise, and past Bac exam ' +
  'papers they actually sat and had graded — where a perfect item is worth 10 ' +
  'points; time spent on the trivia and arcade games, which is what earns the ' +
  'public leaderboard points, counts for nothing here.';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Auth first: an unauthenticated caller learns nothing, not even the methods.
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

  const limit = clampLimit(req.query.limit);
  const sinceMs = parseSince(req.query.since);

  try {
    const db = getDb();
    const [identities, evidence] = await Promise.all([
      loadIdentityRows(db),
      loadAllEvidence(db),
    ]);

    const rows: DirectoryRow[] = identities.map((row) => ({
      ...row,
      optedOut: isOptedOutOfRanking({
        entryExists: row.entryExists,
        entryHidden: row.entryHidden,
        optedIn: row.optedIn,
      }),
      evidence: evidence.get(row.id) ?? emptyEvidence(),
    }));

    res.status(200).json({
      platform: 'academy',
      metric: METRIC,
      metricDescription: METRIC_DESCRIPTION,
      generatedAt: new Date().toISOString(),
      performers: rankPerformers(rows, { limit, sinceMs }),
    });
  } catch (err) {
    console.error('[internal/top-performers] error:', err);
    res.status(500).json({ error: 'lookup_failed' });
  }
}
