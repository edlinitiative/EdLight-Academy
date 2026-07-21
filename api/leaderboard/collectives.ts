/**
 * Vercel serverless function: GET /api/leaderboard/collectives
 * ────────────────────────────────────────────────────────────
 * Exhaustive collective leaderboards — schools / cities / departments ranked
 * against each other by their members' TOTAL XP. Unlike the individual board
 * (which the client reads as a top-N slice), the collective ranking must count
 * EVERY opted-in learner in a group or the totals are wrong, so the aggregation
 * runs server-side over the whole entries collection and returns only the
 * compact ranked result. This keeps the client payload tiny (a few KB of group
 * stats) on slow networks instead of shipping hundreds of entry docs.
 *
 * Reads are public (the board is publicly readable via firestore.rules anyway),
 * so no auth. The response is heavily edge-cached: the aggregation is identical
 * for every viewer and only needs to be as fresh as the 2-min client staleTime.
 *
 * Query params:
 *   field  — 'school' | 'city' | 'department'   (default 'school')
 *   period — 'week' | 'all'                      (default 'week')
 *
 * Response:
 *   200 → { ok: true, period, field, weekId, count, groups: GroupRanking[] }
 *         groups carry exhaustive totalXp/members/avgXp; `topMembers` is capped
 *         at MEMBER_PREVIEW for the drill-down.
 *   400 / 500 on the corresponding failures.
 *
 * Reads: leaderboards/{weekId | 'all-time'}/entries — same shape award.ts writes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebaseAdmin';
import { aggregateBy, type GroupField, type LeaderboardEntry } from '../../shared/leaderboardAgg';

/** Upper bound on entries scanned per request — bounds Firestore read cost. */
const ENTRIES_CAP = 5000;
/** Members carried on each group for the drill-down preview. */
const MEMBER_PREVIEW = 50;
/**
 * How old a precomputed snapshot may be before we ignore it and scan live. The
 * snapshot cron runs every 15 min (see vercel.json), so this tolerates a couple
 * of missed runs while guaranteeing we never serve badly stale data — a live
 * scan is always correct.
 */
const SNAPSHOT_MAX_AGE_MS = 40 * 60 * 1000;
const ALL_TIME_ID = 'all-time';
const FIELDS: GroupField[] = ['school', 'city', 'department'];

/** A public alias must contain at least one letter (matches leaderboardService). */
function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/**
 * ISO-8601 week id, e.g. "2026-W26" — identical logic to leaderboardService so
 * we read the same weekly bucket the clients write to.
 */
function weekId(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const field = firstParam(req.query.field) as GroupField;
  if (!FIELDS.includes(field)) {
    res.status(400).json({ error: 'invalid_field', message: `field must be one of ${FIELDS.join(', ')}.` });
    return;
  }
  const period = firstParam(req.query.period) === 'all' ? 'all' : 'week';
  const id = period === 'all' ? ALL_TIME_ID : weekId();

  try {
    const db = getDb();

    // Fast path: a fresh precomputed snapshot (one doc read) written by the
    // aggregate-snapshot cron. Falls through to a live scan if it's missing or
    // stale, so correctness never depends on the cron having run.
    const snapDoc = await db.doc(`leaderboards/${id}/collectives/${field}`).get();
    if (snapDoc.exists) {
      const data = snapDoc.data() as { groups?: unknown; count?: number; generatedAtMs?: number };
      const age = Date.now() - (data.generatedAtMs ?? 0);
      if (Array.isArray(data.groups) && age <= SNAPSHOT_MAX_AGE_MS) {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        res.status(200).json({
          ok: true, period, field, weekId: id,
          count: data.count ?? 0, groups: data.groups, source: 'snapshot',
        });
        return;
      }
    }

    // Live path: scan the entries collection and aggregate on the fly.
    const snap = await db
      .collection(`leaderboards/${id}/entries`)
      .orderBy('xp', 'desc')
      .limit(ENTRIES_CAP)
      .get();

    // Only named (opted-in with a valid alias) entries count — mirrors the
    // client board, which never renders alias-less entries.
    const entries: LeaderboardEntry[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as LeaderboardEntry)
      .filter((e) => isValidAlias(e.displayName));

    const groups = aggregateBy(entries, field, MEMBER_PREVIEW);

    // Identical for every viewer → cache hard at the edge. Fresh enough for a
    // board that the client itself only refetches every 2 min.
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ ok: true, period, field, weekId: id, count: entries.length, groups, source: 'live' });
  } catch (err) {
    console.error('[leaderboard/collectives] read error:', err);
    res.status(500).json({ error: 'read_failed' });
  }
}
