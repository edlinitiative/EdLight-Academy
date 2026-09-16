import { splitValues, countBlanks, numberBlanks } from '../FillBlankAnswer';

/**
 * The value contract between the multi-blank input and the shared grader.
 * Values travel pipe-joined, one entry per blank, matched BY POSITION — so an
 * empty blank must still hold its slot, while an entirely empty question must
 * not look answered.
 */
describe('countBlanks', () => {
  it('counts the authored blank markers', () => {
    expect(countBlanks('une ____ liaison et une ____ liaison')).toBe(2);
    expect(countBlanks('un seul ______ ici')).toBe(1);
    expect(countBlanks('aucun blanc')).toBe(0);
    // Dot runs are the other authored form.
    expect(countBlanks('apply ........ the job ........ yesterday')).toBe(2);
  });
});

describe('splitValues', () => {
  it('keeps positions when an earlier blank is empty', () => {
    expect(splitValues('|deuxième', 2)).toEqual(['', 'deuxième']);
  });

  it('pads missing entries so every blank has a slot', () => {
    expect(splitValues('a', 3)).toEqual(['a', '', '']);
    expect(splitValues('', 2)).toEqual(['', '']);
  });
});

describe('numberBlanks', () => {
  it('replaces each blank with its own circled marker', () => {
    const out = numberBlanks('une ____ liaison et une ____ liaison');
    expect(out).toContain('①');
    expect(out).toContain('②');
    expect(out).not.toContain('____');
  });
});
