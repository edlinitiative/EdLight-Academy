/**
 * The reminder e-mail, checked for the things that are invisible until a real
 * inbox renders it.
 */
import { buildReminderEmailHtml } from '../../../api/_lib/reminderEmail';

const FRENCH_ONLY = /\b(minutes|leçons|élèves|Bonjour|prochaine|questions)\b/;
const KREYOL_ONLY = /\b(minit|leson|elèv|Bonjou|Pwochen|kesyon)\b/;

const build = (lang: 'fr' | 'ht', peers?: number) =>
  buildReminderEmailHtml({
    title: 'Fractions', message: 'Test', url: '/quiz', lang,
    personalization: { firstName: 'Marie', masteredCount: 12, streakDays: 4, peersToday: peers ?? null },
  });

describe('the reminder e-mail', () => {
  it('carries a preheader, so the inbox does not scrape the greeting', () => {
    // Without one, Gmail printed "Bonjour, Marie 👋" twice — once as the
    // preview of an email whose first words were the same greeting.
    const html = build('fr');
    expect(html).toMatch(/display:none[^"]*max-height:0/);
    expect(html).toContain("ta session de 5 minutes t'attend");
  });

  it('declares a dark palette rather than letting the client invent one', () => {
    expect(build('fr')).toContain('prefers-color-scheme: dark');
  });

  it.each(['fr', 'ht'] as const)('%s speaks one language throughout', (lang) => {
    // Strip the URLs — academy.edlight.org/revision is not French prose.
    const text = build(lang, 40).replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ');
    const [banned, expected] = lang === 'fr' ? [KREYOL_ONLY, FRENCH_ONLY] : [FRENCH_ONLY, KREYOL_ONLY];
    expect([lang, banned.test(text)]).toEqual([lang, false]);
    expect(expected.test(text)).toBe(true);
  });

  it('states the peer count only when there is one', () => {
    expect(build('fr', 37)).toContain('37');
    for (const none of [0, null, undefined]) {
      expect([none, /\d+ élèves/.test(build('fr', none as number))]).toEqual([none, false]);
    }
  });
});
