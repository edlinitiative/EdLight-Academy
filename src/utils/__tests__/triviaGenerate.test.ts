/**
 * The only thing between a generated question and a student.
 *
 * The nightly generator publishes without review — a deliberate choice — so
 * `rejectionReason` is the whole gate. Every case below is a way a model can
 * produce something that looks like a question and is not one.
 */
import { GENERATABLE, normalise, rejectionReason } from '../../../api/_lib/triviaGenerate';

const good = () => ({
  q: 'Combien font 6 × 7 ?',
  qHt: 'Konbyen 6 × 7 fè ?',
  options: ['42', '36', '48', '49'],
  answer: 0,
});
const none = new Set<string>();

describe('rejectionReason', () => {
  it('accepts a well-formed question', () => {
    expect(rejectionReason(good(), none)).toBeNull();
  });

  it.each([
    ['not an object', null],
    ['not an object', 'a string'],
    ['no question text', { ...good(), q: '   ' }],
    ['no Kreyòl translation', { ...good(), qHt: '' }],
    ['not exactly four options', { ...good(), options: ['1', '2', '3'] }],
    ['not exactly four options', { ...good(), options: ['1', '2', '3', '4', '5'] }],
    ['an empty option', { ...good(), options: ['42', '', '48', '49'] }],
    ['two identical options', { ...good(), options: ['42', '42', '48', '49'] }],
    ['answer index is not 0-3', { ...good(), answer: 4 }],
    ['answer index is not 0-3', { ...good(), answer: -1 }],
    ['answer index is not 0-3', { ...good(), answer: 1.5 }],
  ])('refuses: %s', (why, draft) => {
    expect(rejectionReason(draft, none)).toBe(why);
  });

  it('refuses a question that never got translated', () => {
    // A model that echoes the French into qHt has produced a monolingual
    // question for a bilingual product, and it would pass every other check.
    const d = good();
    expect(rejectionReason({ ...d, qHt: d.q }, none)).toBe('the two languages are identical');
  });

  it('refuses one the category already has, whatever the spacing or case', () => {
    const existing = new Set([normalise('  COMBIEN font 6 × 7 ?  ')]);
    expect(rejectionReason(good(), existing)).toBe('already in this category');
  });

  it('refuses text too long for the card on a phone', () => {
    expect(rejectionReason({ ...good(), q: 'x'.repeat(200) }, none)).toBe('question too long for the card');
    expect(rejectionReason({ ...good(), options: ['y'.repeat(80), 'b', 'c', 'd'] }, none))
      .toBe('an option too long for the card');
  });
});

describe('what may be generated at all', () => {
  it('never includes a bank where a fabrication would read as fact', () => {
    // A wrong multiplication does not survive a calculator. A wrong
    // independence date reads exactly like the real one, so those banks stay
    // hand-written and the generator must not be pointed at them.
    for (const banned of [
      'histoire_haiti', 'geo_haiti', 'culture_haiti', 'personnalites_haiti',
      'proverbes_haiti', 'symboles_haiti', 'sport_haiti', 'sciences',
    ]) {
      expect([banned, (GENERATABLE as readonly string[]).includes(banned)]).toEqual([banned, false]);
    }
  });

  it('covers the four thin banks, which are the ones that need growing', () => {
    expect([...GENERATABLE].sort()).toEqual(
      ['anglais_vocab', 'bio_corps', 'chimie_symboles', 'maths_eclair'],
    );
  });
});
