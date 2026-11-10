import { mathToRuns, mathToText, isPriceText } from '../mathText';
import { katexSource, isBareFormula } from '../mathRouting';
import { flowPieces } from '../flowPieces';
import { splitTables, describedTable } from '../tables';
import { markScaffoldText, recordToLines } from '../scaffoldText';

/**
 * TestFlight, Nov 2026 ("u still never fixed those issues"): Mathématiques
 * 2025 Q1 showed "… numérique $f$ de variable réelle $x$ … (1-ln\ x) est $Df =$".
 * Every case below comes from the exam catalog; scripts/audit_exam_display.ts
 * runs the same code over all 530 exams.
 */
describe('the reported question', () => {
  const src = 'Le domaine de définition de la fonction numérique $f$ de variable réelle $x$ telle que $f(x) = \\frac{x+3}{1-ln\\ x}$ est $Df =';
  it('reads as prose with its maths, no dollar, no backslash', () => {
    expect(mathToText(src)).toBe('Le domaine de définition de la fonction numérique f de variable réelle x telle que f(x) = (x+3)/(1-ln x) est Df =');
  });
  it('flows around its blank without a raw token', () => {
    const shown = flowPieces('telle que $f(x) = \\frac{x+3}{1-ln\\ x}$ est $Df =$ ').map((p) => (p.kind === 'break' ? '\n' : p.text)).join('');
    expect(shown).not.toMatch(/[$\\{}]/);
  });
});

describe('mathToText / mathToRuns', () => {
  it('keeps prices but drops a dollar orphaned by a blank', () => {
    expect(mathToText('It costs $5 and $10 total')).toBe('It costs $5 and $10 total');
    expect(mathToText('Prix = 26$')).toBe('Prix = 26$');
    expect(mathToText('est $Df =')).toBe('est Df =');
    expect(isPriceText('26$ et 182$ - 96$')).toBe(true);
    expect(isPriceText('50 $cm^3$ d’éthanol')).toBe(false);
  });
  it('converts bare markup: chemistry, ASCII exponents, multiplication', () => {
    expect(mathToText('Fe^{2+}(aq) + Zn(s) -> Fe(s)')).toBe('Fe²⁺(aq) + Zn(s) → Fe(s)');
    expect(mathToText('C_nH_{2n+2}')).toBe('CₙH₂ₙ₊₂');
    expect(mathToText('1/2*m*v^2')).toBe('1/2·m·v²');
    expect(mathToText('E = 10^-6 J')).toBe('E = 10⁻⁶ J');
    expect(mathToText('M^{-1}')).toBe('M⁻¹');
  });
  it('draws an index Unicode has no character for', () => {
    expect(mathToRuns('x_G + Y_d')).toEqual([
      { text: 'x' }, { text: 'G', script: 'sub' }, { text: ' + Y' }, { text: 'd', script: 'sub' },
    ]);
    expect(mathToRuns('I_{vie}')).toEqual([{ text: 'I' }, { text: 'vie', script: 'sub' }]);
  });
  it('writes French ordinals as French typography does', () => {
    expect(mathToText('le 50^{ème} terme')).toBe('le 50ᵉ terme');
  });
  it('repairs the JSON-escape damage in 1 008 catalog formulas', () => {
    expect(mathToText('$\\lim \nrac{2x}{3}$')).toBe('lim (2x)/3');
    expect(mathToText('$x \neq 0$')).toBe('x ≠ 0');
  });
  it('keeps a set’s braces and reads ℝ∖{0}', () => {
    expect(mathToText('F ∩ G = {0}')).toBe('F ∩ G = {0}');
    expect(mathToText('Domain: R\\{0}')).toBe('Domain: ℝ ∖ {0}');
  });
});

describe('katexSource', () => {
  it('delimits a bare formula and leaves prose to the plain path', () => {
    expect(isBareFormula('36\\sqrt{\\frac{2}{7}}')).toBe(true);
    expect(katexSource('36\\sqrt{\\frac{2}{7}}')).toBe('$36\\sqrt{\\frac{2}{7}}$');
    expect(katexSource('Les atomes sont unis par une liaison.')).toBeNull();
    expect(katexSource('It costs $5 and $10 total')).toBeNull();
  });
  it('sets accented words in a formula as text', () => {
    expect(katexSource('le $50^{ème}$ terme')).toBe('le $50^{\\text{ème}}$ terme');
  });
  it('repairs what KaTeX would reject', () => {
    expect(katexSource('$CO_3^{2-}_{(aq)}$')).toBe('$CO_3^{2-}{}_{(aq)}$');
    expect(katexSource('$I_eff = 2$')).toBe('$I_{eff} = 2$');
    expect(katexSource('$\\mu = 4\\pi \\text{ T\\cdot m/A}$')).toBe('$\\mu = 4\\pi \\mathrm{ T\\cdot m/A}$');
  });
  it('closes a formula whose closing $ was lost, and turns \\ldots blanks into dots', () => {
    expect(katexSource('Le domaine est donc $]0, e[ ∪ ]e, +∞[.')).toBe('Le domaine est donc $]0, e[ ∪ ]e, +∞[$.');
    expect(katexSource('Soit $(U_n)$ égal à \\ldots \\ldots \\ldots')).toBe('Soit $(U_n)$ égal à ……');
  });
});

describe('tables and step-by-step text', () => {
  it('draws a pipe table, with or without outer pipes', () => {
    const blocks = splitTables('Classez :\n\nZeus | Poseidon\n-----|-----\n| ① | ② |\n\nFin');
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'text']);
  });
  it('rebuilds a table described in words', () => {
    expect(describedTable('Première ligne $x_i$ avec valeurs -5, 0, 5. Deuxième ligne $p(x_i)$ avec valeurs a, 0,3, b'))
      .toEqual([['$x_i$', '-5', '0', '5'], ['$p(x_i)$', 'a', '0,3', 'b']]);
  });
  it('keeps a scaffold formula whole around its blank', () => {
    expect(markScaffoldText('$\\frac{ {{1}} }{4}$')).toBe('$\\frac{ \\text{②} }{4}$');
  });
  it('lists a scaffold authored as a record', () => {
    expect(recordToLines('{ "Architecture": "{{0}}", "Sculpture": "{{1}}" }')).toBe('Architecture : {{0}}\nSculpture : {{1}}');
  });
});
