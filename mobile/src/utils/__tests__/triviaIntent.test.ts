import { CHALLENGE_ROUND, intentPlan, parseTriviaIntent, pickerCopy, resultPrimary, roundSizeFor } from '../triviaIntent';

const fr = (f: string) => f;
const ht = (_f: string, h: string) => h;

describe('trivia intent plumbing (M1)', () => {
  it('parses route params; anything unknown is practice', () => {
    expect(parseTriviaIntent('challenge')).toBe('challenge');
    expect(parseTriviaIntent('practice')).toBe('practice');
    expect(parseTriviaIntent(undefined)).toBe('practice');
    expect(parseTriviaIntent('duel')).toBe('practice');
  });

  it('a challenge only offers duel-able rounds (no mixed draw, no daily) at a fixed size', () => {
    expect(intentPlan('challenge')).toEqual({ allowMixed: false, showDaily: false, fixedRound: CHALLENGE_ROUND });
    expect(intentPlan('practice')).toEqual({ allowMixed: true, showDaily: true, fixedRound: null });
  });

  it('a challenge skips the round picker; practice keeps it', () => {
    expect(roundSizeFor('challenge', 40)).toBe(CHALLENGE_ROUND);
    expect(roundSizeFor('challenge', 3)).toBe(3);
    expect(roundSizeFor('practice', 40)).toBeNull();
  });

  it('explains the asynchronous format once, in both languages', () => {
    expect(pickerCopy('practice', fr).explainer).toBeNull();
    const c = pickerCopy('challenge', fr);
    expect(c.title).toBe('Défier un ami');
    expect(c.explainer).toMatch(/mêmes questions quand il veut/);
    expect(pickerCopy('challenge', ht).explainer).toMatch(/lè li vle/);
  });

  it('the result leads with sending the duel only for a challenge that can become one', () => {
    expect(resultPrimary('challenge', true)).toBe('challenge');
    expect(resultPrimary('challenge', false)).toBe('share');
    expect(resultPrimary('practice', true)).toBe('share');
  });
});
