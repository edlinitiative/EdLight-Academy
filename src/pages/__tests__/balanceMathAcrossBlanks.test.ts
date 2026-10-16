import { balanceMathAcrossBlanks } from '../../utils/mathBlanks';

describe('balanceMathAcrossBlanks', () => {
  it('closes a formula before a blank that sits inside it', () => {
    const parts = ['le domaine $f(x)=\\frac{1}{x}$ est $Df = ', ' $'];
    expect(balanceMathAcrossBlanks(parts)).toEqual(['le domaine $f(x)=\\frac{1}{x}$ est $Df =$ ', ' ']);
  });

  it('reopens the formula when it continues after the blank', () => {
    expect(balanceMathAcrossBlanks(['$x = ', ' + 1$ donc'])).toEqual(['$x =$ ', '$ + 1$ donc']);
  });

  it('leaves balanced text and display maths alone', () => {
    const parts = ['Soit $$x^2$$ et $y$, alors ', ' vaut 3.'];
    expect(balanceMathAcrossBlanks(parts)).toEqual(parts);
  });

  it('ignores escaped dollar signs', () => {
    const parts = ['Le prix est 5 \\$ et ', ' euros'];
    expect(balanceMathAcrossBlanks(parts)).toEqual(parts);
  });
});
