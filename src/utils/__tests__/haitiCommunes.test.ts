/**
 * The guard on a deliberate copy.
 *
 * `shared/haitiCommunes.ts` mirrors `src/data/haitiGeo.ts` because `api/`
 * compiles under `strict: true` and cannot import the untyped original (three
 * TS7006 errors in a file api/ does not own). A copy is only safe while
 * something notices it drifting — a commune added to one and not the other is a
 * commune the profile picker offers and the server then refuses, which looks
 * like a broken form and not like a missing line of data.
 *
 * So this test IS the safety. If it fails, add the commune to both.
 */

import { HAITI_DEPARTMENTS } from '../../data/haitiGeo';
import { HAITI_COMMUNES, findCommune, findDepartment, communeKey } from '../../../shared/haitiCommunes';

describe('the server copy of the commune list', () => {
  it('names the same départements, in the same order', () => {
    expect(HAITI_COMMUNES.map((d) => d.department)).toEqual(HAITI_DEPARTMENTS.map((d) => d.name));
  });

  it('carries every commune, spelled identically', () => {
    for (const d of HAITI_DEPARTMENTS) {
      const mirrored = HAITI_COMMUNES.find((x) => x.department === d.name);
      expect(mirrored).toBeDefined();
      expect(mirrored?.communes).toEqual(d.cities);
    }
  });

  it('folds the same way haitiGeo folds, so legacy free-typed values still land', () => {
    // These are the spellings that existed before the picker did.
    expect(findCommune('Port au Prince')?.commune).toBe('Port-au-Prince');
    expect(findCommune('PETION-VILLE')?.commune).toBe('Pétion-Ville');
    expect(findCommune('  leogane ')?.commune).toBe('Léogâne');
  });

  it('answers with the département a commune belongs to', () => {
    expect(findCommune('Jacmel')).toEqual({ department: 'Sud-Est', commune: 'Jacmel' });
    expect(findCommune('Cap-Haïtien')?.department).toBe('Nord');
  });

  it('returns null rather than a best guess for something that is not a commune', () => {
    // The temptation this refuses is fuzzy matching. A school placed in the
    // commune whose name was nearest to a typo is a school in the wrong place,
    // on a broadcast, with nothing on screen admitting it was a guess.
    expect(findCommune('Delmas 33')).toBeNull();
    expect(findCommune('quelque part')).toBeNull();
    expect(findCommune('')).toBeNull();
    expect(findCommune(null)).toBeNull();
  });

  it('resolves département names too, including the diaspora entry', () => {
    expect(findDepartment('ouest')).toBe('Ouest');
    expect(findDepartment("Grand'Anse")).toBe("Grand'Anse");
    expect(findDepartment('Diaspora / Etranger')).toBe('Diaspora / Étranger');
    expect(findDepartment('Ohio')).toBeNull();
  });

  it('gives one key to spellings that differ only by accent or punctuation', () => {
    expect(communeKey('Môle-Saint-Nicolas')).toBe(communeKey('mole saint nicolas'));
  });
});
