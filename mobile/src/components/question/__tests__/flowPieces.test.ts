import { flowPieces } from '../QuestionView';

jest.mock('../../MathText', () => 'MathText');
jest.mock('../../ExamFigure', () => 'ExamFigure');
jest.mock('../../ExamAnswerInput', () => ({ MathChips: 'MathChips', MathPreview: 'MathPreview' }));

describe('flowPieces', () => {
  it('splits a run into words so blanks sit mid-sentence', () => {
    const p = flowPieces("Les atomes de carbone de l'éthane sont unis par une ");
    expect(p.map((x) => ('text' in x ? x.text : '\n')).join('')).toBe("Les atomes de carbone de l'éthane sont unis par une ");
    expect(p.length).toBe(10);
  });

  it('keeps inline math as one unbreakable token without dollars', () => {
    const p = flowPieces('soit $x^2 = 4$ donc ');
    const math = p.filter((x) => x.kind === 'math');
    expect(math).toHaveLength(1);
    expect('text' in math[0] && math[0].text).not.toContain('$');
  });

  it('turns newlines into breaks and bullets into •', () => {
    const p = flowPieces('* un\n* **deux**');
    expect(p.some((x) => x.kind === 'break')).toBe(true);
    const text = p.map((x) => ('text' in x ? x.text : '')).join('');
    expect(text).toBe('• un• deux');
  });
});
