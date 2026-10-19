import { scaffoldRevealsAnswer } from '../../../../shared/scaffoldReveal';
import { usesScaffold } from '../../components/ScaffoldAnswer';

jest.mock('../../components/MathText', () => 'MathText');

describe('scaffoldRevealsAnswer', () => {
  // Kreyòl, from the catalog: the scaffold text states the answer it asks for.
  const leaky = {
    type: 'short_answer',
    scaffold_ready: true,
    scaffold_text: 'Figi estil ki itilize nan fraz la se metonimi.\n\nFigi estil : {{0}}',
    scaffold_blanks: [{ label: 'Figi estil', answer: 'Metonimi', alternatives: [] }],
  };
  const clean = {
    type: 'fill_blank',
    scaffold_ready: true,
    scaffold_text: "Je vous ai fait parvenir tous les renseignements que j'ai {{0}}.",
    scaffold_blanks: [{ label: 'Accord du participe passé', answer: 'pu', alternatives: [] }],
  };

  it('flags a scaffold that prints its own answer (case/accent-insensitive)', () => {
    expect(scaffoldRevealsAnswer(leaky)).toBe(true);
  });

  it('ignores answers shorter than 3 characters', () => {
    expect(scaffoldRevealsAnswer(clean)).toBe(false);
  });

  it('shows the scaffold in any subject unless it leaks, like the web', () => {
    expect(usesScaffold(clean, 'Français')).toBe(true);
    expect(usesScaffold(leaky, 'Kreyòl')).toBe(false);
  });
});
