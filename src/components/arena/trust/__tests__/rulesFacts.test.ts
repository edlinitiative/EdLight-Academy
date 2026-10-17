/**
 * The rules sheets restate a few numbers that live in modules `src/` cannot
 * import (api/** pulls in firebase-admin). Pin each one to its source text so
 * the explanation can never quietly drift from the rule.
 */
import fs from 'fs';
import path from 'path';
import { ARENA_RULES, DUEL_RULES } from '../rulesFacts';
import { TIER_FULL_MS, TIER_HALF_MS, POINTS_FULL, POINTS_HALF, RENDER_GRACE_MS } from '../../../../../shared/arena/scoring';

const root = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

it('uses the shared scoring constants as-is', () => {
  expect(ARENA_RULES).toMatchObject({
    fullMs: TIER_FULL_MS, halfMs: TIER_HALF_MS, pointsFull: POINTS_FULL, pointsHalf: POINTS_HALF, graceMs: RENDER_GRACE_MS,
  });
});

it('matches the 72-hour prize claim window', () => {
  const m = /CLAIM_WINDOW_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.exec(read('api/arena/claim.ts'));
  expect(m && Number(m[1])).toBe(ARENA_RULES.claimHours);
});

it('matches the duel TTL and XP stakes', () => {
  const ttl = /TTL_MS\s*=\s*(\d+)\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.exec(read('api/challenges/create.ts'));
  expect(ttl && Number(ttl[1])).toBe(DUEL_RULES.ttlDays);
  const accept = read('api/challenges/accept.ts');
  expect(Number(/WIN_XP\s*=\s*(\d+)/.exec(accept)?.[1])).toBe(DUEL_RULES.winXp);
  expect(Number(/TIE_XP\s*=\s*(\d+)/.exec(accept)?.[1])).toBe(DUEL_RULES.tieXp);
  // A tie is decided on score alone — no time tie-break, as the sheet says.
  expect(accept).toMatch(/const tie = outcome\.opponentScore === outcome\.challengerScore;/);
});

it('matches the trivia per-question timer', () => {
  const src = read('src/pages/TriviaGames.tsx');
  const named = /ROUND_SECONDS\s*=\s*(\d+)/.exec(src);
  const literal = /setTimeLeft\((\d+)\)/.exec(src);
  expect(Number((named || literal)?.[1])).toBe(DUEL_RULES.secondsPerQuestion);
});

it('lists the school tie-breaks in the comparator’s order', () => {
  const scoring = read('shared/arena/scoring.ts');
  const i = (s: string) => scoring.indexOf(s);
  expect(i('b.teamAvg - a.teamAvg')).toBeLessThan(i('a.teamTotalMs - b.teamTotalMs'));
  expect(i('a.teamTotalMs - b.teamTotalMs')).toBeLessThan(i('b.teamCorrect - a.teamCorrect'));
  expect(i('b.score - a.score')).toBeLessThan(i('b.fullTierCount - a.fullTierCount'));
});
