/**
 * Backfill real video durations into Firestore `videos` docs.
 *
 * The `duration_min` field was a fake estimate (12/15/18 by text length), so
 * every lesson showed "15min". This reads each video's true length from its
 * YouTube page (`lengthSeconds`, no API key needed) and writes duration_min.
 *
 *   node scripts/backfill_video_durations.mjs            # dry-run (no writes)
 *   node scripts/backfill_video_durations.mjs --apply    # write to Firestore
 */
import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// The SA JSON in .env.local is a single-line, escaped value. Extract the three
// fields cert() needs directly, sidestepping JSON.parse vs. PEM-newline issues.
function loadServiceAccount() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/FIREBASE_SERVICE_ACCOUNT_JSON=(.*)/);
  if (!m) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local');
  let v = m[1].trim().replace(/^["']|["']$/g, '');
  const text = v.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const projectId = text.match(/"project_id":\s*"([^"]+)"/)?.[1];
  const clientEmail = text.match(/"client_email":\s*"([^"]+)"/)?.[1];
  const privateKey = text.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----\n?/)?.[0];
  if (!projectId || !clientEmail || !privateKey) throw new Error('could not extract SA fields');
  return { projectId, clientEmail, privateKey };
}

function ytId(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('placeholder')) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchDurationMin(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"lengthSeconds":"(\d+)"/);
  if (!m) return null;
  const sec = parseInt(m[1], 10);
  if (!sec) return null;
  return Math.max(1, Math.round(sec / 60));
}

const app = initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore(app);

const snap = await db.collection('videos').get();
console.log(`videos: ${snap.size} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

let updated = 0, skipped = 0, failed = 0, noId = 0;
const changes = [];
for (const doc of snap.docs) {
  const d = doc.data();
  const id = ytId(d.video_url);
  if (!id) { noId++; continue; }
  let mins = null;
  try { mins = await fetchDurationMin(id); } catch { mins = null; }
  if (!mins) { failed++; continue; }
  if (d.duration_min === mins) { skipped++; continue; }
  changes.push({ doc: doc.id, id, from: d.duration_min ?? '(none)', to: mins });
  if (APPLY) await doc.ref.update({ duration_min: mins });
  updated++;
  await new Promise((r) => setTimeout(r, 120)); // be polite
}

console.log(`\n${APPLY ? 'updated' : 'would update'}: ${updated} | unchanged: ${skipped} | no-video: ${noId} | fetch-failed: ${failed}`);
console.log('sample changes:');
changes.slice(0, 15).forEach((c) => console.log(`  ${c.doc}: ${c.from} → ${c.to} min  (${c.id})`));
process.exit(0);
