import {
  answerCue,
  boardLines,
  boardMoved,
  phaseCue,
  presentationPhase,
  secondsLeft,
  standingsMoves,
} from '../../shared/competition/presentation';
import { projectorRows, projectorSchools } from '../pages/competition/fixtures';
import type { Standings } from '../../shared/tournois/models';

describe('presentationPhase', () => {
  it('names one phase from the tournament state and the live document', () => {
    expect(presentationPhase('scheduled', null)).toBe('lobby');
    expect(presentationPhase('running', { phase: 'lobby' })).toBe('lobby');
    expect(presentationPhase('running', { phase: 'question' })).toBe('question');
    expect(presentationPhase('running', { phase: 'reveal' })).toBe('reveal');
    expect(presentationPhase('running', null)).toBe('interval');
    expect(presentationPhase('running', { phase: 'done' })).toBe('results');
    expect(presentationPhase('finished', { phase: 'reveal' })).toBe('results');
    expect(presentationPhase('cancelled', { phase: 'question' })).toBe('cancelled');
    // The projector before its tournament row arrives: the live doc decides.
    expect(presentationPhase('', { phase: 'question' })).toBe('question');
  });
});

describe('cues', () => {
  it('fires only on real beats, never on the first render', () => {
    expect(phaseCue(null, 'question')).toBeNull();
    expect(phaseCue('lobby', 'question')).toBe('roundStart');
    expect(phaseCue('reveal', 'question')).toBe('roundStart');
    expect(phaseCue('question', 'question')).toBeNull();
    expect(phaseCue('question', 'reveal')).toBeNull();
    expect(phaseCue('reveal', 'results')).toBe('podium');
    expect(phaseCue('cancelled', 'results')).toBeNull();
    expect(phaseCue('question', 'cancelled')).toBeNull();
  });

  it("gives the student's own verdict, and nothing without an answer", () => {
    expect(answerCue(2, 2)).toBe('correct');
    expect(answerCue(1, 2)).toBe('wrong');
    expect(answerCue(null, 2)).toBeNull();
    expect(answerCue(undefined, 2)).toBeNull();
    expect(answerCue(-1, 2)).toBeNull();
    expect(answerCue(0, null)).toBeNull();
  });
});

describe('standingsMoves (the reorder)', () => {
  it('a first board moves nothing and announces nobody as new', () => {
    expect(standingsMoves(null, ['a', 'b'])).toEqual({ a: { delta: 0, entered: false }, b: { delta: 0, entered: false } });
  });

  it('counts places gained (positive) and lost (negative)', () => {
    const m = standingsMoves(['a', 'b', 'c', 'd'], ['c', 'a', 'b', 'd']);
    expect(m).toEqual({
      c: { delta: 2, entered: false },
      a: { delta: -1, entered: false },
      b: { delta: -1, entered: false },
      d: { delta: 0, entered: false },
    });
    expect(boardMoved(m)).toBe(true);
    expect(boardMoved(standingsMoves(['a', 'b'], ['a', 'b']))).toBe(false);
  });

  it('marks rows that were not on the previous board as entered', () => {
    const m = standingsMoves(['a', 'b'], ['a', 'z']);
    expect(m.z).toEqual({ delta: 0, entered: true });
    expect(boardMoved(m)).toBe(true);
  });

  it('matches the fixture story: Nadège climbs after question 4', () => {
    const { before, after } = projectorRows();
    const m = standingsMoves(before.map((r) => r.uid), after.map((r) => r.uid));
    const nadege = after.find((r) => r.displayName === 'Nadège Pierre-Louis')!;
    expect(nadege.rank).toBeLessThan(4);
    expect(m[nadege.uid].delta).toBe(4 - nadege.rank);
    // Ranks stay a permutation 1..n.
    expect(after.map((r) => r.rank)).toEqual(after.map((_, i) => i + 1));
  });
});

describe('boardLines', () => {
  const board = (patch: Partial<Standings>): Standings => ({ rows: [], teams: [], total: 0, final: false, updatedAt: 0, ...patch });

  it('players carry their school for the crest and the subline', () => {
    const { after } = projectorRows();
    const lines = boardLines(board({ rows: after }), 0, 8);
    expect(lines).toHaveLength(8);
    expect(lines[0].kind).toBe('player');
    expect(lines.some((l) => l.school)).toBe(true);
    expect(lines.every((l) => l.face?.seed)).toBe(true);
  });

  it('school squads become schools only under teamRule "school"', () => {
    const { after } = projectorSchools();
    const schools = boardLines(board({ teams: after }), 0, 8, 'school');
    expect(schools[0].kind).toBe('squad');
    expect(schools[0].school).toBe(schools[0].name);
    const grades = boardLines(board({ teams: after }), 0, 8, 'grade');
    expect(grades[0].school).toBeNull();
  });

  it('named teams win over squads and players', () => {
    const lines = boardLines(board({
      namedTeams: [{ id: 'x', label: 'Les Lambis', starters: [], points: 10, correct: 1, totalMs: 1, missing: 0, rank: 1, contributions: [] }],
      teams: projectorSchools().after,
    }), 1, 8, 'school');
    expect(lines).toEqual([expect.objectContaining({ key: 't:x', name: 'Les Lambis', kind: 'team', school: null })]);
  });
});

it('secondsLeft only counts an open question, never below zero', () => {
  expect(secondsLeft({ phase: 'question', closesAt: 10_500 }, 0)).toBe(11);
  expect(secondsLeft({ phase: 'question', closesAt: 0 }, 5000)).toBe(0);
  expect(secondsLeft({ phase: 'reveal', closesAt: 10_000 }, 0)).toBeNull();
  expect(secondsLeft(null, 0)).toBeNull();
});
