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

  it('resolves NESTED constructs innermost-first (the exam-options bug)', () => {
    // The TestFlight "formatting issues" screenshot: raw \frac inside \sqrt.
    expect(mathToText('$\\sqrt{\\frac{2}{7}}$')).toBe('√(2/7)');
    expect(mathToText('$36\\sqrt{\\frac{2}{7}} - 50\\sqrt{\\frac{2}{7}}$')).toBe('36√(2/7) - 50√(2/7)');
    expect(mathToText('$\\frac{18\\sqrt{2}}{7}$')).toBe('(18√(2))/7');
  });

  it('normalizes the pre-mixed Unicode form "√{…}" from the quiz bank', () => {
    expect(mathToText('36√{\\frac{2}{7}}')).toBe('36√(2/7)');
    expect(mathToText('17√{\\frac{2}{49}}')).toBe('17√(2/49)');
  });

  it('renders blackboard-bold sets instead of spelling out "mathbbR"', () => {
    // TestFlight 2026-09-17: "Soit a ∈ mathbbR" — \mathbb fell through to the
    // bare-command rule exactly as \begin did.
    expect(mathToText('Soit $a \\in \\mathbb{R}$')).toBe('Soit a ∈ ℝ');
    expect(mathToText('$\\mathbb{N}$, $\\mathbb{Z}$, $\\mathbb{Q}$, $\\mathbb{C}$')).toBe('ℕ, ℤ, ℚ, ℂ');
  });

  it('unwraps the other math-font commands rather than naming them', () => {
    expect(mathToText('$\\mathcal{F}$ et $\\mathfrak{g}$')).toBe('F et g');
  });

  it('renders a matrix environment instead of spelling out "beginpmatrix"', () => {
    // TestFlight shot 04: the Mathématiques 2025 determinant question showed
    // "beginpmatrix 3 & -2 & a \\ 1 & 3 & -2 \\ 2 & -1 & a endpmatrix" because
    // \begin/\end fell through to the bare-command rule and \\ was left alone.
    expect(mathToText('M = \\begin{pmatrix} 3 & -2 & a \\\\ 1 & 3 & -2 \\\\ 2 & -1 & a \\end{pmatrix}'))
      .toBe('M = [3, -2, a; 1, 3, -2; 2, -1, a]');
  });

  it('handles the other matrix environments and a single row', () => {
    expect(mathToText('\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}')).toBe('[1, 0; 0, 1]');
    expect(mathToText('\\begin{vmatrix} a & b \\end{vmatrix}')).toBe('[a, b]');
  });

  it('drops an unknown environment wrapper rather than spelling its name', () => {
    expect(mathToText('\\begin{aligned} x = 1 \\end{aligned}')).toBe('x = 1');
  });
});
