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
    expect(likelyDuplicate(LIST, 'college marie anne')?.name).toBe('Collège Marie-Anne');
    expect(likelyDuplicate(LIST, 'Saint-Louis de Gonzague')?.name)
      .toBe('Institution Saint-Louis de Gonzague');
  });

  it('stays quiet when it is genuinely a different school', () => {
    // Offering "did you mean?" for a loose match trains people to dismiss it,
    // and then it fails for the cases that matter.
    expect(likelyDuplicate(LIST, 'Lycée National de Pétion-Ville')).toBeNull();
  });

  it('catches it wherever the student lives', () => {
    // There is one Saint-Louis de Gonzague in Haiti, and its students live in
    // Delmas, Tabarre, Carrefour-Feuilles, Laboule and Pétion-Ville. Narrowing
    // by commune would let each of them add the school again.
    const gonzague = LIST.find((x) => x.name.includes('Gonzague'))!;
    expect(likelyDuplicate(LIST, 'Institution Saint Louis de Gonzague')).toEqual(gonzague);
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

describe('spellings of one school', () => {
  it('matches across a ligature and a hyphen', () => {
    // "Institution du Sacré-Cœur" and "Institution du Sacre Coeur" are one
    // school; the ligature kept them apart until normalizeName folded it.
    const list = [s('Institution du Sacré-Cœur')];
    expect(searchSchools(list, 'Institution du Sacre Coeur')[0]).toBeDefined();
    expect(likelyDuplicate(list, 'institution du sacre coeur')?.name)
      .toBe('Institution du Sacré-Cœur');
  });
});

describe('the kind of school is part of its name', () => {
  const list = [
    s('Institution du Sacré-Cœur'),
    s('Ecole du Sacré-Cœur des Filles de Marie'),
    s('Collège Dominique Savio'),
  ];

  it('does not match an École to an Institution', () => {
    // A school called an Institution is never written "École" by its own
    // students, so the type is part of the identity, not decoration.
    expect(likelyDuplicate([list[0]], 'Ecole du Sacré-Cœur des Filles de Marie')).toBeNull();
    expect(likelyDuplicate([list[1]], 'Institution du Sacré-Cœur')).toBeNull();
    expect(searchSchools(list, 'Institution du Sacré-Cœur').map((x) => x.name))
      .toEqual(['Institution du Sacré-Cœur']);
  });

  it('still matches a name typed without any type at all', () => {
    // Leaving the type off is the commonest way a duplicate gets created —
    // "Dominique Savio" not finding "Collège Dominique Savio" — so a missing
    // type is not a conflict, only a different one is.
    expect(searchSchools(list, 'Dominique Savio')[0].name).toBe('Collège Dominique Savio');
    expect(likelyDuplicate(list, 'Sacré-Cœur')).not.toBeNull();
  });

  it('treats Institut and Institution as the same word', () => {
    expect(searchSchools([s('Institut Saint-Ignace')], 'Institution Saint-Ignace')).toHaveLength(1);
  });
});
