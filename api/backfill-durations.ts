/**
 * GET /api/backfill-durations  (admin/one-off maintenance)
 * ---------------------------------------------------------------------------
 * Replaces the fake "15min" lesson durations with REAL YouTube lengths.
 *
 * The `videos/{id}.duration_min` field was a text-length estimate (12/15/18),
 * so every lesson showed "15min". This reads each video's true length from its
 * YouTube page (`lengthSeconds`, no Data API key needed) and writes duration_min.
 *
 * Runs in the Vercel environment where the admin SA has Firestore access
 * (the same credential the app already uses server-side).
 *
 * Security: requires CRON_SECRET via `Authorization: Bearer` or `x-cron-secret`.
 * Query:
 *   ?apply=1   actually write (default is a dry run)
 *   ?limit=N   cap videos processed this run (default 1000)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/firebaseAdmin';

export const config = { maxDuration: 300 };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  return (
    (!!bearer && timingSafeEqual(bearer, secret)) ||
    (!!headerSecret && timingSafeEqual(headerSecret, secret))
  );
}

function ytId(url: unknown): string | null {
  if (!url || typeof url !== 'string' || url.includes('placeholder')) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// YouTube's InnerTube player API — reliable from datacenter IPs (the watch-page
// scrape gets a consent/bot page from Vercel). Uses the public WEB client key.
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
async function fetchDurationMin(id: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: id,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' } },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const sec = parseInt(data?.videoDetails?.lengthSeconds ?? '', 10);
    return sec ? Math.max(1, Math.round(sec / 60)) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const apply = req.query.apply === '1' || req.query.apply === 'true';
  const limit = Math.min(Number(req.query.limit) || 1000, 2000);

  const db = getDb();
  const snap = await db.collection('videos').get();

  let updated = 0, unchanged = 0, noVideo = 0, failed = 0, processed = 0;
  const sample: Array<{ id: string; from: unknown; to: number }> = [];

  for (const doc of snap.docs) {
    if (processed >= limit) break;
    const d = doc.data();
    const id = ytId(d.video_url);
    if (!id) { noVideo++; continue; }
    processed++;
    const mins = await fetchDurationMin(id);
    if (!mins) { failed++; continue; }
    if (d.duration_min === mins) { unchanged++; continue; }
    if (sample.length < 20) sample.push({ id: doc.id, from: d.duration_min ?? null, to: mins });
    if (apply) await doc.ref.update({ duration_min: mins });
    updated++;
  }

  return res.status(200).json({
    mode: apply ? 'APPLIED' : 'DRY_RUN',
    totalVideos: snap.size,
    processed,
    updated,
    unchanged,
    noVideo,
    failed,
    sample,
  });
}
