import { mathToText } from '../mathText';

describe('mathToText', () => {
  it('returns plain text unchanged (fast path)', () => {
    expect(mathToText('Just a normal sentence.')).toBe('Just a normal sentence.');
  });

  it('renders the reported fraction case as readable text', () => {
    expect(mathToText('tu as mangé $\\frac{1}{4}$ de la pizza')).toBe('tu as mangé 1/4 de la pizza');
  });

  it('parenthesizes multi-character fraction parts', () => {
    expect(mathToText('$\\frac{a+b}{2}$')).toBe('(a+b)/2');
  });

  it('handles \\dfrac and \\tfrac', () => {
    expect(mathToText('$\\dfrac{1}{2}$')).toBe('1/2');
    expect(mathToText('$\\tfrac{3}{4}$')).toBe('3/4');
  });

  it('converts superscripts and subscripts to Unicode', () => {
    expect(mathToText('$x^2$')).toBe('x²');
    expect(mathToText('$a^{10}$')).toBe('a¹⁰');
    expect(mathToText('$H_2O$')).toBe('H₂O');
  });

  it('falls back for non-numeric scripts', () => {
    expect(mathToText('$x^{a+b}$')).toBe('x^(a+b)');
  });

  it('converts sqrt and common symbols', () => {
    expect(mathToText('$\\sqrt{2}$')).toBe('√(2)');
    expect(mathToText('$a \\times b \\leq c$')).toBe('a × b ≤ c');
    expect(mathToText('$\\pi$ and $\\Delta$')).toBe('π and Δ');
  });

  it('unwraps \\( \\) and \\[ \\] delimiters', () => {
    expect(mathToText('\\(x^2\\)')).toBe('x²');
    expect(mathToText('\\[a+b\\]')).toBe('a+b');
  });

  it('does NOT mangle literal currency dollars in prose', () => {
    expect(mathToText('It costs $5 and $10 total')).toBe('It costs $5 and $10 total');
  });

  it('handles a mixed markdown + math line', () => {
    expect(mathToText('Le **numérateur** est $\\frac{1}{4}$.')).toBe('Le **numérateur** est 1/4.');
  });
});
