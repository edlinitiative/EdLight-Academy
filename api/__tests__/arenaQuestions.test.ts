import { validateQuestion } from '../arena/questions';

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('not used by these tests'); },
}));

const good = {
  index: 0,
  prompt: 'Quelle est la capitale d’Haïti ?',
  promptHt: 'Ki kapital Ayiti ?',
  options: ['Port-au-Prince', 'Cap-Haïtien', 'Les Cayes', 'Jacmel'],
  optionsHt: ['Pòtoprens', 'Okap', 'Okay', 'Jakmèl'],
  answerIndex: 0,
};

describe('authoring a tournament question', () => {
  it('accepts a complete bilingual question', () => {
    const r = validateQuestion(good);
    expect(r.ok).toBe(true);
  });

  it('refuses anything but exactly four options', () => {
    // The tier timer is built around reading four options in twelve seconds,
    // and the client lays out four. Three or five is a broken screen.
    expect(validateQuestion({ ...good, options: good.options.slice(0, 3) }))
      .toMatchObject({ ok: false, reason: 'options' });
  });

  it('refuses a blank option hiding among four', () => {
    expect(validateQuestion({ ...good, options: ['a', '', 'c', 'd'] }))
      .toMatchObject({ ok: false, reason: 'options' });
  });

  it('refuses a correct index pointing at no option', () => {
    // An out-of-range key marks every student wrong, on a stream, for money.
    expect(validateQuestion({ ...good, answerIndex: 4 }))
      .toMatchObject({ ok: false, reason: 'answerIndex' });
    expect(validateQuestion({ ...good, answerIndex: -1 }))
      .toMatchObject({ ok: false, reason: 'answerIndex' });
  });

  it('refuses a HALF-translated option set', () => {
    // Worse than no translation: a student reading in Kreyòl would get some
    // options in French and could not tell whether that was the question or a
    // bug. All four or none.
    expect(validateQuestion({ ...good, optionsHt: ['Pòtoprens', '', 'Okay', 'Jakmèl'] }))
      .toMatchObject({ ok: false, reason: 'optionsHt' });
  });

  it('allows no Kreyòl at all', () => {
    expect(validateQuestion({ ...good, optionsHt: [] })).toMatchObject({ ok: true });
  });

  it('refuses a prompt too short to be a question', () => {
    expect(validateQuestion({ ...good, prompt: 'Quoi' })).toMatchObject({ ok: false, reason: 'prompt' });
  });

  it('truncates rather than rejects an over-long prompt', () => {
    // The authoring UI warns about length; the endpoint bounds it. Rejecting a
    // long prompt outright would lose an author's work at save time.
    const r = validateQuestion({ ...good, prompt: 'x'.repeat(500) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.prompt.length).toBeLessThanOrEqual(240);
  });
});
