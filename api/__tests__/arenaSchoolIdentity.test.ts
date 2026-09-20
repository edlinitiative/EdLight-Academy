/**
 * Who a school IS, as far as the public board is concerned.
 *
 * E9, from an external audit: "registration validates key syntax rather than
 * canonical existence, permitting fabricated school identities. Server label
 * lookup ignores the bundled seed and does not enforce approved status."
 *
 * Both halves are exercised here, and the first one is the surprise. The seed
 * ships 94 schools INSIDE the bundle and Firestore "holds only what the seed
 * does not" — `api/arena/school-location.ts` says it in as many words, "a
 * seeded school has no document yet". So the old label lookup, which queried
 * Firestore and nothing else before falling back to the raw key, hit that
 * fallback for MOST real registrations: a board built to say CODOSA said
 * `college dominique savio`, lowercased and accent-stripped, on a stream.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
}));

import { resolveSchool } from '../arena/_shared';
import { schoolKey, seedSchoolByKey, seedSchools } from '../../shared/schools';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * A Firestore stand-in for `collection('schools').where('key','==',k).limit(1).get()`.
 * `docs` is what that query should return; `fail` makes the read throw, which
 * is the outage path.
 */
function fakeDb(opts: { docs?: Array<Record<string, unknown>>; fail?: boolean } = {}): Firestore {
  const docs = (opts.docs ?? []).map((data) => ({ data: () => data }));
  return {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => {
            if (opts.fail) throw new Error('firestore down');
            return { docs };
          },
        }),
      }),
    }),
  } as unknown as Firestore;
}

const CODOSA = schoolKey('Collège Dominique Savio');

describe('the bundled seed, keyed the same way the picker keys it', () => {
  it('ships the schools the tournament is actually played by', () => {
    expect(seedSchools().length).toBeGreaterThan(90);
  });

  it('finds a seeded school by the key a client would send', () => {
    const found = seedSchoolByKey(CODOSA);
    expect(found?.name).toBe('Collège Dominique Savio');
    expect(found?.shortName).toBe('CODOSA');
  });

  it('keys every seeded school with schoolKey, so the server and the picker agree', () => {
    // A seed keyed any other way would be a second opinion about school
    // identity — the exact failure shared/schools.ts exists to prevent.
    for (const school of seedSchools()) {
      expect(school.key).toBe(schoolKey(school.name));
    }
  });

  it('does not recognise a key nobody seeded', () => {
    expect(seedSchoolByKey('lekol pa m nan')).toBeNull();
  });
});

describe('resolveSchool — E9', () => {
  it('CLOSED: a seeded school gets its real short name, not its grouping key', () => {
    // The bug in one assertion. Firestore has NO document for a seeded school
    // until an admin types its location in, and the old code returned `key`.
    return resolveSchool(fakeDb(), CODOSA).then((r) => {
      expect(r.known).toBe(true);
      expect(r.label).toBe('CODOSA');
      expect(r.label).not.toBe(CODOSA);
    });
  });

  it('falls back to a seeded school’s full name when it has no short name', async () => {
    const noShortName = seedSchools().find((s) => !s.shortName);
    expect(noShortName).toBeDefined();
    const r = await resolveSchool(fakeDb(), noShortName!.key);
    expect(r.known).toBe(true);
    expect(r.label).toBe(noShortName!.name);
  });

  it('prefers a Firestore document over the seed — an admin may know better', async () => {
    const r = await resolveSchool(fakeDb({ docs: [{ shortName: 'CDS', name: 'Collège D. Savio' }] }), CODOSA);
    expect(r.label).toBe('CDS');
  });

  it('uses a document’s name when it carries no short name', async () => {
    const r = await resolveSchool(fakeDb({ docs: [{ name: 'Lycée Toussaint Louverture' }] }), 'lycee toussaint louverture');
    expect(r).toEqual({ known: true, label: 'Lycée Toussaint Louverture' });
  });

  it('CLOSED: a key naming nothing at all is reported as unknown', async () => {
    // What a client bypassing the picker would send. The picker can only offer
    // a seeded school or a Firestore document, so this came from neither.
    const r = await resolveSchool(fakeDb(), 'lekol pa m nan');
    expect(r.known).toBe(false);
  });

  it('treats a school students added (a Firestore doc) as known, whatever its status', async () => {
    // "Nobody is turned away" is about a school mid-approval still playing.
    // A pending school HAS a document, so it must stay registerable.
    const r = await resolveSchool(fakeDb({ docs: [{ name: 'Collège Nouveau', status: 'pending' }] }), 'college nouveau');
    expect(r.known).toBe(true);
    expect(r.label).toBe('Collège Nouveau');
  });

  it('an outage degrades to the seed rather than failing', async () => {
    const r = await resolveSchool(fakeDb({ fail: true }), CODOSA);
    expect(r).toEqual({ known: true, label: 'CODOSA' });
  });

  it('an outage on an UNSEEDED school reports known, not unknown', async () => {
    // Unverifiable is not the same as fabricated. Treating a Firestore blip as
    // "this school does not exist" would turn an outage into a wall of
    // rejected registrations at 17:55.
    const r = await resolveSchool(fakeDb({ fail: true }), 'college nouveau');
    expect(r.known).toBe(true);
  });

  it('never returns an empty label, whatever it was given', async () => {
    for (const db of [fakeDb(), fakeDb({ fail: true }), fakeDb({ docs: [{}] })]) {
      const r = await resolveSchool(db, 'college nouveau');
      expect(r.label).not.toBe('');
    }
  });
});
