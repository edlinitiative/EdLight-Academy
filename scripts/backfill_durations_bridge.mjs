/**
 * Bridge backfill: Vercel lists video ids + writes results (it has Firestore);
 * this machine fetches real durations from YouTube InnerTube (works locally,
 * blocked from Vercel's datacenter IP).
 *
 *   node scripts/backfill_durations_bridge.mjs            # dry-run
 *   node scripts/backfill_durations_bridge.mjs --apply    # write
 */
import fs from 'fs';

const BASE = 'https://academy.edlight.org/api/backfill-durations';
const APPLY = process.argv.includes('--apply');
const SECRET = (fs.readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.*)$/m)?.[1] || '')
  .trim().replace(/^["']|["']$/g, '');
if (!SECRET) throw new Error('CRON_SECRET not found in .env.local');

const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
async function durationMin(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' } } }),
    });
    const j = await r.json();
    const sec = parseInt(j?.videoDetails?.lengthSeconds ?? '', 10);
    return sec ? Math.max(1, Math.round(sec / 60)) : null;
  } catch { return null; }
}

// 1. List
const listRes = await fetch(`${BASE}?list=1`, { headers: { 'x-cron-secret': SECRET } });
const { videos, total } = await listRes.json();
console.log(`videos with an id: ${videos.length} / ${total} total`);

// 2. Fetch durations locally
const durations = {};
let failed = 0, changed = 0;
for (let i = 0; i < videos.length; i++) {
  const v = videos[i];
  const mins = await durationMin(v.videoId);
  if (!mins) { failed++; continue; }
  if (mins !== v.current) { durations[v.doc] = mins; changed++; }
  if (i % 50 === 0) console.log(`  ${i}/${videos.length}…`);
  await new Promise((r) => setTimeout(r, 60));
}
console.log(`fetched ok: ${videos.length - failed} | failed: ${failed} | changed: ${changed}`);

// 3. Send back to Vercel to write
const postRes = await fetch(BASE, {
  method: 'POST',
  headers: { 'x-cron-secret': SECRET, 'Content-Type': 'application/json' },
  body: JSON.stringify({ apply: APPLY, durations }),
});
console.log('write:', JSON.stringify(await postRes.json()));
console.log(APPLY ? 'APPLIED' : 'DRY-RUN (no writes) — re-run with --apply');
