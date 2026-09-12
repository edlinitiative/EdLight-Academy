/**
 * The teaser is the only place in the product where a question is shown to
 * somebody who is NOT in the app, so the rules about what may appear there are
 * different from everywhere else — and untested they would drift silently.
 */
import {
  pickTeaser,
  isTeasable,
  teaserCopy,
  hashKey,
  dayNumber,
  MAX_TEASER_CHARS,
  TEASER_CATEGORIES,
} from '../_lib/teaserQuestion';

const CATEGORIES = TEASER_CATEGORIES.map((id) => ({ id, name: id, nameHt: id, icon: '❓' }));

const bank = (id: string, qs: Array<{ q: string; qHt: string }>) => ({ [id]: qs });

describe('choosing the question that goes in the notification', () => {
  it('NEVER returns the answer or the options', () => {
    const teaser = pickTeaser('2026-09-12');
    expect(teaser).not.toBeNull();
    // Structural, not cosmetic: if somebody adds `options` to Teaser later to
    // "make the email richer", this fails and they have to think about it.
    expect(Object.keys(teaser!)).toEqual(
      expect.not.arrayContaining(['answer', 'options']),
    );
    expect(JSON.stringify(teaser)).not.toMatch(/"answer"|"options"/);
  });

  it('gives everyone the same question on the same day', () => {
    expect(pickTeaser('2026-09-12')).toEqual(pickTeaser('2026-09-12'));
  });

  it('gives a different question on consecutive days', () => {
    // Consecutive date strings differ by one character, which a naive hash
    // maps to adjacent indices — often the same question two days running.
    const week = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']
      .map((d) => pickTeaser(d)!.question);
    expect(new Set(week).size).toBe(week.length);
  });

  it('cycles the categories evenly instead of clumping', () => {
    // The first draft chose the category by hashing the date, and uniform
    // randomness clumps: Haitian symbols came up on four of fourteen days
    // while sport never did. Over two full rotations every category must
    // appear exactly twice.
    const start = dayNumber('2026-10-01');
    const days = Array.from({ length: TEASER_CATEGORIES.length * 2 }, (_, i) => {
      const d = new Date((start + i) * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    const counts = new Map<string, number>();
    for (const d of days) {
      const id = pickTeaser(d)!.categoryId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(TEASER_CATEGORIES.length);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it('only ever picks a question short enough to survive a lock screen', () => {
    const days = Array.from({ length: 60 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`);
    for (const d of days) {
      const t = pickTeaser(d)!;
      expect(t.question.length).toBeLessThanOrEqual(MAX_TEASER_CHARS);
      expect(t.questionHt.length).toBeLessThanOrEqual(MAX_TEASER_CHARS);
    }
  });

  it('always has both languages, because half the users read Kreyòl', () => {
    for (let i = 0; i < 40; i += 1) {
      const t = pickTeaser(`2026-11-${i}`)!;
      expect(t.question.length).toBeGreaterThan(0);
      expect(t.questionHt.length).toBeGreaterThan(0);
    }
  });
});

describe('which questions are allowed to be teasers', () => {
  it('rejects a question that needs its options to make sense', () => {
    expect(isTeasable({ q: 'Lequel de ces pays borde Haïti ?', qHt: 'Ki peyi ki kole ak Ayiti ?' })).toBe(false);
    expect(isTeasable({ q: 'Parmi ces héros, lequel est mort en 1806 ?', qHt: 'Nan ewo sa yo, kiyès ki mouri an 1806 ?' })).toBe(false);
  });

  it('rejects a question that refers to a previous one', () => {
    expect(isTeasable({ q: 'Quel athlète remporta cette médaille ?', qHt: 'Ki atlèt ki genyen meday sa a ?' })).toBe(false);
  });

  it('rejects a flag question, which has no flag to look at on a lock screen', () => {
    expect(isTeasable({ q: 'De quel pays est ce drapeau ?', qHt: 'Ki peyi ki gen drapo sa a ?' })).toBe(false);
  });

  it('rejects anything missing a Kreyòl translation', () => {
    expect(isTeasable({ q: 'Quelle est la capitale du Canada ?', qHt: '' })).toBe(false);
  });

  it('accepts a short question that stands on its own', () => {
    expect(isTeasable({ q: 'Quelle est la capitale du Canada ?', qHt: 'Ki kapital Kanada ?' })).toBe(true);
  });
});

describe('when a category cannot supply one', () => {
  it('moves to the next category rather than losing the day', () => {
    const banks = {
      ...bank('capitals', []),
      ...bank('histoire_haiti', [{ q: 'Qui a fondé Haïti ?', qHt: 'Kiyès ki fonde Ayiti ?' }]),
    };
    const t = pickTeaser('2026-09-12', banks, CATEGORIES);
    expect(t).not.toBeNull();
    expect(t!.categoryId).toBe('histoire_haiti');
  });

  it('returns null when nothing at all is usable, so the caller can fall back', () => {
    expect(pickTeaser('2026-09-12', { capitals: [{ q: 'Lequel ?', qHt: 'Kiyès ?' }] }, CATEGORIES)).toBeNull();
  });
});

describe('the notification copy', () => {
  it('puts the question in the title, which is the line that survives truncation', () => {
    const t = pickTeaser('2026-09-12')!;
    expect(teaserCopy(t, 'fr').title).toContain(t.question);
    expect(teaserCopy(t, 'ht').title).toContain(t.questionHt);
  });

  it('never states the answer in the body', () => {
    const t = pickTeaser('2026-09-12')!;
    const { message } = teaserCopy(t, 'fr', 'Ted');
    expect(message).toContain('Ted');
    expect(message).toMatch(/réponds/);
  });

  it('writes Kreyòl copy for a Kreyòl reader, not French with a Kreyòl question', () => {
    const t = pickTeaser('2026-09-12')!;
    expect(teaserCopy(t, 'ht', 'Ted').message).not.toMatch(/tu connais/i);
  });
});

describe('the hash', () => {
  it('does not map neighbouring dates to neighbouring numbers', () => {
    expect(Math.abs(hashKey('2026-09-12') - hashKey('2026-09-13'))).toBeGreaterThan(1000);
  });
});
