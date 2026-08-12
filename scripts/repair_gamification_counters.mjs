/**
 * Repair gamification aggregate drift — users/{uid}/gamification/profile.
 * ---------------------------------------------------------------------------
 * The 2026-08-11 activation analysis flagged profiles with XP but zeroed
 * counters. Two distinct things are going on:
 *
 *   1. Real drift: the top-level totals can lag their own evidence. The
 *      client (triviaService.recordTriviaResult / recordGameResult) is the
 *      ONLY writer that maintains totalGames/totalCorrect/totalQuestions/
 *      bestScorePct/byCategory and games.gamesPlayed/highScores — any write
 *      interruption, older app version, or partial merge leaves totals below
 *      what byCategory / highScores prove happened.
 *   2. XP divergence: server-side awards (api/leaderboard/award.ts, duel
 *      payouts in api/challenges/accept.ts) increment ONLY the leaderboard
 *      entries, never profile.xp — so the all-time board can exceed the
 *      profile XP that drives the in-app level. Reported here, never
 *      auto-fixed (XP changes user-visible levels; human decision).
 *
 * Repair rules are conservative and monotonic — a field is only ever RAISED
 * to the floor its own evidence proves, never lowered:
 *   totalGames     >= Σ byCategory[*].games
 *   totalCorrect   >= Σ byCategory[*].correct
 *   totalQuestions >= Σ byCategory[*].questions
 *   bestScorePct   >= max(byCategory[*].bestPct)
 *   games.gamesPlayed >= |{ gameId : games.highScores[gameId] > 0 }|
 *
 * Usage:  node scripts/repair_gamification_counters.mjs           # dry run
 *         node scripts/repair_gamification_counters.mjs commit    # write
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COMMIT = process.argv.includes('commit');

// --- creds (same normalization as scripts/backfill_board_aliases.mjs) ---
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const line = envText.split('\n').find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON='));
let raw = line.slice('FIREBASE_SERVICE_ACCOUNT_JSON='.length).trim();
if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) raw = raw.slice(1, -1);
const cred = JSON.parse(raw.replace(/\\n/g, '\n').replace(/\n(?![ }])/g, '\\n'));
const db = getFirestore(initializeApp({ credential: cert(cred) }));

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// All-time board XP per uid — for the divergence report only.
const boardXp = new Map();
for (const d of (await db.collection('leaderboards').doc('all-time').collection('entries').get()).docs) {
  boardXp.set(d.id, n(d.data().xp));
}

const profiles = (await db.collectionGroup('gamification').get()).docs
  .filter((d) => d.id === 'profile');
console.log(`${profiles.length} gamification profiles · ${boardXp.size} all-time board entries\n`);

let repairedUsers = 0;
const fieldCounts = {};
const divergences = [];

for (const snap of profiles) {
  const uid = snap.ref.parent.parent.id;
  const p = snap.data();

  // Evidence floors
  const cats = Object.values(p.byCategory || {});
  const floor = {
    totalGames: cats.reduce((s, c) => s + n(c.games), 0),
    totalCorrect: cats.reduce((s, c) => s + n(c.correct), 0),
    totalQuestions: cats.reduce((s, c) => s + n(c.questions), 0),
    bestScorePct: cats.reduce((m, c) => Math.max(m, n(c.bestPct)), 0),
  };
  const playedFloor = Object.values(p.games?.highScores || {}).filter((s) => n(s) > 0).length;

  const patch = {};
  for (const [field, want] of Object.entries(floor)) {
    if (n(p[field]) < want) patch[field] = want;
  }
  if (n(p.games?.gamesPlayed) < playedFloor) patch['games.gamesPlayed'] = playedFloor;

  // XP divergence — report only (board accumulates server-side awards the
  // profile never saw; profile.xp drives the visible level).
  const bXp = boardXp.get(uid);
  if (bXp != null && bXp !== n(p.xp)) {
    divergences.push({ uid, profileXp: n(p.xp), boardXp: bXp });
  }

  if (!Object.keys(patch).length) continue;
  repairedUsers += 1;
  console.log(`${uid}  (xp=${n(p.xp)})`);
  for (const [field, to] of Object.entries(patch)) {
    const from = field === 'games.gamesPlayed' ? n(p.games?.gamesPlayed) : n(p[field]);
    const evidence = field === 'games.gamesPlayed' ? 'highScores keys' : 'byCategory sums';
    fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    console.log(`  ${field}: ${from} → ${to}  [${evidence}]${COMMIT ? '' : ' (dry run)'}`);
  }
  if (COMMIT) {
    // Dotted paths need update(); it errors if the doc vanished (fine — loud).
    await snap.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  }
}

console.log(`\n${COMMIT ? 'Repaired' : 'Would repair'} ${repairedUsers} profiles.`);
for (const [f, c] of Object.entries(fieldCounts)) console.log(`  ${f}: ${c} users`);
if (!repairedUsers) console.log('  (no counter drift found — all totals at or above their evidence floors)');

if (divergences.length) {
  console.log(`\nXP divergences (profile vs all-time board) — REPORT ONLY, no auto-fix:`);
  for (const d of divergences.sort((a, b) => (b.boardXp - b.profileXp) - (a.boardXp - a.profileXp))) {
    console.log(`  ${d.uid}: profile ${d.profileXp} vs board ${d.boardXp} (Δ ${d.boardXp - d.profileXp})`);
  }
}
if (!COMMIT) console.log('\nRe-run with `commit` to apply.');
