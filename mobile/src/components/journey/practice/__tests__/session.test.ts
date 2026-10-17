import {
  buildDeck, chooseNextAction, itemFromQuizQuestion, itemFromCard, reviewIdsOf, reviewOutcomeOf, savedLineKind,
  sessionSlice, statusOf, tally, correctionCount, QUIZ_LENGTH, type LogEntry,
} from '../session';
import { answerStatusLabel, modeRules } from '../copy';
import { item } from './fixtures';

const picked = (n: number | null): LogEntry => ({ selected: n });

describe('itemFromQuizQuestion', () => {
  it('resolves letter, number and text keys the same way the cards do', () => {
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['x', 'y'], answer: 'B' })!.correctIndex).toBe(1);
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['0', '7', '14'], answer: '7' })!.correctIndex).toBe(1);
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['Vrai', 'Faux'], answer: 'Faux' })!.correctIndex).toBe(1);
  });
  it('keeps an unresolvable key as -1 (ungraded), never guesses', () => {
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['x', 'y'], answer: 'Z' })!.correctIndex).toBe(-1);
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['x', 'y'], answer: '' })!.correctIndex).toBe(-1);
  });
  it('drops rows that cannot be shown', () => {
    expect(itemFromQuizQuestion({ id: 'a', question: '', options: ['x', 'y'], answer: 'A' })).toBeNull();
    expect(itemFromQuizQuestion({ id: 'a', question: 'Q', options: ['x'], answer: 'A' })).toBeNull();
  });
  it('maps a non-gradable card to -1', () => {
    const card = { id: 'c', question: 'Q', options: ['x', 'y'], correctIndex: -1, answer: '', lessonNo: null, gradable: false };
    expect(itemFromCard(card).correctIndex).toBe(-1);
  });
});

describe('statusOf', () => {
  const graded = item('g', 1);
  const keyless = item('k', 1, { correctIndex: -1 });
  it('distinguishes correct, incorrect and unanswered', () => {
    expect(statusOf(graded, picked(0))).toBe('correct');
    expect(statusOf(graded, picked(2))).toBe('incorrect');
    expect(statusOf(graded, null)).toBe('unanswered');
    expect(statusOf(graded, picked(null))).toBe('unanswered');
  });
  it('never marks a key-less question wrong', () => {
    expect(statusOf(keyless, picked(1))).toBe('ungraded');
    expect(statusOf(keyless, null)).toBe('unanswered');
  });
  it('has words for every status, ungraded included', () => {
    const t = (fr: string) => fr;
    expect(answerStatusLabel('ungraded', t)).toBe('Non corrigée automatiquement');
    expect(answerStatusLabel('unanswered', t)).toBe('Sans réponse');
    expect(answerStatusLabel('partial', t)).toBe('Partiellement correct');
  });
});

describe('tally', () => {
  const deck = [item('a', 1), item('b', 1), item('c', 1), item('k', 1, { correctIndex: -1 }), item('e', 1)];
  const log = [picked(0), picked(1), null, picked(2), null];
  it('keeps unanswered and ungraded apart from incorrect', () => {
    const t = tally(deck, log);
    expect(t).toMatchObject({ total: 5, correct: 1, incorrect: 1, unanswered: 2, ungraded: 1, scored: 4 });
    expect(correctionCount(t)).toBe(2);
  });
  it('sends only graded misses on real ids to Révision', () => {
    expect(reviewIdsOf(deck, log)).toEqual(['b']);
    expect(reviewOutcomeOf(item('q3', 1), picked(1))).toBeNull(); // synthetic id
    expect(reviewOutcomeOf(deck[3], picked(2))).toBeNull(); // ungraded
    expect(reviewOutcomeOf(deck[2], null)).toBeNull(); // unanswered
    expect(reviewOutcomeOf(deck[0], picked(0))).toBe(true);
  });
});

describe('sessionSlice', () => {
  const deck = [item('a', 1), item('b', 1), item('c', 1)];
  it('a quiz reports its whole deck', () => {
    expect(sessionSlice(deck, [picked(0)], 'quiz').items).toHaveLength(3);
  });
  it('open practice ends where the student stopped', () => {
    const s = sessionSlice(deck, [picked(0), picked(1), null], 'practice');
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(sessionSlice(deck, [null, null, null], 'practice').items).toHaveLength(0);
  });
});

describe('buildDeck', () => {
  const pool = [item('a', 1), item('k', 1, { correctIndex: -1 }), item('a', 1), item('b', 1)];
  it('a quiz holds only gradable, distinct questions', () => {
    expect(buildDeck(pool, 'quiz').map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('open practice keeps the ungradable ones (shown as such)', () => {
    expect(buildDeck(pool, 'practice').map((i) => i.id)).toEqual(['a', 'k', 'b']);
  });
  it('caps the quiz at the current session size', () => {
    const big = Array.from({ length: 40 }, (_, i) => item(`x${i}`, 1));
    expect(buildDeck(big, 'quiz')).toHaveLength(QUIZ_LENGTH);
  });
});

describe('chooseNextAction', () => {
  const clean = tally([item('a', 1)], [picked(0)]);
  const missed = tally([item('a', 1)], [picked(1)]);
  it('sends the student to Révision when errors are due in this scope', () => {
    expect(chooseNextAction({ dueInScope: 2, hasNextLesson: true, poolSize: 5 }, missed))
      .toEqual({ primary: 'review', secondary: 'replay', caughtUp: false });
  });
  it('moves on to the next lesson when nothing is due', () => {
    expect(chooseNextAction({ dueInScope: 0, hasNextLesson: true, poolSize: 5 }, clean))
      .toEqual({ primary: 'nextLesson', secondary: 'replay', caughtUp: true });
  });
  it('says caught up instead of inventing a weakness', () => {
    const c = chooseNextAction({ dueInScope: 0, hasNextLesson: false, poolSize: 5 }, clean);
    expect(c.primary).toBe('replay');
    expect(c.caughtUp).toBe(true);
  });
  it('a miss already fixed elsewhere is not "caught up" for this session', () => {
    expect(chooseNextAction({ dueInScope: 0, hasNextLesson: false, poolSize: 5 }, missed).caughtUp).toBe(false);
  });
  it('offers another chapter when the scope has nothing left to replay', () => {
    expect(chooseNextAction({ dueInScope: 0, hasNextLesson: false, poolSize: 0 }, clean))
      .toEqual({ primary: 'otherChapter', secondary: null, caughtUp: true });
  });
});

describe('savedLineKind', () => {
  it('only claims the account copy once confirmed', () => {
    expect(savedLineKind(true, 2, 'pending')).toBe('pending');
    expect(savedLineKind(true, 2, 'idle')).toBe('pending');
    expect(savedLineKind(true, 2, 'confirmed')).toBe('confirmed');
    expect(savedLineKind(true, 2, 'unconfirmed')).toBe('unconfirmed');
    expect(savedLineKind(true, 0, 'idle')).toBe('none');
  });
  it('tells a guest the errors stay on this phone', () => {
    expect(savedLineKind(false, 3, 'idle')).toBe('guest-local');
    expect(savedLineKind(false, 0, 'idle')).toBe('guest-none');
  });
});

describe('modeRules', () => {
  const t = (fr: string) => fr;
  it('states the real count and promises no timer or grade the mode lacks', () => {
    const quiz = modeRules('quiz', 7, t).join(' ');
    expect(quiz).toContain('7 questions');
    expect(quiz).toContain('Pas de chrono');
    const open = modeRules('practice', 0, t).join(' ');
    expect(open).toContain('Pas de score');
    expect(open).not.toMatch(/\d+ questions/);
  });
});
