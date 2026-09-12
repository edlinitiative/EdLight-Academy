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
import {
  isFresh,
  isQuotaExhausted,
  readPerformerCache,
  writePerformerCache,
} from '../_lib/internalPerformerCache';

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
  const fresh = String(req.query.fresh ?? '') === '1';
  const db = getDb();
  const nowMs = Date.now();

  /*
    Serve the stored snapshot when there is a usable one.

    Computing this answer costs a full scan of the database — up to 75,000
    document reads against a Spark tier that allows 50,000 a DAY — so a single
    uncached call can exhaust the project. Serving from the snapshot costs one
    read. See `internalPerformerCache.ts` for the whole reckoning.

    `limit` and `since` are applied to the CACHED rows rather than being part of
    the cache key: the expensive half is gathering every learner's evidence, and
    ranking and slicing that is arithmetic. One snapshot therefore answers every
    limit and every window.
  */
  if (!fresh) {
    try {
      const cached = await readPerformerCache(db);
      if (isFresh(cached, nowMs)) {
        const body = cached.payload as { rows?: DirectoryRow[] };
        if (Array.isArray(body.rows)) {
          res.setHeader('x-cache', 'hit');
          res.status(200).json({
            platform: 'academy',
            metric: METRIC,
            metricDescription: METRIC_DESCRIPTION,
            generatedAt: new Date(cached.computedAtMs).toISOString(),
            performers: rankPerformers(body.rows, { limit, sinceMs }),
          });
          return;
        }
      }
    } catch (err) {
      // A cache that cannot be READ is not a reason to fail: fall through and
      // compute. Unless it is the quota, in which case computing is hopeless
      // and the honest answer is that this project is out of reads.
      if (isQuotaExhausted(err)) {
        res.status(503).json({
          error: 'quota_exhausted',
          detail:
            'EdLight Academy has used its Firestore read quota for today. It resets at '
            + 'midnight US/Pacific. Upgrading the project to the Blaze plan removes the cap.',
        });
        return;
      }
      console.error('[internal/top-performers] cache read failed:', err);
    }
  }

  try {
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

    // Store the ROWS, not the ranked slice: the caller's limit and window are
    // applied on the way out, so one snapshot serves every request shape.
    await writePerformerCache(db, { rows }, nowMs);

    res.setHeader('x-cache', fresh ? 'bypass' : 'miss');
    res.status(200).json({
      platform: 'academy',
      metric: METRIC,
      metricDescription: METRIC_DESCRIPTION,
      generatedAt: new Date(nowMs).toISOString(),
      performers: rankPerformers(rows, { limit, sinceMs }),
    });
  } catch (err) {
    /*
      Quota is its own answer.

      Every fault used to come back as 500 `lookup_failed`, so Apply's console
      said "EdLight Academy is not available right now" while the real message,
      two Firebase projects away, was "Quota exceeded". A caller cannot retry
      its way out of that and neither can this code: the remedy is a billing
      plan. 503 says try later, which is true — it clears at midnight Pacific.
    */
    if (isQuotaExhausted(err)) {
      console.error('[internal/top-performers] Firestore read quota exhausted');
      res.status(503).json({
        error: 'quota_exhausted',
        detail:
          'EdLight Academy has used its Firestore read quota for today. It resets at '
          + 'midnight US/Pacific. Upgrading the project to the Blaze plan removes the cap.',
      });
      return;
    }
    console.error('[internal/top-performers] error:', err);
    res.status(500).json({ error: 'lookup_failed' });
  }
}
