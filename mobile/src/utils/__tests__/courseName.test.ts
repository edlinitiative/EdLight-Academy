import { displayCourseName, displayLevel } from '../courseName';

describe('displayCourseName', () => {
  it.each([
    ['Chimie NS1', 'Chimie NS I'],
    ['Économie NS2', 'Économie NS II'],
    ['Mathématiques NS 3', 'Mathématiques NS III'],
    ['Physique NS4', 'Physique NS IV'],
    ['Physique ns4', 'Physique NS IV'],
  ])('%s → %s', (input, out) => expect(displayCourseName(input)).toBe(out));

  it('leaves names without a level, and out-of-range levels, alone', () => {
    expect(displayCourseName('Kreyòl')).toBe('Kreyòl');
    expect(displayCourseName('Chimie NS5')).toBe('Chimie NS5');
    expect(displayCourseName('Chimie NS I')).toBe('Chimie NS I');
    expect(displayCourseName('NS12')).toBe('NS12');
  });

  it('is safe on empty input', () => {
    expect(displayCourseName(undefined)).toBe('');
    expect(displayCourseName(null)).toBe('');
  });
});

describe('displayLevel', () => {
  it.each([
    ['NS1', 'NS I'], ['ns2', 'NS II'], ['NS 3', 'NS III'], ['NS4', 'NS IV'],
    ['NSIII', 'NS III'], ['NS IV', 'NS IV'],
  ])('%s → %s', (input, out) => expect(displayLevel(input)).toBe(out));

  it('passes through anything that is not an NS level', () => {
    expect(displayLevel('9e')).toBe('9e');
    expect(displayLevel('')).toBe('');
  });
});
