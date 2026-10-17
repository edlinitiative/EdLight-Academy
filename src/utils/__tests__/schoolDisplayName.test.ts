import { canonicalSchoolName, tidySchoolName, relabelSchoolGroups } from '../../../shared/schools';

describe('school display names', () => {
  it('uses the catalogue spelling for the same school by the grouping rule', () => {
    expect(canonicalSchoolName('Collège jean Wesley')).toBe('Collège Jean Wesley');
    expect(canonicalSchoolName('College Dominique Savio')).toBe('Collège Dominique Savio');
    expect(canonicalSchoolName('INSTITUTION SAINT LOUIS DE GONZAGUE')).toBe('Institution Saint-Louis de Gonzague');
  });

  it('never fuzzy-matches a near miss', () => {
    expect(canonicalSchoolName('College Sacré-Cœur')).toBe('College Sacré-Cœur');
  });

  it('title-cases shouting but leaves acronyms and normal spellings alone', () => {
    expect(tidySchoolName('LYCEE  NATIONAL DE PETION-VILLE')).toBe('Lycee National de Petion-Ville');
    expect(tidySchoolName('IMD')).toBe('IMD');
    expect(tidySchoolName('UPNCH')).toBe('UPNCH');
    expect(tidySchoolName('Collège Andrew grene')).toBe('Collège Andrew grene');
  });

  it('relabels aggregated groups by key', () => {
    const out = relabelSchoolGroups([{ key: 'college jean wesley', label: 'Collège jean Wesley' }]);
    expect(out[0].label).toBe('Collège Jean Wesley');
  });
});
