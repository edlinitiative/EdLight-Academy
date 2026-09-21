/**
 * The name a student is shown by in public.
 *
 * This became load-bearing the moment the Arena lobby started asking students
 * to CONFIRM their board name: the screen and the server must derive it
 * identically, or the app shows one name and the broadcast carries another.
 * There were four server copies and a fifth, DIFFERENT rule on mobile that
 * returned the first name alone.
 */
import { defaultAlias, isValidAlias, isAcceptableAliasInput, isPlaceholderName } from '../../../shared/alias';

describe('defaultAlias', () => {
  /*
   * Ted's call, 2026-09-21: the audience sees the FIRST NAME ALONE. It used to
   * append a last initial; on a broadcast watched by schools, a surname
   * initial is the start of identifying a specific child.
   */
  it('is the first name, alone', () => {
    expect(defaultAlias('Ted Olivier Jacquet')).toBe('Ted');
    expect(defaultAlias('Marie Claire')).toBe('Marie');
  });

  it('leaves a single name alone', () => {
    expect(defaultAlias('Mika')).toBe('Mika');
  });

  it('never carries a surname or an initial of one', () => {
    expect(defaultAlias('Sandra Pierre-Louis')).toBe('Sandra');
  });

  it('refuses the placeholder the auth layer substitutes', () => {
    expect(defaultAlias('Élève')).toBeNull();
  });

  it('is null when there is nothing usable — null is a real answer', () => {
    // The standings render an empty name and the leaderboard prompts for one.
    // A name we made up is worse on a broadcast than no name.
    expect(defaultAlias('')).toBeNull();
    expect(defaultAlias(undefined)).toBeNull();
    expect(defaultAlias('   ')).toBeNull();
    expect(defaultAlias('123')).toBeNull();
  });

  it('keeps accents, which most Haitian names carry', () => {
    expect(defaultAlias('Andrée Pierre-Louis')).toBe('Andrée');
  });

  it('never leaks a full surname', () => {
    expect(defaultAlias('Ted Jacquet')).not.toContain('Jacquet');
  });
});

describe('isValidAlias', () => {
  /* Deliberately the server's existing loose rule, moved not rewritten —
     tightening it would drop names that are on boards today. */
  it('accepts anything containing a letter', () => {
    expect(isValidAlias('T')).toBe(true);
    expect(isValidAlias('Ké')).toBe(true);
  });

  it('rejects what has no letter at all', () => {
    expect(isValidAlias('123')).toBe(false);
    expect(isValidAlias('')).toBe(false);
    expect(isValidAlias(null)).toBe(false);
  });
});

describe('isAcceptableAliasInput', () => {
  it('is stricter than the stored rule, because a student just typed it', () => {
    expect(isAcceptableAliasInput('T')).toBe(false);
    expect(isAcceptableAliasInput('Ted J.')).toBe(true);
  });

  it('refuses a board row that would not be one line', () => {
    expect(isAcceptableAliasInput('Ted\nJacquet')).toBe(false);
  });

  it('refuses something longer than a board row holds', () => {
    expect(isAcceptableAliasInput('x'.repeat(25))).toBe(false);
    expect(isAcceptableAliasInput('x'.repeat(24))).toBe(true);
  });
});

describe('isPlaceholderName', () => {
  it('knows the words the auth layer substitutes for a missing name', () => {
    expect(isPlaceholderName('Élève')).toBe(true);
    expect(isPlaceholderName('Elèv')).toBe(true);
    expect(isPlaceholderName('Ted')).toBe(false);
  });
});
