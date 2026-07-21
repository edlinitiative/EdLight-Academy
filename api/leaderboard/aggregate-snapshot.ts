/**
 * GET|POST /api/leaderboard/aggregate-snapshot  (cron job)
 * ────────────────────────────────────────────────────────
 * Precomputes the collective leaderboards (schools / cities / departments) so
 * the read endpoint (GET /api/leaderboard/collectives) can serve them with a
 * single doc read instead of scanning the whole entries collection on every
 * cache miss. Triggered by Vercel Cron (see vercel.json → "crons").
 *
 * This is a pure optimization and is fully OPTIONAL: collectives.ts falls back
 * to a live scan whenever a snapshot is missing or stale, so if this cron never
 * runs (or fails), the board is still correct — just computed the slower way.
 *
 * For each period (current week + all-time) it scans the entries ONCE and, from
 * that single in-memory array, aggregates all three fields, writing one doc per
 * field:
 *   leaderboards/{weekId | 'all-time'}/collectives/{field}
 *     { field, period, count, groups, generatedAtMs, generatedAt }
 *
 * Security: same model as api/send-reminders.ts — Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` to cron invocations; we require it (also
 * accepting `x-cron-secret`) so the public can't trigger the scan.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import { aggregateBy, type GroupField, type LeaderboardEntry } from '../../shared/leaderboardAgg';

/** Upper bound on entries scanned per period — bounds Firestore read cost. */
const ENTRIES_CAP = 5000;
/** Members carried on each group for the drill-down preview. */
const MEMBER_PREVIEW = 50;
/** Ranked groups stored per field — keeps each snapshot doc well under 1MB. */
const MAX_GROUPS = 200;
const ALL_TIME_ID = 'all-time';
const FIELDS: GroupField[] = ['school', 'city', 'department'];

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

/** A public alias must contain at least one letter (matches leaderboardService). */
function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/** ISO-8601 week id, e.g. "2026-W26" — identical logic to leaderboardService. */
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
  const periods: Array<{ period: 'week' | 'all'; id: string }> = [
    { period: 'week', id: weekId() },
    { period: 'all', id: ALL_TIME_ID },
  ];

  try {
    const written: Record<string, number> = {};

    for (const { period, id } of periods) {
      // One scan per period; all three fields aggregate from the same array.
      const snap = await db
        .collection(`leaderboards/${id}/entries`)
        .orderBy('xp', 'desc')
        .limit(ENTRIES_CAP)
        .get();

      const entries: LeaderboardEntry[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as LeaderboardEntry)
        .filter((e) => isValidAlias(e.displayName));

      const generatedAtMs = Date.now();
      await Promise.all(
        FIELDS.map((field) => {
          const groups = aggregateBy(entries, field, MEMBER_PREVIEW).slice(0, MAX_GROUPS);
          written[`${id}/${field}`] = groups.length;
          return db.doc(`leaderboards/${id}/collectives/${field}`).set({
            field,
            period,
            count: entries.length,
            groups,
            generatedAtMs,
            generatedAt: FieldValue.serverTimestamp(),
          });
        }),
      );
    }

    res.status(200).json({ ok: true, written });
  } catch (err) {
    console.error('[leaderboard/aggregate-snapshot] error:', err);
    res.status(500).json({ error: 'snapshot_failed' });
  }
}
