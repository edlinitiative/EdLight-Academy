/**
 * The consent path contract, and the email that carries the form.
 *
 * `parseConsentPath` is the half of the upload's security that Storage rules
 * cannot express. The rules stop a student WRITING outside their own folder;
 * nothing in Storage stops them POINTING their claim at somebody else's object
 * and having an admin open it believing it is theirs. This function is that
 * stop, so every way of getting it wrong is tested rather than assumed.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
  getConsentBucket: () => { throw new Error('no storage in unit tests'); },
}));

import {
  parseConsentPath,
  consentPath,
  CONSENT_TYPES,
  CONSENT_MAX_BYTES,
  CONSENT_PREFIX,
} from '../arena/claim';
import { buildConsentEmailHtml } from '../_lib/arenaConsentEmail';

const TID = 'sept-2026';
const UID = 'student-abc';
const NOW = 1_800_000_000_000;

describe('consentPath', () => {
  it('builds a path a parent can only reach under their own child’s uid', () => {
    expect(consentPath(TID, UID, 'application/pdf', NOW))
      .toBe(`${CONSENT_PREFIX}/${TID}/${UID}/consent-${NOW}.pdf`);
  });

  it('refuses a type a browser cannot honestly produce here', () => {
    expect(consentPath(TID, UID, 'application/zip', NOW)).toBeNull();
    expect(consentPath(TID, UID, 'text/html', NOW)).toBeNull();
  });

  it('round-trips every accepted type', () => {
    for (const type of Object.keys(CONSENT_TYPES)) {
      const path = consentPath(TID, UID, type, NOW);
      expect(path).not.toBeNull();
      expect(parseConsentPath(path, TID, UID)).toEqual({ ok: true, ext: CONSENT_TYPES[type] });
    }
  });
});

describe('parseConsentPath', () => {
  const good = `${CONSENT_PREFIX}/${TID}/${UID}/consent-${NOW}.pdf`;

  it('accepts the path this student just wrote', () => {
    expect(parseConsentPath(good, TID, UID)).toEqual({ ok: true, ext: 'pdf' });
  });

  /*
   * The one that matters. Storage rules let `other-student` write under their
   * own uid; only this check stops them from telling OUR claim to point there.
   */
  it('refuses a path under somebody else’s uid', () => {
    const theirs = `${CONSENT_PREFIX}/${TID}/other-student/consent-${NOW}.pdf`;
    expect(parseConsentPath(theirs, TID, UID)).toEqual({ ok: false, error: 'wrong_owner' });
  });

  it('refuses a path from a different tournament', () => {
    const other = `${CONSENT_PREFIX}/aout-2026/${UID}/consent-${NOW}.pdf`;
    expect(parseConsentPath(other, TID, UID)).toEqual({ ok: false, error: 'wrong_prefix' });
  });

  it('refuses anything outside the consent prefix', () => {
    expect(parseConsentPath(`exports/${TID}/${UID}/consent-${NOW}.pdf`, TID, UID))
      .toEqual({ ok: false, error: 'wrong_prefix' });
    expect(parseConsentPath('/etc/passwd', TID, UID).ok).toBe(false);
  });

  it('refuses a path that tries to climb out with ..', () => {
    expect(parseConsentPath(`${CONSENT_PREFIX}/${TID}/${UID}/../../secrets.pdf`, TID, UID).ok).toBe(false);
    expect(parseConsentPath(`${CONSENT_PREFIX}/${TID}/../${UID}/consent-${NOW}.pdf`, TID, UID).ok).toBe(false);
  });

  it('refuses extra path segments', () => {
    expect(parseConsentPath(`${CONSENT_PREFIX}/${TID}/${UID}/sub/consent-${NOW}.pdf`, TID, UID).ok).toBe(false);
  });

  it('refuses a filename that is not the one we mint', () => {
    for (const name of ['consent.pdf', 'consent-.pdf', 'consent-12.pdf', 'other-1800000000000.pdf', `consent-${NOW}.exe`, `consent-${NOW}`]) {
      expect(parseConsentPath(`${CONSENT_PREFIX}/${TID}/${UID}/${name}`, TID, UID).ok).toBe(false);
    }
  });

  it('refuses a non-string', () => {
    expect(parseConsentPath(undefined, TID, UID).ok).toBe(false);
    expect(parseConsentPath(42, TID, UID).ok).toBe(false);
    expect(parseConsentPath({ path: 'x' }, TID, UID).ok).toBe(false);
  });

  it('caps uploads at a size a phone photo fits inside', () => {
    expect(CONSENT_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe('buildConsentEmailHtml', () => {
  const args = {
    to: ['parent@example.com'],
    lang: 'fr' as const,
    playerName: 'Mirlande',
    guardianName: 'Mme Joseph',
    tournamentTitle: 'Arène de septembre',
    rank: 1,
    prizeCents: 10_000,
    expiresAt: NOW,
    tournamentId: TID,
  };

  it('names the child, the prize and where to go', () => {
    const html = buildConsentEmailHtml(args);
    expect(html).toContain('Mirlande');
    expect(html).toContain('Mme Joseph');
    expect(html).toContain('$100');
    expect(html).toContain(`/arena/autorisation?tid=${TID}`);
    expect(html).toContain(`/arena/reclamation?tid=${TID}`);
  });

  /*
   * This email is the template a scam would copy. Saying plainly that we never
   * ask for an ID or a payment gives the family a test they can apply to the
   * next message they get — so it is not decoration, and it is tested.
   */
  it('says we never ask for identity documents or money', () => {
    const fr = buildConsentEmailHtml(args);
    const ht = buildConsentEmailHtml({ ...args, lang: 'ht' });
    expect(fr).toMatch(/pièce d’identité/);
    expect(fr).toMatch(/bancaires/);
    expect(ht).toMatch(/kat idantite/);
    expect(ht).toMatch(/labank/);
  });

  it('escapes a name that contains markup', () => {
    const html = buildConsentEmailHtml({ ...args, guardianName: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('writes Kreyòl when asked', () => {
    expect(buildConsentEmailHtml({ ...args, lang: 'ht' })).toContain('Bonjou');
  });
});
