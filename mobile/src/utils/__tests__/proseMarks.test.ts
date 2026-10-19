import { bulletize, proseSegments, stripProseMarks } from '../proseMarks';

describe('proseMarks', () => {
  // The SVT Bac scaffold from the Oct-2026 TestFlight report.
  const scaffold = "* L'inhabilité à distinguer le rouge du vert est appelée **①**.\n* La vitamine qui combat l'anémie pernicieuse s'appelle la **②**.";

  it('turns line-leading "* " into bullets', () => {
    expect(bulletize(scaffold)).toBe("• L'inhabilité à distinguer le rouge du vert est appelée **①**.\n• La vitamine qui combat l'anémie pernicieuse s'appelle la **②**.");
  });

  it('splits **bold** into its own runs with no asterisks left', () => {
    const runs = proseSegments(scaffold);
    expect(runs.filter((r) => r.bold).map((r) => r.text)).toEqual(['①', '②']);
    expect(runs.map((r) => r.text).join('')).not.toContain('*');
  });

  it('strips the marks for the KaTeX path', () => {
    expect(stripProseMarks('* Soit **$x$** tel que $x^2 = 4$')).toBe('• Soit $x$ tel que $x^2 = 4$');
  });

  it('leaves math asterisks alone', () => {
    expect(proseSegments('a*b = 2**3')).toEqual([{ text: 'a*b = 2**3', bold: false }]);
    expect(bulletize('3 * 4 = 12')).toBe('3 * 4 = 12');
  });
});
