/**
 * One language per message.
 *
 * ── The bug ─────────────────────────────────────────────────────────────────
 * Both re-engagement bodies carried French AND Kreyòl on a single line:
 *
 *   "2 minutes de quiz pour relancer ta série. · 2 minit quiz pou reprann seri ou."
 *
 * On a phone's notification shade that is one long run of two languages, and
 * the half a student can read is the half they have to find. The cause was
 * that `reengagementCopy` took no language argument — while its caller had
 * resolved the student's own `lang` on the line above the call and simply
 * never passed it.
 */
import { reengagementCopy } from '../../../api/_lib/reengagementCopy';

/** Words that only exist in one of the two languages. */
const FRENCH_ONLY = /\b(minutes|défi|série|classement|semaine|élèves|attendent|aujourd)\b/i;
const KREYOL_ONLY = /\b(minit|defi|seri|klasman|semèn|elèv|jodi|tann)\b/i;

describe('re-engagement copy', () => {
  const actions = ['push-soft', 'push-hard'] as const;

  it.each(actions)('%s in French contains no Kreyòl', (action) => {
    const { title, body } = reengagementCopy(action, 'NS4', 'fr', 40);
    expect([action, KREYOL_ONLY.test(`${title} ${body}`)]).toEqual([action, false]);
    expect(FRENCH_ONLY.test(`${title} ${body}`)).toBe(true);
  });

  it.each(actions)('%s in Kreyòl contains no French', (action) => {
    const { title, body } = reengagementCopy(action, 'NS4', 'ht', 40);
    expect([action, FRENCH_ONLY.test(`${title} ${body}`)]).toEqual([action, false]);
    expect(KREYOL_ONLY.test(`${title} ${body}`)).toBe(true);
  });

  it('never joins two languages with a middle dot again', () => {
    for (const action of actions) {
      for (const lang of ['fr', 'ht'] as const) {
        expect([action, lang, reengagementCopy(action, null, lang, 40).body]).not.toContain(' · ');
      }
    }
  });

  it('defaults to French, as the sender does', () => {
    expect(KREYOL_ONLY.test(reengagementCopy('push-soft', null).body)).toBe(false);
  });

  describe('social proof', () => {
    it('is stated only when it is true and worth saying', () => {
      // A real count, or nothing. Never a guess and never rounded up.
      expect(reengagementCopy('push-soft', null, 'fr', 40).body).toContain('40');
      // The proof PHRASE, not any digit: the base copy legitimately says
      // "2 minutes de quiz", which a bare /\d/ would catch.
      const proofPhrase = /\d+\s+(élèves|elèv)/;
      for (const weak of [null, undefined, 0, 4]) {
        const body = reengagementCopy('push-soft', null, 'fr', weak as number | null).body;
        expect([weak, proofPhrase.test(body)]).toEqual([weak, false]);
      }
    });

    it('is in the reader’s language too', () => {
      expect(reengagementCopy('push-soft', null, 'ht', 40).body).toMatch(/elèv/);
      expect(reengagementCopy('push-soft', null, 'fr', 40).body).toMatch(/élèves/);
    });
  });
});
