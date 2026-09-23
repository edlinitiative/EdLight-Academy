import { validateTournamentInput, formatPin, makePin, isValidPin } from '../../shared/tournois/config';
import {
  buildSchedule, livePositionAt, decideLiveAdvance, bracketSchedule, roundAt, lastClosedRound,
  roundsNextDeadline, attemptAnswerLate, LIVE_REVEAL_MS,
} from '../../shared/tournois/schedule';
import { scoreAnswer, clampLiveStart, rankPlayers, rankTournamentTeams, POINTS_FULL, POINTS_HALF } from '../../shared/tournois/scoring';
import { firstRound, resolveMatch, nextRound, bracketOrder, nextPow2, playersInRound } from '../../shared/tournois/bracket';
import { drawQuestions, toPublicQuestion, seededRandom, attemptOrder, shuffleOptions } from '../../shared/tournois/questions';

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const CATS = ['maths_eclair', 'capitals'];
const base = {
  title: 'Défi NS4',
  format: 'live',
  visibility: 'public',
  categories: ['maths_eclair'],
  questionCount: 10,
  secondsPerQuestion: 20,
  startsAt: NOW + 10 * 60 * 1000,
};

describe('validateTournamentInput', () => {
  it('accepts a live tournament and defaults to solo', () => {
    const r = validateTournamentInput(base, NOW, CATS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.teamRule).toBe('solo');
      expect(r.config.teamSize).toBe(0);
      expect(r.config.creatorPlays).toBe(true);
    }
  });

  it('names every bad field', () => {
    const r = validateTournamentInput({ ...base, title: 'x', format: 'marathon', categories: ['nope'], startsAt: NOW }, NOW, CATS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(expect.arrayContaining(['title', 'format', 'categories', 'startsAt']));
  });

  it('caps a window at two weeks', () => {
    expect(validateTournamentInput({ ...base, format: 'window', questionCount: 10, windowHours: 14 * 24 }, NOW, CATS).ok).toBe(true);
    expect(validateTournamentInput({ ...base, format: 'window', questionCount: 10, windowHours: 14 * 24 + 1 }, NOW, CATS).ok).toBe(false);
  });

  it('forces a bracket to solo and at most 64 players', () => {
    const r = validateTournamentInput({ ...base, format: 'bracket', teamRule: 'school', roundHours: 24, questionCount: 10 }, NOW, CATS);
    expect(r.ok && r.config.teamRule).toBe('solo');
    expect(r.ok && r.config.maxPlayers).toBe(64);
    expect(validateTournamentInput({ ...base, format: 'bracket', roundHours: 24, questionCount: 10, maxPlayers: 65 }, NOW, CATS).ok).toBe(false);
  });

  it('school vs school keeps a team size of 3 or 5', () => {
    const r = validateTournamentInput({ ...base, teamRule: 'school', teamSize: 3 }, NOW, CATS);
    expect(r.ok && r.config.teamSize).toBe(3);
  });

  it('PINs', () => {
    expect(isValidPin(makePin(() => 0))).toBe(true);
    expect(isValidPin(makePin(() => 0.999999))).toBe(true);
    expect(formatPin('829415')).toBe('829 415');
  });
});

describe('live schedule and lazy advance', () => {
  const cfg = (validateTournamentInput(base, NOW, CATS) as any).config;
  const s = buildSchedule(cfg);
  const slot = 20_000 + LIVE_REVEAL_MS;

  it('lays out questions, reveals and the end', () => {
    expect(s.endsAt).toBe(base.startsAt + 10 * slot);
    expect(livePositionAt(s, base.startsAt - 1).phase).toBe('lobby');
    expect(livePositionAt(s, base.startsAt).phase).toBe('question');
    expect(livePositionAt(s, base.startsAt + 20_000).phase).toBe('reveal');
    const p = livePositionAt(s, base.startsAt + slot + 1);
    expect([p.phase, p.index]).toEqual(['question', 1]);
    expect(livePositionAt(s, s.endsAt).phase).toBe('done');
  });

  it('is idempotent: the second tick at the same instant does nothing', () => {
    const t = base.startsAt + 5;
    const first = decideLiveAdvance(s, { phase: 'lobby', index: -1 }, t);
    expect(first.noop).toBe(false);
    expect(first.target.phase).toBe('question');
    const second = decideLiveAdvance(s, { phase: first.target.phase, index: first.target.index }, t);
    expect(second.noop).toBe(true);
  });

  it('a late tick reveals every question it skipped, in order', () => {
    const t = base.startsAt + 3 * slot + 21_000; // question 3 in reveal
    const a = decideLiveAdvance(s, { phase: 'question', index: 1 }, t);
    expect(a.revealedIndexes).toEqual([1, 2, 3]);
    expect([a.target.phase, a.target.index]).toEqual(['reveal', 3]);
  });

  it('jumping straight to the end still reveals the last question and finishes', () => {
    const a = decideLiveAdvance(s, { phase: 'question', index: 9 }, s.endsAt + 1);
    expect(a.revealedIndexes).toEqual([9]);
    expect(a.finished).toBe(true);
    expect(decideLiveAdvance(s, { phase: 'done', index: 10 }, s.endsAt + 5).noop).toBe(true);
  });
});

describe('round windows', () => {
  it('rounds are consecutive and the deadline walks through them', () => {
    const cfg = (validateTournamentInput({ ...base, format: 'rounds', roundCount: 3, roundHours: 24 }, NOW, CATS) as any).config;
    const s = buildSchedule(cfg);
    expect(s.rounds).toHaveLength(3);
    expect(s.rounds[1].opensAt).toBe(s.rounds[0].closesAt);
    expect(roundAt(s.rounds, s.startsAt + 1)?.index).toBe(0);
    expect(lastClosedRound(s.rounds, s.rounds[1].opensAt)).toBe(0);
    expect(roundsNextDeadline(s.rounds, s.startsAt - 1)).toBe(s.startsAt);
    expect(roundsNextDeadline(s.rounds, s.endsAt)).toBeNull();
  });

  it('a bracket re-derives its rounds from the entrants', () => {
    const cfg = (validateTournamentInput({ ...base, format: 'bracket', roundHours: 24, questionCount: 10 }, NOW, CATS) as any).config;
    const s = buildSchedule(cfg);
    expect(s.rounds).toHaveLength(6); // 64 players worst case
    expect(bracketSchedule(s, 5).rounds).toHaveLength(3);
  });

  it('an answer past the question time (+ grace) is late', () => {
    expect(attemptAnswerLate(0, 20_000, 21_000)).toBe(false);
    expect(attemptAnswerLate(0, 20_000, 21_600)).toBe(true);
  });
});

describe('scoring', () => {
  it('correctness first, speed as a tier', () => {
    expect(scoreAnswer({ correct: true, startedAt: 0, receivedAt: 9_000, questionMs: 20_000, late: false }).points).toBe(POINTS_FULL);
    expect(scoreAnswer({ correct: true, startedAt: 0, receivedAt: 15_000, questionMs: 20_000, late: false }).points).toBe(POINTS_HALF);
    expect(scoreAnswer({ correct: false, startedAt: 0, receivedAt: 1_000, questionMs: 20_000, late: false }).points).toBe(0);
    expect(scoreAnswer({ correct: true, startedAt: 0, receivedAt: 1_000, questionMs: 20_000, late: true }).points).toBe(0);
  });

  it('a client cannot claim a late paint for a head start', () => {
    expect(clampLiveStart(1_000, 60_000)).toBe(4_000);
    expect(clampLiveStart(1_000, 0)).toBe(1_000);
    expect(clampLiveStart(1_000, 'x')).toBe(1_000);
  });

  it('ranks by points, then correct, then time; ties share a rank', () => {
    const rows = [
      { uid: 'a', displayName: 'Ana', points: 2000, correct: 2, answered: 3, totalMs: 9000 },
      { uid: 'b', displayName: 'Bo', points: 2000, correct: 2, answered: 3, totalMs: 7000 },
      { uid: 'c', displayName: 'Cy', points: 2000, correct: 2, answered: 3, totalMs: 7000 },
      { uid: 'd', displayName: 'Di', points: 3000, correct: 3, answered: 3, totalMs: 12000 },
    ];
    const r = rankPlayers(rows);
    expect(r.map((x) => [x.uid, x.rank])).toEqual([['d', 1], ['b', 2], ['c', 2], ['a', 4]]);
  });

  it('school vs school: best five, and a short school is not ranked', () => {
    const mk = (uid: string, school: string, points: number) => ({ uid, displayName: uid, school, points, correct: 0, answered: 0, totalMs: 0 });
    const rows = [
      ...[100, 100, 100, 100, 100].map((p, i) => mk(`s${i}`, 'Petit Lycée', p)),
      ...Array(12).fill(40).map((p, i) => mk(`g${i}`, 'Grand Collège', p)),
      mk('x', 'Seul', 5000),
    ];
    const teams = rankTournamentTeams('school', 5, rows);
    expect(teams[0].label).toBe('Petit Lycée');
    expect(teams[0].teamXp).toBe(500);
    expect(teams.find((t) => t.label === 'Seul')?.qualified).toBe(false);
  });
});

describe('bracket', () => {
  const ent = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: `u${i + 1}`, displayName: `P${i + 1}`, seed: i + 1 }));

  it('standard order keeps 1 and 2 apart', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(nextPow2(5)).toBe(8);
  });

  it('five players: three byes to the top seeds', () => {
    const r0 = firstRound(ent(5));
    expect(r0).toHaveLength(4);
    const byes = r0.filter((m) => m.status === 'bye').map((m) => m.winnerUid);
    expect(byes.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(playersInRound(r0).sort()).toEqual(['u4', 'u5']);
  });

  it('higher score wins; a no-show loses; both absent → better seed', () => {
    const [m] = firstRound(ent(2));
    const win = resolveMatch(m, { u1: { points: 1000, correct: 1, totalMs: 5000, played: true }, u2: { points: 2000, correct: 2, totalMs: 9000, played: true } });
    expect(win.winnerUid).toBe('u2');
    const wo = resolveMatch(m, { u2: { points: 0, correct: 0, totalMs: 0, played: true } });
    expect([wo.status, wo.winnerUid]).toEqual(['walkover', 'u2']);
    expect(resolveMatch(m, {}).winnerUid).toBe('u1');
  });

  it('winners pair into the next round until one remains', () => {
    const r0 = firstRound(ent(4)).map((m) => resolveMatch(m, {}));
    const r1 = nextRound(r0);
    expect(r1).toHaveLength(1);
    expect([r1[0].a?.uid, r1[0].b?.uid]).toEqual(['u1', 'u2']);
    expect(nextRound([resolveMatch(r1[0], {})])).toEqual([]);
  });
});

describe('question draw', () => {
  const bank = {
    maths_eclair: Array.from({ length: 6 }, (_, i) => ({ q: `M${i}`, options: ['a', 'b', 'c', 'd'], answer: 1 })),
    capitals: Array.from({ length: 6 }, (_, i) => ({ q: `C${i}`, options: ['w', 'x', 'y', 'z'], optionsHt: ['W', 'X', 'Y', 'Z'], answer: 2 })),
  };

  it('spreads across categories and never repeats', () => {
    const qs = drawQuestions(bank, CATS, 8, seededRandom(1));
    expect(qs).toHaveLength(8);
    expect(new Set(qs.map((q) => q.q)).size).toBe(8);
    expect(qs.filter((q) => q.category === 'capitals').length).toBe(4);
  });

  it('the key follows the shuffled options, Kreyòl included', () => {
    const q = shuffleOptions(bank.capitals[0], 'capitals', seededRandom(7));
    expect(q.options[q.answer]).toBe('y');
    expect(q.optionsHt?.[q.answer]).toBe('Y');
  });

  it('the public copy carries no key', () => {
    const q = drawQuestions(bank, CATS, 1, seededRandom(2))[0];
    const pub = toPublicQuestion(q) as any;
    expect(pub.answer).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
  });

  it('an attempt gets its own subset of the pool', () => {
    const o = attemptOrder(30, 10, seededRandom(3));
    expect(o).toHaveLength(10);
    expect(new Set(o).size).toBe(10);
    expect(o.every((i) => i >= 0 && i < 30)).toBe(true);
  });
});
