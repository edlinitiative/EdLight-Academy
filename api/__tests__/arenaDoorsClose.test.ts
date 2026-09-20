/**
 * The two decisions in the Arena that cost somebody money if they are wrong:
 * which schools are ranked, and who gets paid.
 *
 * Only the PURE pieces are exercised. Firestore is mocked at the module
 * boundary the way api/__tests__/arenaRateLimit.test.ts does it — both routes
 * call `getDb()` inside their handlers, so importing them must never touch the
 * Admin SDK.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
}));

import {
  planDoorsClose,
  decideQualification,
  countsPresent,
  tallySchools,
  buildRosterEntry,
  summarize,
  PRESENT_UIDS_CAP,
  type PresenceRow,
} from '../arena/doors-close';
import {
  rollDown,
  currentHolder,
  effectiveClaimState,
  parseClaimSubmission,
  tiedAtUnclaimedRank,
  CLAIM_WINDOW_MS,
  FORBIDDEN_CLAIM_FIELDS,
  type ClaimRecord,
  type RankedFinisher,
} from '../arena/claim';

const NOW = 1_770_000_000_000;

// ════════════════════════════════════════════════════════════════════════════
// Qualification — Decision 3: measured at doors close, on players PRESENT
// ════════════════════════════════════════════════════════════════════════════

describe('decideQualification', () => {
  it('qualifies on the present count, not the registered count', () => {
    // The whole point of the freeze. Seven registered, five present, floor of
    // five: qualified. The number that decides is `present`.
    expect(decideQualification({ registered: 7, present: 5, minPlayers: 5 })).toEqual({
      qualified: true, shortBy: 0, basis: 'present',
    });
  });

  it('does NOT qualify a school that registered five and turned up three', () => {
    // Decision 3 in one assertion: a registered no-show does not count.
    expect(decideQualification({ registered: 5, present: 3, minPlayers: 5 })).toEqual({
      qualified: false, shortBy: 2, basis: 'present',
    });
  });

  it('registrations cannot rescue a school, however many there are', () => {
    expect(decideQualification({ registered: 200, present: 4, minPlayers: 5 }).qualified).toBe(false);
  });

  it('falls back to the default floor when minPlayers is malformed', () => {
    // Section C freezes minPlayers per tournament; a missing one is a broken
    // document, and inventing a floor of zero would qualify every school.
    expect(decideQualification({ registered: 9, present: 4, minPlayers: 0 }).qualified).toBe(false);
    expect(decideQualification({ registered: 9, present: 5, minPlayers: NaN }).qualified).toBe(true);
  });
});

describe('countsPresent', () => {
  it('counts a player stamped present during the doors window', () => {
    expect(countsPresent({ presentAt: NOW, duringDoors: true })).toBe(true);
  });

  it('does not count a player first seen after the doors closed', () => {
    // presence.ts keeps accepting heartbeats into `live` so the client is not
    // spammed with errors across the transition — `duringDoors` is the field
    // that says the sighting was before the cut-off.
    expect(countsPresent({ presentAt: NOW, duringDoors: false })).toBe(false);
  });

  it('does not count a registered no-show', () => {
    expect(countsPresent({ presentAt: null, duringDoors: true })).toBe(false);
    expect(countsPresent({ presentAt: undefined, duringDoors: undefined })).toBe(false);
  });
});

describe('tallySchools', () => {
  const row = (over: Partial<PresenceRow> & { uid: string }): PresenceRow => ({
    schoolKey: 'codosa',
    presentAt: NOW,
    duringDoors: true,
    ...over,
  });

  it('separates registered, present and late-arriving', () => {
    const schools = tallySchools([
      row({ uid: 'a' }),
      row({ uid: 'b' }),
      row({ uid: 'c', presentAt: null, duringDoors: undefined }),   // no-show
      row({ uid: 'd', duringDoors: false }),                        // arrived in `live`
    ]);
    const codosa = schools.get('codosa')!;
    expect(codosa.registered).toBe(4);
    expect(codosa.present).toBe(2);
    expect(codosa.presentLate).toBe(1);
    expect(codosa.presentUids).toEqual(['a', 'b']);
  });

  it('keeps schools apart and carries the display label', () => {
    const schools = tallySchools([
      row({ uid: 'a', schoolKey: 'codosa', schoolLabel: 'CODOSA', schoolShort: 'CDS' }),
      row({ uid: 'b', schoolKey: 'sldg' }),
    ]);
    expect(schools.size).toBe(2);
    expect(schools.get('codosa')!.label).toBe('CODOSA');
    expect(schools.get('codosa')!.shortName).toBe('CDS');
    // No label on the row: the key is a readable fallback, never an empty row.
    expect(schools.get('sldg')!.label).toBe('sldg');
  });

  it('drops a schoolless player from the tally without losing the tournament', () => {
    const schools = tallySchools([row({ uid: 'a', schoolKey: '' })]);
    expect(schools.size).toBe(0);
  });

  it('caps the uid sample but never the count', () => {
    const many = Array.from({ length: PRESENT_UIDS_CAP + 25 }, (_, i) => row({ uid: `u${i}` }));
    const codosa = tallySchools(many).get('codosa')!;
    // An approximate count would change a verdict; an approximate uid list
    // only shortens an audit trail.
    expect(codosa.present).toBe(PRESENT_UIDS_CAP + 25);
    expect(codosa.presentUids).toHaveLength(PRESENT_UIDS_CAP);
    expect(codosa.truncated).toBe(true);
  });
});

describe('buildRosterEntry', () => {
  const school = (present: number, registered: number) => ({
    schoolKey: 'codosa', label: 'CODOSA', shortName: 'CDS',
    registered, present, presentLate: 0, presentUids: [], truncated: false,
  });

  it('stamps qualifiedAt only when the school qualified', () => {
    expect(buildRosterEntry(school(5, 6), { minPlayers: 5, frozenAtMs: NOW }).qualifiedAt).toBe(NOW);
    expect(buildRosterEntry(school(3, 6), { minPlayers: 5, frozenAtMs: NOW }).qualifiedAt).toBeNull();
  });

  it('says UNRANKED, never excluded, on a school that missed the floor', () => {
    // The misreading this guards against costs a student their night: "not
    // qualified" must never be read as "these students are out".
    const entry = buildRosterEntry(school(3, 6), { minPlayers: 5, frozenAtMs: NOW });
    expect(entry.qualified).toBe(false);
    expect(entry.excluded).toBe(false);
    expect(entry.studentsStillPlay).toBe(true);
    expect(entry.meaning).toBe('unranked_not_excluded');
  });

  it('writes the same three fields on a school that DID qualify', () => {
    // Written as literals on every document rather than inferred from a
    // missing field, so no reader can treat absence as permission to filter.
    const entry = buildRosterEntry(school(5, 5), { minPlayers: 5, frozenAtMs: NOW });
    expect(entry.excluded).toBe(false);
    expect(entry.studentsStillPlay).toBe(true);
    expect(entry.meaning).toBe('qualified');
  });

  it('records both counts so the lobby can show "5 inscrits · 3 présents"', () => {
    const entry = buildRosterEntry(school(3, 5), { minPlayers: 5, frozenAtMs: NOW });
    expect(entry.registered).toBe(5);
    expect(entry.present).toBe(3);
    expect(entry.basis).toBe('present');
  });
});

describe('summarize', () => {
  it('totals the tournament from the frozen entries', () => {
    const entries = [
      buildRosterEntry({ schoolKey: 'a', label: 'a', shortName: 'a', registered: 6, present: 5, presentLate: 0, presentUids: [], truncated: false }, { minPlayers: 5, frozenAtMs: NOW }),
      buildRosterEntry({ schoolKey: 'b', label: 'b', shortName: 'b', registered: 9, present: 2, presentLate: 0, presentUids: [], truncated: false }, { minPlayers: 5, frozenAtMs: NOW }),
    ];
    expect(summarize(entries, 5)).toEqual({
      schools: 2, qualifiedSchools: 1, playersRegistered: 15, playersPresent: 7, minPlayers: 5,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Idempotency and the refusal after `live`
// ════════════════════════════════════════════════════════════════════════════

describe('planDoorsClose', () => {
  const plan = (over: Partial<Parameters<typeof planDoorsClose>[0]>) => planDoorsClose({
    state: 'doors', frozenAt: null, freezeStartedAt: null, startsAt: null, now: NOW, ...over,
  });

  it('freezes while the tournament is at `doors`', () => {
    expect(plan({})).toBe('freeze');
  });

  describe('CLOSED: a ten-minute waiting room can no longer freeze during its first minute', () => {
    // The exact exploit the external audit found: the every-minute cron
    // selects any tournament sitting in `doors`, and the old check was just
    // `state === 'doors'` — true from the very first tick after
    // `registration -> doors`, up to ten minutes before the room has
    // actually filled.
    const DOORS_OPENED = NOW - 60_000; // one cron tick after entering `doors`
    const STARTS_AT = DOORS_OPENED + 10 * 60_000; // the scheduled first question

    it('refuses to freeze one minute into a ten-minute doors window', () => {
      expect(plan({ now: DOORS_OPENED, startsAt: STARTS_AT })).toBe('too_early');
    });

    it('still refuses with the room five minutes in — halfway is not doors close', () => {
      expect(plan({ now: DOORS_OPENED + 5 * 60_000, startsAt: STARTS_AT })).toBe('too_early');
    });

    it('freezes the instant the scheduled start time arrives', () => {
      expect(plan({ now: STARTS_AT, startsAt: STARTS_AT })).toBe('freeze');
    });

    it('freezes on a late cron tick after the scheduled start time', () => {
      expect(plan({ now: STARTS_AT + 90_000, startsAt: STARTS_AT })).toBe('freeze');
    });

    it('fails open on a malformed legacy document with no startsAt, rather than wedging forever', () => {
      expect(plan({ now: DOORS_OPENED, startsAt: null })).toBe('freeze');
    });
  });

  it('is idempotent: a second run replays instead of re-freezing', () => {
    expect(plan({ frozenAt: NOW - 1_000 })).toBe('already_frozen');
  });

  it('replays even once the tournament is live, so a retrying cron is safe', () => {
    // The frozen answer outranks the state. This is what makes the endpoint
    // safe to wire into a scheduler that retries on a timeout.
    expect(plan({ state: 'live', frozenAt: NOW - 60_000 })).toBe('already_frozen');
    expect(plan({ state: 'provisional', frozenAt: NOW - 60_000 })).toBe('already_frozen');
  });

  it('REFUSES a fresh freeze once `live` has started', () => {
    // A school that lost qualification mid-tournament because a job re-ran is
    // indefensible — so a late run is rejected loudly, never absorbed.
    expect(plan({ state: 'live' })).toBe('too_late');
    expect(plan({ state: 'grading' })).toBe('too_late');
    expect(plan({ state: 'provisional' })).toBe('too_late');
    expect(plan({ state: 'final' })).toBe('too_late');
  });

  it('refuses a void tournament: an event that did not count has no roster', () => {
    expect(plan({ state: 'void' })).toBe('too_late');
  });

  it('refuses before the doors ever opened', () => {
    // Freezing here would record every school at zero present and unqualify
    // the entire tournament.
    expect(plan({ state: 'draft' })).toBe('too_early');
    expect(plan({ state: 'registration' })).toBe('too_early');
    expect(plan({ state: null })).toBe('too_early');
  });

  it('backs off while another attempt holds the lease', () => {
    // Two concurrent scans during `doors` read different presence — presence is
    // still landing — so the loser would overwrite the winner's answer.
    expect(plan({ freezeStartedAt: NOW - 5_000 })).toBe('in_progress');
  });

  it('takes over a lease from an attempt that crashed', () => {
    // A wedged freeze at 18:00 is worse than a rare double scan.
    expect(plan({ freezeStartedAt: NOW - 10 * 60 * 1000 })).toBe('freeze');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Roll-down — section M principle 4
// ════════════════════════════════════════════════════════════════════════════

const finisher = (uid: string, rank: number, eligible?: boolean): RankedFinisher => ({ uid, rank, eligible });

const claim = (over: Partial<ClaimRecord> & { uid: string; rank: number }): ClaimRecord => ({
  prizeCents: 10_000,
  state: 'open',
  expiresAt: NOW + CLAIM_WINDOW_MS,
  ...over,
});

const BOARD = [finisher('w1', 1), finisher('w2', 2), finisher('w3', 3), finisher('w4', 4), finisher('w5', 5)];

describe('effectiveClaimState', () => {
  it('promotes an open claim past its deadline to expired', () => {
    // Nobody calls an endpoint at the 72-hour mark, so the transition has to be
    // derived on read or a prize would be held by two people at once.
    expect(effectiveClaimState(claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }), NOW)).toBe('expired');
  });

  it('leaves an open claim inside its window alone', () => {
    expect(effectiveClaimState(claim({ uid: 'w1', rank: 1, expiresAt: NOW + 1 }), NOW)).toBe('open');
  });

  it('never second-guesses a state a human wrote', () => {
    expect(effectiveClaimState(claim({ uid: 'w1', rank: 1, state: 'verified', expiresAt: NOW - 1 }), NOW)).toBe('verified');
    expect(effectiveClaimState(claim({ uid: 'w1', rank: 1, state: 'rejected', expiresAt: NOW - 1 }), NOW)).toBe('rejected');
  });

  it('reports no claim as no state', () => {
    expect(effectiveClaimState(undefined, NOW)).toBeNull();
  });
});

describe('rollDown', () => {
  it('does NOT move a prize while its published window is still open', () => {
    // The whole value of announcing 72 hours is that they are honoured to the
    // last minute, even if the student has not touched the form.
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW + 60_000 })],
      now: NOW,
    });
    expect(r.moves).toBe(false);
    expect(r.reason).toBe('window_open');
    expect(r.toUid).toBeNull();
  });

  it('does NOT move a prize that is claimed or verified', () => {
    for (const state of ['claimed', 'verified'] as const) {
      const r = rollDown({
        fromRank: 1,
        finishers: BOARD,
        claims: [claim({ uid: 'w1', rank: 1, state, expiresAt: NOW - 1 })],
        now: NOW,
      });
      expect(r.moves).toBe(false);
      expect(r.reason).toBe('still_held');
    }
  });

  it('moves an EXPIRED prize to the next finisher, with the reason recorded', () => {
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 })],
      now: NOW,
    });
    expect(r.moves).toBe(true);
    expect(r.toUid).toBe('w2');
    expect(r.toFinishRank).toBe(2);
    expect(r.reason).toBe('expired');
  });

  it('moves a REJECTED prize immediately', () => {
    // The window protects a student who has not answered yet; this one answered
    // and failed verification.
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [claim({ uid: 'w1', rank: 1, state: 'rejected', expiresAt: NOW + 60_000 })],
      now: NOW,
    });
    expect(r.moves).toBe(true);
    expect(r.reason).toBe('rejected');
    expect(r.toUid).toBe('w2');
  });

  it('NEVER rolls down to somebody already holding a prize', () => {
    // 2nd and 3rd hold their own prizes. Prize 1 skips both and lands on 4th.
    // Shifting everybody up instead would rewrite three announced results to
    // fix one, and re-open two claim windows that had already closed.
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [
        claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }),
        claim({ uid: 'w2', rank: 2, state: 'claimed' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
      now: NOW,
    });
    expect(r.toUid).toBe('w4');
    expect(r.skipped).toEqual([
      { uid: 'w2', rank: 2, why: 'already_holding' },
      { uid: 'w3', rank: 3, why: 'already_holding' },
    ]);
  });

  it('counts an OPEN claim inside its window as holding a prize', () => {
    // 2nd has not filled the form in yet, but the prize is theirs until the
    // deadline — offering it to somebody else meanwhile is the double-award bug.
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [
        claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }),
        claim({ uid: 'w2', rank: 2, state: 'open', expiresAt: NOW + 60_000 }),
      ],
      now: NOW,
    });
    expect(r.toUid).toBe('w3');
    expect(r.skipped).toEqual([{ uid: 'w2', rank: 2, why: 'already_holding' }]);
  });

  it('passes over a finisher who already let a prize expire or was rejected', () => {
    const r = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [
        claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }),
        claim({ uid: 'w2', rank: 2, state: 'expired' }),
        claim({ uid: 'w3', rank: 3, state: 'rejected' }),
      ],
      now: NOW,
    });
    expect(r.toUid).toBe('w4');
    expect(r.skipped).toEqual([
      { uid: 'w2', rank: 2, why: 'expired' },
      { uid: 'w3', rank: 3, why: 'rejected' },
    ]);
  });

  it('passes over a finisher an integrity review has marked ineligible', () => {
    const r = rollDown({
      fromRank: 1,
      finishers: [finisher('w1', 1), finisher('w2', 2, false), finisher('w3', 3)],
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 })],
      now: NOW,
    });
    expect(r.toUid).toBe('w3');
    expect(r.skipped).toEqual([{ uid: 'w2', rank: 2, why: 'ineligible' }]);
  });

  it('treats an absent eligibility verdict as eligible', () => {
    // Section M flags rather than blocks: the absence of a verdict is not one.
    const r = rollDown({
      fromRank: 1,
      finishers: [finisher('w1', 1), finisher('w2', 2)],
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 })],
      now: NOW,
    });
    expect(r.toUid).toBe('w2');
  });

  it('never rolls a prize UPWARDS to a better finisher', () => {
    const r = rollDown({
      fromRank: 3,
      finishers: BOARD,
      claims: [
        claim({ uid: 'w3', rank: 3, expiresAt: NOW - 1 }),
        claim({ uid: 'w1', rank: 1, state: 'expired' }),
      ],
      now: NOW,
    });
    expect(r.toUid).toBe('w4');
  });

  it('reports an exhausted board as a result, not an error', () => {
    const r = rollDown({
      fromRank: 1,
      finishers: [finisher('w1', 1), finisher('w2', 2, false)],
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 })],
      now: NOW,
    });
    expect(r.moves).toBe(false);
    expect(r.toUid).toBeNull();
    expect(r.reason).toBe('no_eligible_finisher');
  });

  it('is deterministic: the same board and clock give the same answer', () => {
    const input = {
      fromRank: 1,
      finishers: BOARD,
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }), claim({ uid: 'w2', rank: 2, state: 'rejected' })],
      now: NOW,
    };
    expect(rollDown(input)).toEqual(rollDown(input));
  });

  it('walks a whole chain: 1 → 3 → 5 as each holder falls away', () => {
    // The scenario the 72-hour window actually produces on a bad week.
    // STEP 1 — w1 lets the window close; w2 already holds prize 2, so prize 1
    // skips them and reaches w3.
    const step1 = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [claim({ uid: 'w1', rank: 1, expiresAt: NOW - 1 }), claim({ uid: 'w2', rank: 2, state: 'verified' })],
      now: NOW,
    });
    expect(step1.toUid).toBe('w3');
    expect(step1.reason).toBe('expired');
    expect(step1.skipped).toEqual([{ uid: 'w2', rank: 2, why: 'already_holding' }]);

    // STEP 2 — w3 now holds prize 1 (a second document at rank 1, with the
    // fresh window the roll-down stamped) and fails verification. w1 already
    // let prize 1 expire, w2 holds prize 2, w4 holds prize 4 — so it reaches
    // w5, and every pass-over is on the record.
    const step2 = rollDown({
      fromRank: 1,
      finishers: BOARD,
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'expired', expiresAt: NOW - 10_000 }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 1, state: 'rejected', expiresAt: NOW + CLAIM_WINDOW_MS }),
        claim({ uid: 'w4', rank: 4, state: 'claimed' }),
      ],
      now: NOW,
    });
    expect(step2.toUid).toBe('w5');
    expect(step2.reason).toBe('rejected');
    expect(step2.skipped).toEqual([
      { uid: 'w2', rank: 2, why: 'already_holding' },
      { uid: 'w4', rank: 4, why: 'already_holding' },
    ]);
  });
});

describe('currentHolder', () => {
  it('picks the current holder, not the document the prize rolled away from', () => {
    // A rolled-down prize leaves two documents at the same rank. Taking the
    // stale one would roll the prize down a SECOND time, from somebody who
    // never held it — and pay the same money twice.
    const held = currentHolder([
      claim({ uid: 'w1', rank: 1, state: 'expired', expiresAt: NOW - 10_000 }),
      claim({ uid: 'w3', rank: 1, state: 'open', expiresAt: NOW + CLAIM_WINDOW_MS }),
    ], 1, NOW);
    expect(held?.uid).toBe('w3');
  });

  it('prefers a holding claim over a stale one with a later deadline', () => {
    const held = currentHolder([
      claim({ uid: 'w1', rank: 1, state: 'rejected', expiresAt: NOW + 10 * CLAIM_WINDOW_MS }),
      claim({ uid: 'w3', rank: 1, state: 'claimed', expiresAt: NOW + 1_000 }),
    ], 1, NOW);
    expect(held?.uid).toBe('w3');
  });

  it('is undefined when nobody was ever offered the prize', () => {
    expect(currentHolder([], 1, NOW)).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E8, from an external audit: a tie at a paying rank must stay a human
// decision — the self-service claim fallback must never mint a second
// competing claim for a rank someone else already has one at.
// ════════════════════════════════════════════════════════════════════════════

describe('tiedAtUnclaimedRank', () => {
  it('is false when nobody has claimed this rank at all', () => {
    expect(tiedAtUnclaimedRank([], 2, 'w2')).toBe(false);
  });

  it('CLOSED: a tied finisher can no longer self-claim a rank someone else already holds', () => {
    // podiumClaims wrote a placeholder for w1 only — w2, tied at rank 2, has
    // no document of their own yet and is exactly who this guards against.
    const claims = [claim({ uid: 'w1', rank: 2, state: 'open', expiresAt: NOW + CLAIM_WINDOW_MS })];
    expect(tiedAtUnclaimedRank(claims, 2, 'w2')).toBe(true);
  });

  it('is false for the finisher who already holds the only claim at their own rank', () => {
    // Not a collision with themselves — this is the ordinary, non-tied case.
    const claims = [claim({ uid: 'w1', rank: 1, state: 'open', expiresAt: NOW + CLAIM_WINDOW_MS })];
    expect(tiedAtUnclaimedRank(claims, 1, 'w1')).toBe(false);
  });

  it('still blocks even once the other claim has expired or was rejected — reassigning it is still a human call', () => {
    expect(tiedAtUnclaimedRank(
      [claim({ uid: 'w1', rank: 2, state: 'expired', expiresAt: NOW - 10_000 })], 2, 'w2',
    )).toBe(true);
    expect(tiedAtUnclaimedRank(
      [claim({ uid: 'w1', rank: 2, state: 'rejected', expiresAt: NOW + CLAIM_WINDOW_MS })], 2, 'w2',
    )).toBe(true);
  });

  it('ignores claims at a different rank entirely', () => {
    const claims = [claim({ uid: 'w1', rank: 1, state: 'open', expiresAt: NOW + CLAIM_WINDOW_MS })];
    expect(tiedAtUnclaimedRank(claims, 2, 'w2')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// The claim form — guardians, and what is never stored
// ════════════════════════════════════════════════════════════════════════════

describe('parseClaimSubmission', () => {
  it('accepts a minor with a guardian', () => {
    const r = parseClaimSubmission({
      contact: '+509 3456 7890',
      isMinor: true,
      guardian: { name: 'Marie Joseph', contact: '+509 1111 2222', relationship: 'manman' },
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.guardian).toEqual({
      name: 'Marie Joseph', contact: '+509 1111 2222', relationship: 'manman',
    });
  });

  it('refuses a minor without one', () => {
    const r = parseClaimSubmission({ contact: '+509 3456 7890', isMinor: true });
    expect(r).toEqual({ ok: false, error: 'guardian_required' });
  });

  it('does not require a guardian for an adult, and writes the field as null', () => {
    // Null, not absent: a guardian modelled as an optional afterthought is one
    // that half the code forgets to read.
    const r = parseClaimSubmission({ contact: 'ted@example.com', isMinor: false });
    expect(r.ok && r.value.guardian).toBeNull();
  });

  it('demands an explicit answer on minor status rather than guessing', () => {
    // Default it false and a 14-year-old is paid without a guardian; default it
    // true and an adult is blocked behind one they do not have.
    expect(parseClaimSubmission({ contact: 'x@example.com' })).toEqual({
      ok: false, error: 'minor_status_required',
    });
  });

  it('accepts a WhatsApp number as a contact', () => {
    // Insisting on an "@" would reject most of the winners this is meant to reach.
    expect(parseClaimSubmission({ contact: '37123456', isMinor: false }).ok).toBe(true);
  });

  it('REFUSES any body carrying an identity document', () => {
    // Verification happens on a call. We are collecting from minors, and a
    // store of children's identity documents is the highest-consequence data
    // this product could hold — so it is rejected at the door, not dropped
    // quietly downstream.
    for (const field of FORBIDDEN_CLAIM_FIELDS) {
      const r = parseClaimSubmission({ contact: 'x@example.com', isMinor: false, [field]: 'https://…' });
      expect(r).toEqual({ ok: false, error: 'forbidden_field', field });
    }
  });

  it('rejects an unusable contact string', () => {
    expect(parseClaimSubmission({ contact: 'x', isMinor: false })).toEqual({ ok: false, error: 'invalid_contact' });
  });

  it('rejects a guardian with no reachable contact', () => {
    const r = parseClaimSubmission({
      contact: '+509 3456 7890', isMinor: true, guardian: { name: 'Marie', contact: '' },
    });
    expect(r).toEqual({ ok: false, error: 'invalid_guardian' });
  });
});
