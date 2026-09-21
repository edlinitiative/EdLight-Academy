import {
  schoolKey,
  matchScore,
  searchSchools,
  likelyDuplicate,
  mergeSchools,
  validateShortName,
  schoolFromDoc,
  shortNameFailure,
  type School,
} from '../../../shared/schools';

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

describe('the kind of school ranks, but never hides', () => {
  const list = [
    s('Institution du Sacré-Cœur'),
    s('Ecole du Sacré-Cœur des Filles de Marie'),
    s('Institution Marie Régine des sœurs salésiennes de Don Boscos'),
    s('Collège Dominique Savio'),
  ];

  it('cannot tell these two apart from the names, so it offers both', () => {
    // Institution du Sacré-Cœur and Ecole du Sacré-Cœur des Filles de Marie are
    // two schools. Institution Marie Régine des sœurs salésiennes and Collège
    // Marie regine are one. Structurally those are the same shape — a shorter
    // name, a different type, and an extra religious order — so no rule reads
    // them apart. The exact name wins, the other is offered below it, and the
    // student settles it.
    const hits = searchSchools(list, 'Institution du Sacré-Cœur');
    expect(hits[0].name).toBe('Institution du Sacré-Cœur');
    expect(hits.map((h) => h.name)).toContain('Ecole du Sacré-Cœur des Filles de Marie');
  });

  it('still finds a school a student typed with the wrong type', () => {
    // Collège Marie regine and Institution Marie Régine are one school. Hiding
    // a match on a type mismatch would have the student add it a second time,
    // which is the expensive direction — so the type only reorders.
    expect(likelyDuplicate(list, 'Collège Marie regine')?.name)
      .toBe('Institution Marie Régine des sœurs salésiennes de Don Boscos');
    expect(searchSchools(list, 'Collège Marie regine')).toHaveLength(1);
  });

  it('puts the same kind of school first', () => {
    const both = [s('Ecole Sainte Famille'), s('Institution Sainte Famille')];
    expect(searchSchools(both, 'Institution Sainte Famille')[0].name)
      .toBe('Institution Sainte Famille');
    expect(searchSchools(both, 'Ecole Sainte Famille')[0].name).toBe('Ecole Sainte Famille');
  });

  it('still matches a name typed without any type at all', () => {
    // Leaving the type off is the commonest way a duplicate gets created.
    expect(searchSchools(list, 'Dominique Savio')[0].name).toBe('Collège Dominique Savio');
  });

  it('treats Institut and Institution as the same word', () => {
    expect(searchSchools([s('Institut Saint-Ignace')], 'Institution Saint-Ignace')).toHaveLength(1);
  });
});

describe('the ways one school gets written twice', () => {
  it('matches a name missing a space', () => {
    // "Institution du SacréCoeur" is the same school as "Institution du Sacré
    // Coeur", typed in a hurry.
    expect(likelyDuplicate([s('Institution du Sacré Coeur')], 'Institution du SacréCoeur'))
      .not.toBeNull();
  });

  it('matches across an apostrophe', () => {
    expect(likelyDuplicate([s('Louverture Cleary School')], "L'ouverture Cleary school"))
      .not.toBeNull();
  });

  it('ignores a street address typed into the name', () => {
    // The corpus has these with and without a comma before the street.
    expect(schoolKey('Collège Marie-Anne, # 9, Route de Jacquet')).toBe(schoolKey('Collège Marie-Anne'));
    expect(schoolKey('Ecole du Sacré Coeur Rue 2k')).toBe(schoolKey('Ecole du Sacré Coeur'));
  });

  it('ignores "mixte", which describes a school rather than naming it', () => {
    expect(searchSchools([s('Académie Chrétienne')], 'École mixte Academie Chrétienne'))
      .toHaveLength(1);
  });

  it('does not suggest two schools confirmed to be different', () => {
    // Nothing in the strings separates these — a shorter name and a longer one
    // adding a religious order — so the distinction is recorded, not derived.
    const list = [s('Institution du Sacré Coeur')];
    expect(likelyDuplicate(list, 'Ecole du Sacré-Cœur dirrigée par les Filles de Marie')).toBeNull();
  });
});


describe('the short name a school gets called on the stage', () => {
  const approved: School[] = [{ ...s('Collège Dominique Savio', 'Pétion-Ville', 23), shortName: 'CODOSA' }];

  it('takes what the student typed however they typed it', () => {
    // The student types it the way they say it; the stage prints one form.
    expect(validateShortName('  codosa ', [])).toEqual({ ok: true, value: 'CODOSA' });
  });

  it('refuses one character, because a single letter names nothing', () => {
    expect(validateShortName('C', [])).toEqual({ ok: false, reason: 'too-short' });
  });

  it('refuses a name longer than the stage can set', () => {
    // Past eight characters it stops being a short name and the standings row
    // has to shrink its type, which is the whole thing this replaces.
    expect(validateShortName('CODOSAVIO2', [])).toEqual({ ok: false, reason: 'too-long' });
  });

  it('refuses spaces, punctuation and accents', () => {
    // These are chanted and set in one type style; "CO-DO" and "CÔDO" are two
    // more spellings of one school, which is the bug the short name removes.
    expect(validateShortName('CO DO', [])).toEqual({ ok: false, reason: 'charset' });
    expect(validateShortName('CO-DO', [])).toEqual({ ok: false, reason: 'charset' });
    expect(validateShortName('CÔDOSA', [])).toEqual({ ok: false, reason: 'charset' });
  });

  it('refuses names that would speak for EdLight or read as a bug', () => {
    // A school called NULL on a live standings board is indistinguishable from
    // a missing value, and we would go looking for a bug that is not there.
    expect(validateShortName('edlight', [])).toEqual({ ok: false, reason: 'reserved' });
    expect(validateShortName('null', [])).toEqual({ ok: false, reason: 'reserved' });
    expect(validateShortName('Test', [])).toEqual({ ok: false, reason: 'reserved' });
  });

  it('refuses a name an approved school already answers to, in any casing', () => {
    // Two schools behind one short name means supporters cheer the wrong bar.
    expect(validateShortName('codosa', approved)).toEqual({ ok: false, reason: 'taken' });
    expect(validateShortName('CODOSA', approved)).toEqual({ ok: false, reason: 'taken' });
  });

  it('does not let a pending submission lock out the school that owns the name', () => {
    // Anyone can submit a school; if a pending entry could reserve CODOSA, one
    // student could take the name of a school they do not attend, and the real
    // Collège Dominique Savio would be told its own name is unavailable.
    const pending: School[] = [{ ...s('Collège Dodo Savio'), shortName: 'CODOSA', status: 'pending' }];
    expect(validateShortName('CODOSA', pending)).toEqual({ ok: true, value: 'CODOSA' });
  });
});

describe('finding a school by what its students call it', () => {
  const rivals: School[] = [
    { ...s('Collège Dominique Savio', 'Pétion-Ville', 23), shortName: 'CODOSA' },
    s('Codosa', 'Delmas', 400),
  ];

  it('puts the school whose short name it is above the school merely named that', () => {
    // Nobody types CODOSA by accident: it is the most confident thing a student
    // can tell us about which school they mean, so it has to beat an exact name
    // match AND the commune bonus, or the student picks the wrong school and
    // their points land on someone else's board.
    const hits = searchSchools(rivals, 'CODOSA', { commune: 'Delmas' });
    expect(hits[0].name).toBe('Collège Dominique Savio');
  });

  it('finds it however the student cased or spaced it', () => {
    expect(searchSchools(rivals, ' codosa ')[0].name).toBe('Collège Dominique Savio');
  });

  it('finds a school by an alias that shares no words with its name', () => {
    // Saint-Louis de Gonzague's students say "les Frères"; nothing in the
    // registered name would ever match that, so without aliases they search,
    // find nothing, and add the school a second time.
    const aliased: School[] = [
      { ...s('Institution Saint-Louis de Gonzague', 'Delmas', 11), aliases: ['Frères de l’Instruction Chrétienne'] },
      s('Collège Marie-Anne', 'Delmas', 15),
    ];
    const hits = searchSchools(aliased, 'Freres de l Instruction Chretienne');
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe('Institution Saint-Louis de Gonzague');
  });

  it('offers the school a short name belongs to when someone adds it as a new name', () => {
    // A student who types "CODOSA" into the add-a-school box is not adding a
    // school, they are failing to find one — so the duplicate check catches it.
    expect(likelyDuplicate(rivals, 'CODOSA')?.name).toBe('Collège Dominique Savio');
  });

  it('scores a school with no short name exactly as it did before', () => {
    // The short name is additive: nothing about the 94 seeded schools moves.
    expect(matchScore(s('Collège Marie-Anne'), 'marie anne')).toBe(90);
  });
});

describe('a school added a minute ago', () => {
  it('is findable while it waits for an admin to approve it', () => {
    // The student who just added their school has to be able to pick it in the
    // same breath. Hiding pending schools from search would leave them with a
    // school they cannot select — and they would add it again.
    const withPending: School[] = [
      ...LIST,
      { ...s('Lycée Jean-Jacques Dessalines', 'Croix-des-Bouquets'), status: 'pending' },
    ];
    expect(searchSchools(withPending, 'Jean-Jacques Dessalines')[0].name)
      .toBe('Lycée Jean-Jacques Dessalines');
  });
});

describe('reading a stored school document', () => {
  // Both apps read the same `schools` collection through this one mapping, so
  // these are the cases where the web and mobile pickers could have disagreed
  // about what a school IS.

  it('keeps a pending school pending', () => {
    // The caller decides what to do with it; the mapping must not launder a
    // student submission into a canonical school.
    expect(schoolFromDoc({ name: 'Collège Test', status: 'pending' })?.status).toBe('pending');
  });

  it('treats an unreadable status as approved', () => {
    // Documents written before short names existed carry no status, and their
    // schools are already on the live board. Demoting them to pending would
    // strip schools students have been playing under for months.
    expect(schoolFromDoc({ name: 'Collège Test' })?.status).toBeUndefined();
    expect(schoolFromDoc({ name: 'Collège Test', status: 'whatever' })?.status).toBeUndefined();
  });

  it('derives the grouping key when the document has none', () => {
    // The key IS the grouping on the school board. A document missing it must
    // land on the same key the rest of the app would compute.
    expect(schoolFromDoc({ name: 'Collège Dominique Savio' })?.key)
      .toBe(schoolKey('Collège Dominique Savio'));
  });

  it('normalises a stored short name the way the validator does', () => {
    expect(schoolFromDoc({ name: 'Collège Test', shortName: ' codosa ' })?.shortName).toBe('CODOSA');
  });

  it('refuses a document that cannot name a school', () => {
    // Nothing a picker could usefully show, and an entry with a blank name
    // would sit in the list forever.
    expect(schoolFromDoc({ commune: 'Delmas' })).toBeNull();
    expect(schoolFromDoc(null)).toBeNull();
  });

  it('drops empty strings rather than storing them as values', () => {
    const school = schoolFromDoc({ name: 'Collège Test', address: '', city: '', aliases: ['', ' '] });
    expect(school?.address).toBeUndefined();
    expect(school?.city).toBeUndefined();
    expect(school?.aliases).toBeUndefined();
  });
});

describe('shortNameFailure', () => {
  // The web compiles with strictNullChecks off and cannot narrow the union
  // validateShortName returns, so both apps ask through this accessor.

  it('is null when the short name is fine', () => {
    expect(shortNameFailure(validateShortName('LTL', LIST))).toBeNull();
    expect(shortNameFailure(null)).toBeNull();
  });

  it('reports the rule that was broken', () => {
    expect(shortNameFailure(validateShortName('A', LIST))).toBe('too-short');
    expect(shortNameFailure(validateShortName('ABCDEFGHI', LIST))).toBe('too-long');
  });
});
