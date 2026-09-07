#!/usr/bin/env node
/**
 * Expire dead streaks in Firestore.
 *
 * `currentStreak` is written by streakService.recordActivity and never
 * recalculated afterwards, so a student who stopped coming back keeps their
 * last count forever. A real account held `currentStreak: 3` with
 * `lastActivityDate: 2026-07-28`, forty days later.
 *
 * The read paths now expire it on the way out (shared/streakLife), so nobody
 * *sees* a dead streak. This fixes the stored values, which still matter to
 * anything reading the field directly — leaderboards, exports, analytics, and
 * any future consumer that forgets to apply the rule.
 *
 *   node scripts/backfill_streaks.mjs            # dry run, writes nothing
 *   node scripts/backfill_streaks.mjs --write    # apply
 *
 * Only ever sets currentStreak to 0, and only for streaks the shared rule says
 * are over. longestStreak, activeDays, frozenDays, milestones and
 * lastActivityDate are never touched — that is the history the heatmap and the
 * weekly view read, and it stays true.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_JSON (or _PATH); .env.local is read if the
 * variable is not already in the environment.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--write');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();

// ─── The one liveness rule, shared with the app and the e-mail crons ────────
// Imported rather than reimplemented: a private copy here is exactly how the
// client and server drifted apart in the first place.
const { liveStreakCount } = await import(path.join(repoRoot, 'shared/streakLife.ts'))
  .catch(async () => {
    // Plain node cannot import TypeScript. The module is small and dependency
    // free, so transpile-by-strip is enough: drop the type annotations.
    const src = fs.readFileSync(path.join(repoRoot, 'shared/streakLife.ts'), 'utf8');
    const js = src
      .replace(/export interface [\s\S]*?\n}\n/g, '')
      .replace(/: StreakLifeInput \| null \| undefined/g, '')
      .replace(/: Date = new Date\(\)/g, ' = new Date()')
      .replace(/: (Date|string|number|boolean|unknown)\b/g, '')
      .replace(/\)\s*:\s*(string|number|boolean)\s*\{/g, ') {');
    const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
    return import(url);
  });

function loadServiceAccount() {
  let json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!json && p) json = fs.readFileSync(p, 'utf8');

  if (!json) {
    // npm does not load .env.local; the value there is single-quoted.
    const envPath = path.join(repoRoot, '.env.local');
    if (fs.existsSync(envPath)) {
      for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON=')) continue;
        let v = line.slice('FIREBASE_SERVICE_ACCOUNT_JSON='.length).trim();
        if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
          v = v.slice(1, -1);
        }
        json = v;
        break;
      }
    }
  }
  if (!json) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON (env or .env.local).');
  return JSON.parse(json);
}

async function main() {
  const sa = loadServiceAccount();
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(initializeApp({ credential: cert(sa) }));

  console.log(`project: ${sa.project_id}`);
  console.log(APPLY ? 'mode   : WRITE\n' : 'mode   : dry run (no writes)\n');

  const now = new Date();

  // Read the streak docs directly rather than walking users/: a collection
  // group hits only accounts that actually have one.
  const snap = await db.collectionGroup('streaks').get();

  let scanned = 0;
  let alive = 0;
  let already = 0;
  const stale = [];

  for (const doc of snap.docs) {
    if (doc.id !== 'global') continue; // streaks/{global} is the only doc here
    scanned += 1;
    const d = doc.data() || {};
    const stored = typeof d.currentStreak === 'number' ? d.currentStreak : 0;

    if (stored <= 0) { already += 1; continue; }
    if (liveStreakCount(d, now) > 0) { alive += 1; continue; }

    stale.push({
      ref: doc.ref,
      uid: doc.ref.parent.parent?.id ?? '(unknown)',
      stored,
      last: d.lastActivityDate ?? null,
      freezes: d.streakFreezes ?? 0,
    });
  }

  console.log(`scanned          : ${scanned} streak documents`);
  console.log(`already 0        : ${already}`);
  console.log(`still alive      : ${alive}`);
  console.log(`dead but nonzero : ${stale.length}\n`);

  if (stale.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const shown = stale.slice(0, Number.isFinite(LIMIT) ? LIMIT : 25);
  console.log(`${shown.length === stale.length ? 'All' : `First ${shown.length}`} affected:`);
  for (const s of shown) {
    const age = s.last ? Math.round((now - new Date(`${s.last}T00:00:00`)) / 86_400_000) : '?';
    console.log(`  ${s.uid}  currentStreak ${s.stored} -> 0   last activity ${s.last} (${age}d ago, freezes ${s.freezes})`);
  }
  if (shown.length < stale.length) console.log(`  … and ${stale.length - shown.length} more`);

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --write to zero ${stale.length} streak(s).`);
    return;
  }

  // Batched, 400 per commit to stay under Firestore's 500-write ceiling.
  let written = 0;
  const queue = [...stale];
  while (queue.length) {
    const chunk = queue.splice(0, 400);
    const batch = db.batch();
    for (const s of chunk) batch.update(s.ref, { currentStreak: 0 });
    await batch.commit();
    written += chunk.length;
    console.log(`  committed ${written}/${stale.length}`);
  }

  console.log(`\nDone. Zeroed ${written} dead streak(s). No other field was modified.`);
}

main().catch((e) => { console.error('\nBackfill failed:', e.message); process.exit(1); });
