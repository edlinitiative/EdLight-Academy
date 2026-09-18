/**
 * The lobby's decisions, without a renderer.
 *
 * Three things on the Arena lobby are load-bearing and none of them is visual:
 * the countdown a student watches for an hour, the arithmetic that decides
 * whether their school has a team, and the copy of the invite they send. All
 * three live as pure functions in arenaService so they can be tested here —
 * mobile tests in this repo are logic-only (no React Testing Library), and the
 * service module reaches firebase at import time, so both firebase surfaces are
 * stubbed out.
 */
import {
  formatCountdown,
  countdownParts,
  qualificationState,
  inviteCase,
  buildArenaInviteMessage,
  tierRing,
} from '../../services/arenaService';

jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  Timestamp: class {},
}));

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('the countdown', () => {
  it('pads every field, so the digits never shuffle sideways', () => {
    // The hero is looked at continuously for an hour. Width has to be stable.
    expect(formatCountdown(9 * MIN + 5 * SEC)).toBe('00:09:05');
    expect(formatCountdown(2 * HOUR + 14 * MIN + 9 * SEC)).toBe('02:14:09');
  });

  it('names days rather than folding them into hours', () => {
    // "47:12:03" is a number nobody reads as two days.
    expect(formatCountdown(2 * DAY + 3 * HOUR + 4 * MIN + 5 * SEC)).toBe('2j 03:04:05');
  });

  it('floors to the second rather than rounding up', () => {
    expect(formatCountdown(1999)).toBe('00:00:01');
  });

  it('bottoms out at zero instead of counting backwards', () => {
    // A negative remainder is the normal state of a page left open past doors.
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-60 * SEC)).toBe('00:00:00');
    expect(countdownParts(-1).done).toBe(true);
  });
});

describe('qualification', () => {
  const min = 5;

  it('counts registrations before doors open', () => {
    const q = qualificationState({ registered: 3, present: 0, minPlayers: min, doorsOpen: false });
    expect(q.counted).toBe(3);
    expect(q.needed).toBe(2);
    expect(q.qualified).toBe(false);
    expect(q.showBoth).toBe(false);
  });

  it('qualifies a school that reaches the floor', () => {
    const q = qualificationState({ registered: 5, present: 0, minPlayers: min, doorsOpen: false });
    expect(q.qualified).toBe(true);
    expect(q.needed).toBe(0);
  });

  it('switches to PRESENCE once doors open — a no-show does not count', () => {
    // Decisions 2026-09-18 §3: qualification is evaluated at doors close on
    // players actually present. Five registered and three present is a school
    // that is short, and the lobby has to say so before kick-off.
    const q = qualificationState({ registered: 5, present: 3, minPlayers: min, doorsOpen: true });
    expect(q.counted).toBe(3);
    expect(q.needed).toBe(2);
    expect(q.qualified).toBe(false);
    expect(q.shortOnTheNight).toBe(true);
    expect(q.showBoth).toBe(true);
  });

  it('does not call a school short on the night when it never registered five', () => {
    // It is short, but not in the "you had a team and lost it" sense — that
    // distinction is what the push notification is keyed on.
    const q = qualificationState({ registered: 3, present: 3, minPlayers: min, doorsOpen: true });
    expect(q.shortOnTheNight).toBe(false);
  });

  it('never reports a negative shortfall when more than five turn up', () => {
    const q = qualificationState({ registered: 9, present: 8, minPlayers: min, doorsOpen: true });
    expect(q.needed).toBe(0);
    expect(q.qualified).toBe(true);
  });
});

describe('the invite', () => {
  const qual = (over: Partial<Parameters<typeof qualificationState>[0]>) =>
    qualificationState({ registered: 3, present: 0, minPlayers: 5, doorsOpen: false, ...over });

  const build = (q: ReturnType<typeof qualificationState>, lang: 'fr' | 'ht' = 'fr', code?: string) =>
    buildArenaInviteMessage({
      schoolName: 'CODOSA',
      qualification: q,
      lang,
      url: 'https://academy.edlight.org/arena',
      referralCode: code ?? null,
    });

  it('picks the right case for each state', () => {
    expect(inviteCase(qual({ registered: 3 }))).toBe('short');
    expect(inviteCase(qual({ registered: 5 }))).toBe('qualified');
    expect(inviteCase(qual({ registered: 5, present: 3, doorsOpen: true }))).toBe('doors-short');
  });

  it('is framed around the SCHOOL, not the sender', () => {
    // "Viens jouer avec moi" asks for a favour. This states a fact about
    // something the reader already belongs to — it is the whole mechanic.
    const msg = build(qual({ registered: 3 }));
    expect(msg).toContain('Il manque 2 joueurs à CODOSA');
    expect(msg).not.toMatch(/\bmoi\b/);
    expect(msg).toContain('https://academy.edlight.org/arena');
  });

  it('agrees the noun with the shortfall', () => {
    expect(build(qual({ registered: 4 }))).toContain('1 joueur à CODOSA');
    expect(build(qual({ registered: 4 }))).not.toContain('1 joueurs');
  });

  it('shifts from "register" to "come now" once doors open', () => {
    const msg = build(qual({ registered: 5, present: 3, doorsOpen: true }));
    expect(msg).toContain('La salle est ouverte');
    expect(msg).toContain('2 joueurs');
    expect(msg).not.toContain('se qualifier');
  });

  it('celebrates rather than begs once the school is qualified', () => {
    const msg = build(qual({ registered: 5 }));
    expect(msg).toContain('CODOSA EST QUALIFIÉ');
    expect(msg).not.toContain('Il manque');
  });

  it('carries the referral code when the growth rails minted one', () => {
    expect(build(qual({ registered: 3 }), 'fr', 'TED42')).toContain('TED42');
    expect(build(qual({ registered: 3 }), 'fr')).not.toContain('code');
  });

  it('speaks Kreyòl without pluralising the noun', () => {
    const msg = build(qual({ registered: 3 }), 'ht');
    expect(msg).toContain('2 jwè nan CODOSA');
    expect(msg).not.toContain('joueurs');
  });
});

describe('the tier clock', () => {
  it('marks the full/half boundary at 12s of the 20s ring', () => {
    // The mark has to be at a fixed place on the ring, because it is drawn
    // before it is reached — a boundary you only see once you cross it is a
    // report, not a warning.
    expect(tierRing(0).boundary).toBeCloseTo(0.4, 5);
  });

  it('counts down to the NEXT tier, not to zero', () => {
    expect(tierRing(5_000)).toMatchObject({ tier: 'full', secondsInTier: 7 });
    expect(tierRing(13_000)).toMatchObject({ tier: 'half', secondsInTier: 7 });
  });

  it('scores the boundary second at the higher tier', () => {
    expect(tierRing(12_000).tier).toBe('full');
    expect(tierRing(12_001).tier).toBe('half');
    expect(tierRing(20_000).tier).toBe('half');
    expect(tierRing(20_001).tier).toBe('none');
  });

  it('never lets the arc go negative on a question left open', () => {
    expect(tierRing(999_999).remaining).toBe(0);
    expect(tierRing(999_999).secondsInTier).toBe(0);
  });
});

// ── What the result screen leads with ───────────────────────────────────────
//
// Most players will not be near the podium. A result screen that leads with a
// rank tells almost everyone they lost; whether they were one of the five who
// counted for their school is something nearly anyone can have done, and it is
// what makes them bring four friends next month.
describe('a student\'s contribution to their school', () => {
  const inFive = (uid: string, top5: string[]) => top5.includes(uid);

  it('is true when the student is one of the counted five', () => {
    expect(inFive('u3', ['u1', 'u2', 'u3', 'u4', 'u5'])).toBe(true);
  });

  it('is false when they played but did not make the five', () => {
    // Not a failure state on screen: they still played for their school, and
    // their individual score still stands.
    expect(inFive('u9', ['u1', 'u2', 'u3', 'u4', 'u5'])).toBe(false);
  });

  it('is false for a school with no five at all', () => {
    // A school short of the floor has no top5 to be in. It still plays.
    expect(inFive('u1', [])).toBe(false);
  });
});

describe('accuracy is out of the questions asked, not the ones answered', () => {
  const accuracy = (correct: number, questionCount: number) =>
    questionCount > 0 ? Math.round((correct / questionCount) * 100) : null;

  it('counts a skipped question against you, because it was asked', () => {
    // Dividing by answered would show 100% to someone who answered one question
    // correctly and slept through twenty-four.
    expect(accuracy(1, 25)).toBe(4);
  });

  it('has no answer before a tournament has any questions', () => {
    expect(accuracy(0, 0)).toBeNull();
  });
});
