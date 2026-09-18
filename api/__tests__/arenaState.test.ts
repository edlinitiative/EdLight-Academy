/**
 * The state route's two pure decisions: what a valid tournament document is,
 * and which claims the podium opens.
 *
 * The second one is the load-bearing half. `rollDown` in claim.ts reads a
 * MISSING claim as "no deadline has passed" and leaves the prize where it is,
 * so if this function fails to stamp a placeholder, an unclaimed first place
 * never rolls down to anybody — the money simply sits there. These tests are
 * the only thing standing between that contract and a silent regression.
 *
 * Firestore is mocked at the module boundary the way the other api tests do it:
 * the route calls `getDb()` inside its handler, so importing it must never
 * touch the Admin SDK.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
}));

import {
  validateCreate,
  podiumClaims,
  DEFAULT_PRIZES,
  DEFAULT_QUESTION_COUNT,
} from '../arena/state';
import { CLAIM_WINDOW_MS } from '../arena/claim';

const NOW = 1_800_000_000_000;
const STARTS = NOW + 7 * 24 * 3600_000;

const base = { title: 'Arène de septembre', startsAt: STARTS };

describe('validateCreate', () => {
  it('fills in section C’s defaults', () => {
    const r = validateCreate('sept-2026', base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state).toBe('draft');
    expect(r.value.slug).toBe('sept-2026');
    expect(r.value.questionCount).toBe(DEFAULT_QUESTION_COUNT);
    expect(r.value.prizes.individual).toEqual(DEFAULT_PRIZES);
    expect(r.value.currentQuestion).toBeNull();
  });

  it('defaults the doors to ten minutes before the first question', () => {
    const r = validateCreate('sept-2026', base);
    if (!r.ok) throw new Error('expected ok');
    expect(STARTS - r.value.doorsAt).toBe(10 * 60_000);
  });

  it('refuses doors that open after the tournament starts', () => {
    const r = validateCreate('sept-2026', { ...base, doorsAt: STARTS + 60_000 });
    expect(r).toEqual({ ok: false, reason: 'doorsAt' });
  });

  it('refuses a title nobody could read on a card', () => {
    expect(validateCreate('x', { ...base, title: 'A' }).ok).toBe(false);
  });

  it('refuses a start time it cannot read', () => {
    expect(validateCreate('x', { title: 'Arène', startsAt: 'bientôt' }).ok).toBe(false);
  });

  /*
   * `rankSchools` reads qualification off the pool it is handed. A tournament
   * that scores five players but only requires three present would report a
   * school as qualified on a pool that cannot fill its own counting five.
   */
  it('refuses fewer players present than the number that score', () => {
    const r = validateCreate('x', { ...base, teamSize: 5, minPlayers: 3 });
    expect(r).toEqual({ ok: false, reason: 'minPlayers' });
  });

  it('accepts a tournament that plays sevens', () => {
    const r = validateCreate('x', { ...base, teamSize: 7, minPlayers: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.teamSize).toBe(7);
  });

  it('falls back to the French title when no Kreyòl one is given', () => {
    const r = validateCreate('x', base);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.titleHt).toBe('Arène de septembre');
  });
});

describe('podiumClaims', () => {
  const individuals = [
    { uid: 'u1', rank: 1, score: 900 },
    { uid: 'u2', rank: 2, score: 800 },
    { uid: 'u3', rank: 3, score: 700 },
    { uid: 'u4', rank: 4, score: 600 },
  ];

  it('opens one claim per paying rank and no more', () => {
    const claims = podiumClaims(individuals, DEFAULT_PRIZES, NOW);
    expect(claims.map((c) => c.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(claims.map((c) => c.prizeCents)).toEqual([10_000, 5_000, 2_500]);
  });

  /*
   * The deadline is the whole reason roll-down is defensible in public, and it
   * runs from the moment the podium was published — not from the moment a
   * student happens to open the app.
   */
  it('starts the published 72-hour window now', () => {
    const [first] = podiumClaims(individuals, DEFAULT_PRIZES, NOW);
    expect(first.expiresAt).toBe(NOW + CLAIM_WINDOW_MS);
    expect(first.state).toBe('open');
  });

  it('records the finishing position alongside the prize rank', () => {
    const [first] = podiumClaims(individuals, DEFAULT_PRIZES, NOW);
    expect(first).toMatchObject({ rank: 1, finishRank: 1 });
  });

  /*
   * A tie at a paying rank is a human decision. Opening a placeholder for both
   * rows would put two students on the same prize, which is the one outcome
   * the claim module exists to prevent.
   */
  it('leaves a tie at a paying rank for the review queue', () => {
    const tied = [
      { uid: 'a', rank: 1 },
      { uid: 'b', rank: 1 },
      { uid: 'c', rank: 3 },
    ];
    const claims = podiumClaims(tied, DEFAULT_PRIZES, NOW);
    expect(claims.map((c) => c.uid)).toEqual(['a', 'c']);
  });

  it('opens nothing when the tournament pays nothing', () => {
    expect(podiumClaims(individuals, [], NOW)).toEqual([]);
    expect(podiumClaims(individuals, [0, 0], NOW)).toEqual([]);
  });

  it('survives a standings document that is missing or malformed', () => {
    expect(podiumClaims(undefined, DEFAULT_PRIZES, NOW)).toEqual([]);
    expect(podiumClaims([{ rank: 1 }, { uid: '' }, null], DEFAULT_PRIZES, NOW)).toEqual([]);
  });

  it('ignores finishers below the last paying rank', () => {
    const claims = podiumClaims(individuals, [10_000], NOW);
    expect(claims).toHaveLength(1);
    expect(claims[0].uid).toBe('u1');
  });
});
