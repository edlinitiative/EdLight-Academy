import { normalizeTriviaQuestion } from '../triviaService';

/**
 * The game grades with `idx === q.answer` — strict equality against a number.
 * Every case here is a stored shape that used to reach that comparison raw,
 * where the student picks the correct option and is told they are wrong.
 */
const OPTS = ['Port-au-Prince', 'Cap-Haïtien', 'Jacmel', 'Les Cayes'];
const q = (answer: unknown, options: unknown = OPTS) => ({ q: 'Capitale ?', options, answer });

describe('normalizeTriviaQuestion', () => {
  it('passes a well-formed question through unchanged', () => {
    expect(normalizeTriviaQuestion(q(1))?.answer).toBe(1);
  });

  it('resolves a numeric string, which strict equality would have failed on', () => {
    // 2 === "2" is false, so no option was ever marked correct.
    expect(normalizeTriviaQuestion(q('2'))?.answer).toBe(2);
  });

  it('resolves a letter answer, the shape this database already uses elsewhere', () => {
    expect(normalizeTriviaQuestion(q('A'))?.answer).toBe(0);
    expect(normalizeTriviaQuestion(q('d'))?.answer).toBe(3);
  });

  it('resolves an answer written out as its own text', () => {
    expect(normalizeTriviaQuestion(q('Jacmel'))?.answer).toBe(2);
    expect(normalizeTriviaQuestion(q('  cap-haïtien '))?.answer).toBe(1);
  });

  it('parses options stored as a JSON string', () => {
    const out = normalizeTriviaQuestion(q(0, JSON.stringify(OPTS)));
    expect(out?.options).toEqual(OPTS);
    expect(out?.answer).toBe(0);
  });

  it('DROPS an unresolvable answer instead of defaulting to 0', () => {
    // The whole point: `: 0` is what silently marks the first option correct.
    expect(normalizeTriviaQuestion(q('Miragoâne'))).toBeNull();
    expect(normalizeTriviaQuestion(q(null))).toBeNull();
    expect(normalizeTriviaQuestion(q(undefined))).toBeNull();
    expect(normalizeTriviaQuestion(q({}))).toBeNull();
  });

  it('drops an out-of-range index rather than clamping it', () => {
    expect(normalizeTriviaQuestion(q(4))).toBeNull();
    expect(normalizeTriviaQuestion(q(-1))).toBeNull();
    expect(normalizeTriviaQuestion(q('9'))).toBeNull();
    expect(normalizeTriviaQuestion(q('Z'))).toBeNull();
  });

  it('drops malformed option lists', () => {
    expect(normalizeTriviaQuestion(q(0, 'not json'))).toBeNull();
    expect(normalizeTriviaQuestion(q(0, []))).toBeNull();
    expect(normalizeTriviaQuestion(q(0, ['only one']))).toBeNull();
    expect(normalizeTriviaQuestion(q(0, ['a', '   ']))).toBeNull();
    expect(normalizeTriviaQuestion(null)).toBeNull();
  });

  it('trims options so a stored stray space cannot break text matching', () => {
    const out = normalizeTriviaQuestion(q('Jacmel', ['  Port-au-Prince', 'Cap-Haïtien ', ' Jacmel ', 'Les Cayes']));
    expect(out?.options[0]).toBe('Port-au-Prince');
    expect(out?.answer).toBe(2);
  });
});
