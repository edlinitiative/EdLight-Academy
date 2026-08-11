/**
 * Backfill default leaderboard aliases.
 * ---------------------------------------------------------------------------
 * Everyone now appears on the board by default under a privacy-safe alias
 * derived from their account name ("Ted Olivier Jacquet" → "Ted J."), written
 * by /api/leaderboard/award for NEW awards. This script fixes the stock of
 * existing entries that predate that change: any entry (all-time + current
 * week) with no valid alias and not hidden gets one derived from the Firebase
 * Auth user's displayName. Accounts with no usable name are left as-is (they
 * stay off the board until they pick a pseudo, same as before).
 *
 * Usage:  node scripts/backfill_board_aliases.mjs           # dry run
 *         node scripts/backfill_board_aliases.mjs commit    # write
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const COMMIT = process.argv.includes('commit');

// --- creds (same normalization as scripts/backfill_leaderboard.mjs) ---
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const line = envText.split('\n').find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON='));
let raw = line.slice('FIREBASE_SERVICE_ACCOUNT_JSON='.length).trim();
if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) raw = raw.slice(1, -1);
const cred = JSON.parse(raw.replace(/\\n/g, '\n').replace(/\n(?![ }])/g, '\\n'));
const app = initializeApp({ credential: cert(cred) });
const db = getFirestore(app);
const auth = getAuth(app);

const isValidAlias = (name) => /\p{L}/u.test(String(name ?? ''));

/** Same derivation as api/leaderboard/award.ts defaultAlias(). */
function defaultAlias(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !isValidAlias(parts[0])) return null;
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/** ISO week id — matches leaderboardService.weekId(). */
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

const boards = ['all-time', weekId()];
let planned = 0;
let skipped = 0;

for (const board of boards) {
  const snap = await db.collection('leaderboards').doc(board).collection('entries').get();
  console.log(`\n── ${board}: ${snap.size} entries`);
  for (const doc of snap.docs) {
    const e = doc.data();
    if (e.hidden === true) { skipped++; continue; }
    if (isValidAlias(e.displayName)) { skipped++; continue; }
    let alias = null;
    try {
      const user = await auth.getUser(doc.id);
      alias = defaultAlias(user.displayName);
    } catch {
      // deleted/unknown auth user — leave entry unnamed
    }
    if (!alias) {
      console.log(`  ${doc.id}: no usable account name — left unnamed`);
      skipped++;
      continue;
    }
    planned++;
    console.log(`  ${doc.id}: "${String(e.displayName)}" → "${alias}" (xp=${e.xp ?? 0})${COMMIT ? '' : ' [dry run]'}`);
    if (COMMIT) {
      await doc.ref.set({ displayName: alias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
}

console.log(`\n${COMMIT ? 'Wrote' : 'Would write'} ${planned} aliases; ${skipped} entries untouched.`);
if (!COMMIT) console.log('Re-run with `commit` to apply.');
