import { needsKatex } from '../mathRouting';
import { mathToText } from '../mathText';

/**
 * KaTeX's auto-render only typesets DELIMITED segments ($…$, \(…\), \[…\]).
 * Exam content frequently ships UNDELIMITED LaTeX ("36\sqrt{\frac{2}{7}}"),
 * which used to reach the KaTeX WebView, match nothing, and render as raw
 * source to the student — the "it doesn't display properly" TestFlight reports.
 * Undelimited math must take the mathToText path instead.
 */
describe('needsKatex', () => {
  it('routes delimited math to KaTeX', () => {
    expect(needsKatex('tu as mangé $\\frac{1}{4}$ de la pizza')).toBe(true);
    expect(needsKatex('\\(x^2\\)')).toBe(true);
    expect(needsKatex('\\[a+b\\]')).toBe(true);
  });

  it('does NOT route undelimited LaTeX to KaTeX', () => {
    expect(needsKatex('36\\sqrt{\\frac{2}{7}}')).toBe(false);
    expect(needsKatex('\\alpha^2 = 3')).toBe(false);
    expect(needsKatex('5 \\times 3 \\times \\frac{5!}{2!2!}')).toBe(false);
    expect(needsKatex('36√{\\frac{2}{7}}')).toBe(false);
  });

  it('does NOT route plain prose to KaTeX', () => {
    expect(needsKatex('Les atomes de carbone sont unis par une liaison.')).toBe(false);
    expect(needsKatex('')).toBe(false);
  });

  it('leaves the undelimited cases readable once converted', () => {
    // What the student ends up seeing on the non-KaTeX path.
    expect(mathToText('36\\sqrt{\\frac{2}{7}}')).toBe('36√(2/7)');
    expect(mathToText('\\alpha^2 = 3')).toBe('α² = 3');
    expect(mathToText('5 \\times 3 \\times \\frac{5!}{2!2!}')).toBe('5 × 3 × (5!)/(2!2!)');
  });
});
