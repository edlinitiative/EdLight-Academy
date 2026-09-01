/**
 * Export the Firestore course catalog to public/catalog.json.
 *
 * Why: /courses' first paint on a fresh device paid a Firestore round-trip for
 * a catalog that changes rarely. This snapshot ships on the CDN; the client
 * (dataService.loadCoursesData) serves it instantly and revalidates against
 * Firestore in the background, so a stale snapshot self-heals on the next
 * visit even if nobody re-runs this script.
 *
 * Run after changing courses in Firestore (add/hide/rename/units):
 *   node scripts/export_catalog.mjs
 * then commit the updated public/catalog.json.
 *
 * The file holds RAW course docs (plus their id) — the client keeps its single
 * transform (transformFirestoreCourses) for both the static and live paths.
 */
import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadServiceAccount() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/FIREBASE_SERVICE_ACCOUNT_JSON=(.*)/);
  if (!m) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local');
  const v = m[1].trim().replace(/^["']|["']$/g, '');
  const text = v.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const projectId = text.match(/"project_id":\s*"([^"]+)"/)?.[1];
  const clientEmail = text.match(/"client_email":\s*"([^"]+)"/)?.[1];
  const privateKey = text.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----\n?/)?.[0];
  if (!projectId || !clientEmail || !privateKey) throw new Error('could not extract SA fields');
  return { projectId, clientEmail, privateKey };
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

const snap = await db.collection('courses').get();
// Timestamps aren't JSON-serializable and the client transform doesn't read
// them — strip to keep the file lean and deterministic.
const docs = snap.docs.map((d) => {
  const { created_at, updated_at, ...rest } = d.data();
  return { id: d.id, ...rest };
});

const out = { exportedAt: new Date().toISOString(), courses: docs };
fs.writeFileSync('public/catalog.json', JSON.stringify(out));
const kb = (fs.statSync('public/catalog.json').size / 1024).toFixed(1);
console.log(`public/catalog.json: ${docs.length} courses, ${kb} KB`);
