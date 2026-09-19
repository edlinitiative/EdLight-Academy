/**
 * What /api/arena/school-location accepts before it writes anything.
 *
 * This endpoint is the ONLY way a school acquires a location, and the reason it
 * exists at all is that the previous way — deriving it from applicants' home
 * addresses — put one real school in two places. So the tests that matter here
 * are the refusals: a commune that is not on the list must not be stored, and
 * "nobody knows" must stay a value the system can hold.
 *
 * The module imports api/_lib/rateLimit and api/_lib/firebaseAdmin, both of
 * which reach for Firebase Admin at load. Mocked as in arenaAnswer.test.ts;
 * nothing here touches Firestore.
 */

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => false,
  getDb: () => { throw new Error('no firestore in unit tests'); },
  verifyIdToken: async () => ({ uid: 'u1' }),
}));

import { schoolDocId, validateSchoolLocation } from '../arena/school-location';

const ok = (raw: unknown) => {
  const parsed = validateSchoolLocation(raw);
  if (!parsed.ok) throw new Error(`expected ok, got ${parsed.reason}`);
  return parsed.value;
};

describe('the commune an admin submits', () => {
  it('is stored under the one spelling the map joins on', () => {
    // Folded, not rejected: an admin typing "petion-ville" means Pétion-Ville,
    // and the list is there to make spelling agree, not to be a spelling test.
    expect(ok({ key: 'codosa', commune: 'petion-ville' })).toEqual({
      key: 'codosa',
      commune: 'Pétion-Ville',
      department: 'Ouest',
      name: '',
    });
  });

  it('carries the département with it, derived from the COMMUNE and nothing else', () => {
    expect(ok({ key: 'lycee toussaint', commune: 'Jacmel' }).department).toBe('Sud-Est');
  });

  it('is refused outright when it is not a commune', () => {
    // Not stored, not corrected, not nearest-matched. A free-typed commune is a
    // school that silently never appears on the broadcast map, and the night of
    // the tournament is a bad time to find that out.
    expect(validateSchoolLocation({ key: 'codosa', commune: 'Delmas 33' }))
      .toEqual({ ok: false, reason: 'commune' });
    expect(validateSchoolLocation({ key: 'codosa', commune: 'Port-au-Prince ouest' }))
      .toEqual({ ok: false, reason: 'commune' });
    expect(validateSchoolLocation({ key: 'codosa', commune: 42 }))
      .toEqual({ ok: false, reason: 'commune' });
  });
});

describe('unknown, as a value', () => {
  it('is accepted explicitly, so a guess can be taken back', () => {
    // A location you can only ever add is a location nobody dares add.
    for (const commune of [null, undefined, '']) {
      expect(ok({ key: 'codosa', commune })).toMatchObject({ commune: null, department: null });
    }
  });
});

describe('the school it is about', () => {
  it('is identified by the same key the board groups by', () => {
    expect(validateSchoolLocation({ key: 'College Dominique Savio', commune: null }))
      .toEqual({ ok: false, reason: 'key' }); // not folded — keys arrive already folded
    expect(ok({ key: 'college dominique savio', commune: null }).key)
      .toBe('college dominique savio');
  });

  it('rejects a name too short to be a school, and keeps a real one for the create path', () => {
    expect(validateSchoolLocation({ key: 'codosa', commune: null, name: 'CD' }))
      .toEqual({ ok: false, reason: 'name' });
    expect(ok({ key: 'codosa', commune: null, name: 'Collège Dominique Savio' }).name)
      .toBe('Collège Dominique Savio');
  });

  it('derives the same document id from the same key, for every admin', () => {
    // The 94 seeded schools have no Firestore document until somebody writes
    // one. An auto-generated id would let two admins locating the same school
    // at the same moment create two schools with one key — the exact duplicate
    // this whole area of the product is built to prevent.
    expect(schoolDocId('college dominique savio')).toBe('k-college-dominique-savio');
    expect(schoolDocId('codosa')).toBe(schoolDocId('codosa'));
    expect(schoolDocId('a b')).not.toContain(' ');
  });
});
