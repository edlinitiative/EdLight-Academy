/**
 * The decisions /api/arena/answer makes before it touches Firestore.
 *
 * These are the rules that decide who scores on a night with cash attached, and
 * every one of them is a rule somebody will dispute afterwards. Untested they
 * drift: the late window quietly becomes a rejection, a flag threshold gets
 * "tidied", and the first anyone hears of it is a student on a 3G connection
 * whose answer vanished on a live stream.
 *
 * `api/arena/_shared` imports api/_lib/rateLimit, which reaches for Firebase
 * Admin at module load. Mocked the way api/__tests__/arenaRateLimit.test.ts
 * mocks it — these tests never touch Firestore, they exercise pure functions.
 */

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => false,
  getDb: () => { throw new Error('no firestore in unit tests'); },
  verifyIdToken: async () => ({ uid: 'u1' }),
}));

import {
  FAST_ANSWER_MS,
  FOCUS_LOSS_FLAG_MIN,
  LATE_GRACE_MS,
  boundedInt,
  decidePresence,
  decideSubmission,
  defaultAlias,
  integrityFlags,
  isAlreadyExists,
  isEligibleGrade,
  isRegistrationOpen,
  isValidSchoolKey,
  isValidTournamentId,
  normalizeDeviceHash,
  replayAnswer,
  toMillis,
} from '../arena/_shared';
import { canTransition } from '../../shared/arena/state';
import { scoreAnswer } from '../../shared/arena/scoring';

const OPENS = 1_800_000_000_000;
const CLOSES = OPENS + 20_000;

/** `closedAt: null` — the ordinary case: still on the announced schedule. */
const at = (serverReceivedAt: number) =>
  decideSubmission({ opensAt: OPENS, closesAt: CLOSES, closedAt: null, serverReceivedAt });

describe('the submission window', () => {
  it('accepts an ordinary in-window answer', () => {
    const d = at(OPENS + 5_000);
    expect(d).toEqual({ accept: true, late: false, early: false, reason: null });
  });

  it('accepts an answer that lands in the pause after the close', () => {
    // Decision 2 (2026-09-18): the ~10s pause between questions is where late
    // answers land. A student on a bad connection answering at 21s is still
    // submitting in good faith, and the record must show them.
    const d = at(CLOSES + 1_000);
    expect(d.accept).toBe(true);
    expect(d.late).toBe(true);
  });

  it('accepts at the very last millisecond of the grace, and not one past it', () => {
    expect(at(CLOSES + LATE_GRACE_MS).accept).toBe(true);
    expect(at(CLOSES + LATE_GRACE_MS + 1).accept).toBe(false);
    expect(at(CLOSES + LATE_GRACE_MS + 1).reason).toBe('too_late');
  });

  it('gives an HONEST late answer nothing — real elapsed time alone already fails the tier', () => {
    const scored = scoreAnswer({
      correct: true,
      opensAt: OPENS,
      clientShownAt: OPENS,
      serverReceivedAt: CLOSES + 5_000,
    });
    expect(scored.tier).toBe('none');
    expect(scored.points).toBe(0);
  });

  /*
   * CVE reproduction, from an external audit, verified by tracing the exploit
   * by hand before this test was written. `clampShownAt` bounds a client's
   * claimed render time from ABOVE at `opensAt + RENDER_GRACE_MS` (3000ms) —
   * not relative to how late the submission actually is — so a client that
   * reads the revealed key at close and resubmits within ~3s afterward,
   * claiming the maximum allowed render delay, computed an elapsedMs that
   * still landed inside the half-tier boundary. This is the exact case the
   * audit reproduced: opens 0, closes 20000, claimed render 3000, received
   * 21000 → elapsed 18000 → 500 points, on a submission made entirely after
   * the reveal. `late` did not previously reach `scoreAnswer` at all.
   */
  it('CLOSED: a dishonest render-time claim can no longer buy points on a late answer', () => {
    const cheating = scoreAnswer({
      correct: true,
      opensAt: OPENS,
      // Claims the question rendered at the last legal instant — the value a
      // cheater picks specifically to minimise apparent elapsed time.
      clientShownAt: OPENS + 3_000,
      serverReceivedAt: CLOSES + 1_000, // one second after the real close
      late: true, // what decideSubmission would say about this timestamp
    });
    expect(cheating.points).toBe(0);
    // Tier/elapsed still report what the clamp actually computed — a
    // reviewer needs to see this was a suspiciously well-timed late answer,
    // which is exactly what a zeroed tier would hide.
    expect(cheating.tier).toBe('half');
    expect(cheating.elapsedMs).toBe(18_000);
  });

  it('a late answer with late unset behaves as the OLD code did — proving the fix is the `late` flag, not the clamp', () => {
    // This is deliberately the exploit shape from above, without `late: true`
    // — showing the clamp alone still permits the score. The protection is
    // real only because answer.ts always passes decision.late through.
    const withoutTheFix = scoreAnswer({
      correct: true,
      opensAt: OPENS,
      clientShownAt: OPENS + 3_000,
      serverReceivedAt: CLOSES + 1_000,
    });
    expect(withoutTheFix.points).toBe(500);
  });

  it('RECORDS an answer that arrives before the question opened instead of dropping it', () => {
    // Section M's threat table says "server rejects"; its principles say "flag,
    // don't block". The principle wins: an answer that predates delivery is
    // evidence of a leak, and evidence is the one thing not to throw away at
    // the door. It scores zero anyway, so the student's outcome is unchanged.
    const d = at(OPENS - 500);
    expect(d.accept).toBe(true);
    expect(d.early).toBe(true);
  });

  it('refuses to score against a window that is not there', () => {
    // A malformed live document is our bug. Inventing a clock would score
    // everybody at the full tier.
    expect(decideSubmission({ opensAt: null, closesAt: CLOSES, closedAt: null, serverReceivedAt: OPENS }).accept).toBe(false);
    expect(decideSubmission({ opensAt: OPENS, closesAt: null, closedAt: null, serverReceivedAt: OPENS }).reason).toBe('no_window');
    expect(decideSubmission({ opensAt: OPENS, closesAt: CLOSES, closedAt: null, serverReceivedAt: NaN }).accept).toBe(false);
  });
});

describe('integrity flags — flag, never block', () => {
  const base = { questionIndex: 3, elapsedMs: 5_000, impossible: false, focusLosses: 0 };

  it('says nothing about an ordinary answer', () => {
    expect(integrityFlags(base)).toEqual([]);
  });

  it('flags an answer faster than a human reads the question', () => {
    expect(integrityFlags({ ...base, elapsedMs: FAST_ANSWER_MS - 1 })).toEqual(['fast:3']);
  });

  it('does not flag one exactly on the threshold', () => {
    // The boundary is a documented constant somebody will argue about later;
    // it is exclusive, and that has to stay true by test rather than by memory.
    expect(integrityFlags({ ...base, elapsedMs: FAST_ANSWER_MS })).toEqual([]);
  });

  it('carries the question index so a reviewer knows what to pull', () => {
    expect(integrityFlags({ ...base, questionIndex: 17, elapsedMs: 10 })).toEqual(['fast:17']);
  });

  it('flags an impossible submission once, not twice', () => {
    // An impossible answer also has a negative span, which would otherwise trip
    // the fast-answer rule and put two flags on one event — inflating a review
    // queue that a human has to read at 19:00.
    expect(integrityFlags({ ...base, elapsedMs: -400, impossible: true })).toEqual(['impossible:3']);
  });

  it('flags a device switch mid-tournament', () => {
    expect(integrityFlags({ ...base, deviceSwitched: true })).toEqual(['device:3']);
  });

  /*
   * The flag is about the CHANGE, not about which phone. An answer with no
   * device reported, or the same device as last time, says nothing — a student
   * who registered on a friend's phone and plays on their own would otherwise
   * light up on all twenty-five questions, and a column that is always lit is
   * one a reviewer learns to skip.
   */
  it('says nothing when the device did not change', () => {
    expect(integrityFlags({ ...base, deviceSwitched: false })).toEqual([]);
    expect(integrityFlags(base)).toEqual([]);
  });

  /*
   * Absence is not a finding: every build shipped before attestation existed
   * sends nothing, and flagging all of them buries the queue.
   */
  it('flags an attestation that failed, and says nothing about one never sent', () => {
    expect(integrityFlags({ ...base, badAttestation: true })).toEqual(['attest:3']);
    expect(integrityFlags({ ...base, badAttestation: false })).toEqual([]);
  });

  it('stacks with the other flags rather than replacing them', () => {
    expect(integrityFlags({ ...base, elapsedMs: 10, focusLosses: 9, deviceSwitched: true }))
      .toEqual(['fast:3', 'focus:3:9', 'device:3']);
  });

  it('ignores a single focus loss and flags a second', () => {
    // One blur is a notification banner. Two inside a 20-second question is a
    // pattern. Flagging on one would flag half of Haiti and make the signal
    // worthless.
    expect(integrityFlags({ ...base, focusLosses: FOCUS_LOSS_FLAG_MIN - 1 })).toEqual([]);
    expect(integrityFlags({ ...base, focusLosses: FOCUS_LOSS_FLAG_MIN }))
      .toEqual([`focus:3:${FOCUS_LOSS_FLAG_MIN}`]);
  });

  it('records how many times focus was lost, not just that it was', () => {
    expect(integrityFlags({ ...base, focusLosses: 9 })).toEqual(['focus:3:9']);
  });

  it('can report speed and focus on the same submission', () => {
    expect(integrityFlags({ ...base, elapsedMs: 300, focusLosses: 4 }))
      .toEqual(['fast:3', 'focus:3:4']);
  });
});

describe('the duplicate-submission path', () => {
  it('recognises Firestore ALREADY_EXISTS however it is spelled', () => {
    expect(isAlreadyExists({ code: 6 })).toBe(true);
    expect(isAlreadyExists({ code: 'already-exists' })).toBe(true);
    expect(isAlreadyExists({ code: 'ALREADY_EXISTS' })).toBe(true);
    expect(isAlreadyExists(new Error('Document already exists: answers/u1_3'))).toBe(true);
  });

  it('does not mistake an ordinary failure for a duplicate', () => {
    // Swallowing a real write failure as "already recorded" would tell a
    // student their answer was in when it never was.
    expect(isAlreadyExists({ code: 'permission-denied' })).toBe(false);
    expect(isAlreadyExists(new Error('deadline exceeded'))).toBe(false);
    expect(isAlreadyExists(null)).toBe(false);
  });

  it('replays exactly what was recorded the first time', () => {
    // A retry after a network timeout is normal: the phone lost the response,
    // not the answer. The second POST must return the FIRST decision — never a
    // fresh scoring pass, which would time the same submission against a new
    // clock and could hand it a different tier.
    const stored = { correct: true, tier: 'half', points: 500, late: true };
    expect(replayAnswer(stored, { score: 3_500, streak: 2 })).toEqual({
      correct: true,
      tier: 'half',
      points: 500,
      score: 3_500,
      streak: 2,
      late: true,
    });
  });

  it('survives a player row that has not settled yet', () => {
    expect(replayAnswer({ correct: false }, undefined)).toEqual({
      correct: false,
      tier: 'none',
      points: 0,
      score: 0,
      streak: 0,
      late: false,
    });
  });
});

describe('registration gates', () => {
  it('stays open through doors, which is the window that matters', () => {
    // The push that says "il manque 2 joueurs à CODOSA, la salle est ouverte"
    // is the highest-intent notification in the product and it fires AT doors.
    // If registration closed there, that push would be a link that rejects
    // everyone it reaches.
    expect(isRegistrationOpen('registration')).toBe(true);
    expect(isRegistrationOpen('doors')).toBe(true);
  });

  it('closes once the tournament is scoring, and before it is published', () => {
    for (const s of ['draft', 'live', 'grading', 'provisional', 'final', 'void'] as const) {
      expect(isRegistrationOpen(s)).toBe(false);
    }
  });

  it('keeps registration and doors adjacent on the state machine', () => {
    // The pair above is only defensible because `doors` is the state
    // `registration` advances INTO. If the machine ever gains a state between
    // them, this fails and the registration window has to be reconsidered
    // rather than silently spanning a gap.
    expect(canTransition('registration', 'doors')).toBe(true);
  });
});

/*
 * E4, from an external audit: presence used to stamp `duringDoors` from the
 * STATE alone — `state === 'doors'` — and never look at whether
 * `doors-close.ts` had already frozen the roster. The freeze happens on a
 * cron tick part-way through `doors`, so a student first seen after it but
 * before the state moved on was recorded as having made a cut-off that had
 * already passed. `countsPresent()` reads that flag straight back out, and
 * the live "N présents" the lobby renders would drift above the number the
 * school was actually judged on.
 *
 * Being in the room and counting toward the five are different facts, and
 * this is the function that keeps them apart.
 */
describe('decidePresence — E4: the freeze is the cut-off, not the state', () => {
  const FROZEN = 1_770_000_000_000;

  it('accepts and counts an arrival during doors, before the freeze', () => {
    expect(decidePresence({ state: 'doors', rosterFrozenAt: null }))
      .toEqual({ accept: true, countsTowardQualification: true });
  });

  it('CLOSED: an arrival after the freeze is still present, but no longer counts', () => {
    // The exact gap: the state is STILL `doors`, so the old check said true.
    expect(decidePresence({ state: 'doors', rosterFrozenAt: FROZEN }))
      .toEqual({ accept: true, countsTowardQualification: false });
  });

  it('keeps accepting the heartbeat into `live`, but never counts it', () => {
    // Accepted on purpose — the client keeps the heartbeat running across the
    // transition, and rejecting it would spam an error at every player in the
    // tournament. It just does not qualify anybody.
    expect(decidePresence({ state: 'live', rosterFrozenAt: null }))
      .toEqual({ accept: true, countsTowardQualification: false });
    expect(decidePresence({ state: 'live', rosterFrozenAt: FROZEN }))
      .toEqual({ accept: true, countsTowardQualification: false });
  });

  it('refuses outright before the doors open and after the tournament is scoring', () => {
    for (const s of ['draft', 'registration', 'grading', 'provisional', 'final', 'void'] as const) {
      expect(decidePresence({ state: s, rosterFrozenAt: null }).accept).toBe(false);
    }
  });

  it('refuses a tournament whose state could not be read at all', () => {
    expect(decidePresence({ state: null, rosterFrozenAt: null }).accept).toBe(false);
  });

  it('never counts a sighting it did not accept', () => {
    // A rejected presence call must not leave `countsTowardQualification`
    // true for a caller that only checked one of the two fields.
    for (const s of ['draft', 'registration', 'grading', 'provisional', 'final', 'void', null] as const) {
      expect(decidePresence({ state: s, rosterFrozenAt: null }).countsTowardQualification).toBe(false);
    }
  });

  it('turns away a post-bac student and nobody else', () => {
    expect(isEligibleGrade('POSTBAC')).toBe(false);
    for (const g of ['7e', '8e', '9e', 'NS1', 'NS2', 'NS3', 'NS4']) {
      expect(isEligibleGrade(g)).toBe(true);
    }
    expect(isEligibleGrade('')).toBe(false);
    expect(isEligibleGrade(undefined)).toBe(false);
  });
});

describe('untrusted input', () => {
  it('accepts a school key in the form shared/schools.ts produces', () => {
    expect(isValidSchoolKey('college dominique savio')).toBe(true);
    // Re-normalising here with a second copy of the rules is how one school
    // becomes two, so anything not already in canonical form is refused.
    expect(isValidSchoolKey('Collège Dominique Savio')).toBe(false);
    expect(isValidSchoolKey('a/b')).toBe(false);
    expect(isValidSchoolKey('')).toBe(false);
  });

  it('refuses a tournament id that could escape its document path', () => {
    expect(isValidTournamentId('2026-09-championnat')).toBe(true);
    expect(isValidTournamentId('../../users')).toBe(false);
    expect(isValidTournamentId('a/b')).toBe(false);
  });

  it('treats a missing device hash as missing, not as a reason to turn someone away', () => {
    // Shared phones are ordinary in Haiti; multi-account is flagged, not
    // blocked. Rejecting a client that cannot fingerprint itself would lock out
    // real students to catch a threat we already decided not to block.
    expect(normalizeDeviceHash(undefined)).toBeNull();
    expect(normalizeDeviceHash('short')).toBeNull();
    expect(normalizeDeviceHash('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
  });

  it('will not take a float, a string or a NaN for an index', () => {
    expect(boundedInt(3, 0, 10)).toBe(3);
    expect(boundedInt(3.5, 0, 10)).toBeNull();
    expect(boundedInt('3', 0, 10)).toBeNull();
    expect(boundedInt(-1, 0, 10)).toBeNull();
    expect(boundedInt(11, 0, 10)).toBeNull();
    expect(boundedInt(0, 0, 10)).toBe(0);
  });

  it('reads a window whether it was written as a Timestamp or a number', () => {
    expect(toMillis({ toMillis: () => OPENS })).toBe(OPENS);
    expect(toMillis(OPENS)).toBe(OPENS);
    expect(toMillis(new Date(OPENS).toISOString())).toBe(OPENS);
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis('not a date')).toBeNull();
  });
});

describe('the name that reaches a public board', () => {
  it('publishes the first name alone, never a surname or an initial of one', () => {
    /*
     * CHANGED 2026-09-21, Ted's call on the Arena registration sheet: the rule
     * was first-name-plus-last-initial ("Ted J."), and this test pinned it.
     * The standings go on a stream watched by schools and most of this
     * audience is under 18 — a surname initial is where identifying a specific
     * child starts. A student who wants to be distinguished from a namesake
     * types a name of their own; the field exists for that.
     */
    expect(defaultAlias('Ted Olivier Jacquet')).toBe('Ted');
    expect(defaultAlias('Ted')).toBe('Ted');
    expect(defaultAlias('Sandra Pierre-Louis')).toBe('Sandra');
  });

  it('refuses the placeholder the auth layer substitutes for a missing name', () => {
    expect(defaultAlias('Élève')).toBeNull();
  });

  it('returns null rather than inventing something', () => {
    expect(defaultAlias(undefined)).toBeNull();
    expect(defaultAlias('   ')).toBeNull();
    expect(defaultAlias('123')).toBeNull();
  });
});

describe('a late answer appears but does not count', () => {
  // The key is published when the window closes, and this endpoint keeps
  // accepting for LATE_GRACE_MS afterwards so a student on a bad connection is
  // recorded rather than erased. Those two facts together are a hole: after the
  // close anyone can read the revealed key and submit it.
  const opensAt = 1_000_000;
  const closesAt = opensAt + 20_000;

  it('still accepts it, because erasing an honest slow answer is worse', () => {
    const d = decideSubmission({ opensAt, closesAt, closedAt: null, serverReceivedAt: closesAt + 3_000 });
    expect(d.accept).toBe(true);
    expect(d.late).toBe(true);
  });

  it('scores it zero, unconditionally — decideSubmission’s late flag reaches scoreAnswer', () => {
    const decision = decideSubmission({ opensAt, closesAt, closedAt: null, serverReceivedAt: closesAt + 3_000 });
    const scored = scoreAnswer({
      correct: true,
      opensAt,
      // The dishonest render-time claim, on top of the honest-timing case —
      // this is the actual shape answer.ts produces, decision piped straight
      // into scoring.
      clientShownAt: opensAt + 3_000,
      serverReceivedAt: closesAt + 3_000,
      late: decision.late,
    });
    expect(scored.points).toBe(0);
  });

  it('is what the tiebreakers must ignore', () => {
    // `correct` is school tiebreaker 3 and `fullTierCount` is the individual
    // one. A stream of post-reveal "correct" answers would move a school up a
    // podium it did not earn — which is why answer.ts gates both on !late.
    const late = decideSubmission({ opensAt, closesAt, closedAt: null, serverReceivedAt: closesAt + 5_000 });
    const onTime = decideSubmission({ opensAt, closesAt, closedAt: null, serverReceivedAt: closesAt - 1_000 });
    expect(late.late).toBe(true);
    expect(onTime.late).toBe(false);
  });

  it('refuses one that arrives past the grace window entirely', () => {
    const d = decideSubmission({ opensAt, closesAt, closedAt: null, serverReceivedAt: closesAt + 60_000 });
    expect(d.accept).toBe(false);
  });

  /*
   * CVE reproduction, from the same external audit: a force-close reveals the
   * key and writes `closedAt` WITHOUT moving `closesAt`. Before this fix,
   * `decideSubmission` trusted `closesAt` alone, so a submission arriving
   * after a forced reveal — but before the ANNOUNCED close — was classified
   * on time and scored in full, worse than the render-clamp exploit above
   * because it was not even limited to the half tier.
   */
  describe('a question closed EARLY by an admin (force-close)', () => {
    // Scheduled to run the full 20s, but an admin closed it at the 2s mark.
    const forcedClosedAt = opensAt + 2_000;

    it('treats a submission after the forced close as late, even though the SCHEDULED close is still minutes away', () => {
      const d = decideSubmission({
        opensAt, closesAt, closedAt: forcedClosedAt,
        serverReceivedAt: forcedClosedAt + 500, // 2.5s in — the schedule said 20s
      });
      expect(d.accept).toBe(true);
      expect(d.late).toBe(true);
    });

    it('scores that submission zero, regardless of how much of the announced window remained', () => {
      const decision = decideSubmission({
        opensAt, closesAt, closedAt: forcedClosedAt,
        serverReceivedAt: forcedClosedAt + 500,
      });
      const scored = scoreAnswer({
        correct: true,
        opensAt,
        clientShownAt: opensAt, // reported immediately — the "fastest" possible claim
        serverReceivedAt: forcedClosedAt + 500,
        late: decision.late,
      });
      expect(scored.points).toBe(0);
    });

    it('still measures the grace window from the ACTUAL close, not the announced one', () => {
      const justInsideGrace = decideSubmission({
        opensAt, closesAt, closedAt: forcedClosedAt,
        serverReceivedAt: forcedClosedAt + LATE_GRACE_MS,
      });
      const justOutsideGrace = decideSubmission({
        opensAt, closesAt, closedAt: forcedClosedAt,
        serverReceivedAt: forcedClosedAt + LATE_GRACE_MS + 1,
      });
      expect(justInsideGrace.accept).toBe(true);
      expect(justOutsideGrace.accept).toBe(false);
    });

    it('a submission before the forced close is still ordinary and on time', () => {
      const d = decideSubmission({
        opensAt, closesAt, closedAt: forcedClosedAt,
        serverReceivedAt: forcedClosedAt - 500,
      });
      expect(d.late).toBe(false);
    });
  });
});
