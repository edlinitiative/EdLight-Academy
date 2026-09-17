import { schoolKey, matchScore, searchSchools, likelyDuplicate, mergeSchools, type School } from '../../../shared/schools';

const s = (name: string, commune = '', applicants = 0): School =>
  ({ key: schoolKey(name), name, commune, applicants });

const LIST: School[] = [
  s('Collège Dominique Savio', 'Pétion-Ville', 23),
  s('Collège Marie-Anne', 'Delmas', 15),
  s('Institution Saint-Louis de Gonzague', 'Delmas', 11),
  s('Lycée Toussaint Louverture', 'Port-au-Prince', 4),
  s('Collège Canado Haïtien', 'Tabarre', 7),
];

describe('finding a school someone is about to re-add', () => {
  it('forgives accents and capitalisation', () => {
    expect(searchSchools(LIST, 'lycee toussaint')[0].name).toBe('Lycée Toussaint Louverture');
    expect(searchSchools(LIST, 'COLLÈGE MARIE ANNE')[0].name).toBe('Collège Marie-Anne');
  });

  it('forgives the abbreviations people actually type', () => {
    expect(searchSchools(LIST, 'Coll. Marie-Anne')[0].name).toBe('Collège Marie-Anne');
    expect(searchSchools(LIST, 'Inst. St Louis de Gonzague')[0].name)
      .toBe('Institution Saint-Louis de Gonzague');
  });

  it('finds a school named without its institution type', () => {
    // The commonest duplicate: typing "Dominique Savio" and not finding
    // "Collège Dominique Savio", so adding it again.
    expect(searchSchools(LIST, 'Dominique Savio')[0].name).toBe('Collège Dominique Savio');
    expect(searchSchools(LIST, 'Canado')[0].name).toBe('Collège Canado Haïtien');
  });

  it('puts the student\'s own commune first', () => {
    const delmas = searchSchools(LIST, 'coll', { commune: 'Delmas' });
    expect(delmas[0].commune).toBe('Delmas');
  });

  it('shows the commune\'s schools before any typing, most-attended first', () => {
    const shown = searchSchools(LIST, '', { commune: 'Delmas' });
    expect(shown.slice(0, 2).map((x) => x.name))
      .toEqual(['Collège Marie-Anne', 'Institution Saint-Louis de Gonzague']);
  });

  it('returns nothing for a school genuinely not in the list', () => {
    expect(searchSchools(LIST, 'Lycée Jean-Jacques Dessalines')).toHaveLength(0);
  });
});

describe('before adding a new school', () => {
  it('catches the duplicate someone is about to create', () => {
    expect(likelyDuplicate(LIST, 'college marie anne', 'Delmas')?.name).toBe('Collège Marie-Anne');
    expect(likelyDuplicate(LIST, 'Saint-Louis de Gonzague', 'Delmas')?.name)
      .toBe('Institution Saint-Louis de Gonzague');
  });

  it('stays quiet when it is genuinely a different school', () => {
    // Offering "did you mean?" for a loose match trains people to dismiss it,
    // and then it fails for the cases that matter.
    expect(likelyDuplicate(LIST, 'Lycée National de Pétion-Ville', 'Pétion-Ville')).toBeNull();
  });

  it('does not match across communes', () => {
    expect(likelyDuplicate(LIST, 'Collège Marie-Anne', 'Cap-Haïtien')).toBeNull();
  });
});

describe('merging the seed with schools students added', () => {
  it('does not list the same school twice', () => {
    const added = [s('college marie anne', 'Delmas')];
    expect(mergeSchools(LIST, added)).toHaveLength(LIST.length);
  });

  it('keeps a commune contributed by whoever knew it', () => {
    const seed = [s('Lycée Anténor Firmin', '')];
    const added = [{ ...s('Lycée Anténor Firmin', 'Cap-Haïtien'), address: 'Rue 12' }];
    const merged = mergeSchools(seed, added);
    expect(merged).toHaveLength(1);
    expect(merged[0].commune).toBe('Cap-Haïtien');
  });
});
