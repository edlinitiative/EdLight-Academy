/**
 * One-time leaderboard backfill.
 * ---------------------------------------------------------------------------
 * Seeds every existing player's weekly + all-time leaderboard entry from the
 * XP already stored in their gamification profile (users/{uid}/gamification/
 * profile). Previously XP only reached the board for opted-in players, so
 * everyone who played before that fix is missing.
 *
 * - all-time entry: xp = profile.xp (absolute — matches upsertAllTimeEntry)
 * - weekly entry:   xp = profile.xp (absolute; the app launched this week, so
 *                   lifetime XP ~= this week's XP). Idempotent SET, not
 *                   increment, so re-running is safe.
 * - displayName: the player's chosen pseudo ONLY if they opted in with a valid
 *   alias; otherwise null (the board hides null-alias entries until they join).
 *
 * Usage:  node scripts/backfill_leaderboard.mjs           # dry run (no writes)
 *         node scripts/backfill_leaderboard.mjs commit    # write
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COMMIT = process.argv.includes('commit');

// --- creds (same normalization as scripts/_tmp_inspect_leaderboard.mjs) ---
const envText = readFileSync('/Users/tedjacquet/EdLight-Academy/.env.local', 'utf8');
const line = envText.split('\n').find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON='));
const raw = line.slice('FIREBASE_SERVICE_ACCOUNT_JSON="'.length).replace(/"$/, '');
const cred = JSON.parse(raw.replace(/\\n/g, '\n').replace(/\n(?![ }])/g, '\\n'));
const db = getFirestore(initializeApp({ credential: cert(cred) }));

// --- helpers copied from the app (must match exactly) ---
const LEVEL_BASE = 100;
const levelOf = (xp = 0) => {
  const s = Math.max(0, Math.floor(xp || 0));
  return Math.floor((1 + Math.sqrt(1 + (8 * s) / LEVEL_BASE)) / 2);
};
const isValidAlias = (name) => /\p{L}/u.test(String(name || ''));
function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const WEEK = weekId();
console.log(`Mode: ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} · week ${WEEK}\n`);

const snap = await db.collectionGroup('gamification').get();
const profiles = snap.docs.filter((d) => d.id === 'profile');
console.log(`Found ${profiles.length} gamification profiles.`);

let visible = 0, hidden = 0, skipped = 0;
let batch = db.batch(), ops = 0, batches = 0;
const flush = async () => { if (ops) { if (COMMIT) await batch.commit(); batch = db.batch(); ops = 0; batches++; } };

const firstNameOf = (s) => String(s || '').trim().split(/\s+/)[0] || '';

for (const p of profiles) {
  const data = p.data() || {};
  const uid = p.ref.parent.parent?.id;
  const xp = Math.floor(data.xp || 0);
  if (!uid || xp <= 0) { skipped++; continue; }

  const lb = data.leaderboard || {};
  // Auto-enroll everyone: chosen pseudo → account first name → null (hidden).
  let alias = isValidAlias(lb.displayName) ? lb.displayName : null;
  if (!alias) {
    const u = (await db.doc(`users/${uid}`).get()).data() || {};
    const first = firstNameOf(u.full_name || u.name || u.displayName || '');
    if (isValidAlias(first)) alias = first;
  }
  if (alias) visible++; else hidden++;

  const meta = {
    uid,
    xp,
    displayName: alias,
    level: levelOf(xp),
    school: lb.school || null,
    city: lb.city || null,
    department: lb.department || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  batch.set(db.doc(`leaderboards/${WEEK}/entries/${uid}`), { ...meta, weekId: WEEK }, { merge: true });
  batch.set(db.doc(`leaderboards/all-time/entries/${uid}`), meta, { merge: true });
  // Persist enrollment on the profile so future games keep them on the board
  // and the "Rejoindre le classement" button no longer shows.
  batch.set(p.ref, { leaderboard: { ...lb, optedIn: true, displayName: alias } }, { merge: true });
  ops += 3;
  if (ops >= 399) await flush();
}
await flush();

console.log(`\nProfiles with XP > 0: ${visible + hidden}  (visible/opted-in: ${visible}, hidden/no-pseudo: ${hidden})`);
console.log(`Skipped (no XP): ${skipped}`);
console.log(COMMIT ? `Committed ${batches} batch(es). Backfill done.` : `Dry run — re-run with "commit" to write.`);
process.exit(0);
