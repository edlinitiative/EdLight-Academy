import { deriveStories, pickStory, storyText, type StorySchool, type StorySnapshot } from '../arenaStory';

const sc = (key: string, rank: number, qualified = true): StorySchool => ({ key, label: key.toUpperCase(), shortName: key.toUpperCase(), rank, qualified });
const snap = (seq: number, schools: StorySchool[], individuals: StorySnapshot['individuals'] = []): StorySnapshot => ({ seq, schools, individuals });
const fr = (f: string) => f;

describe('watch story derivation (X3)', () => {
  const base = snap(1, [sc('a', 1), sc('b', 2), sc('c', 3), sc('d', 4), sc('e', 5), sc('f', 6), sc('g', 7)]);

  it('tells nothing on the first snapshot, or on one that is not newer', () => {
    expect(deriveStories(null, base, null)).toEqual([]);
    expect(deriveStories(base, base, null)).toEqual([]);
    expect(deriveStories(base, { ...base, seq: 0 }, null)).toEqual([]);
  });

  it('a lead change is one story, composed with its own climb', () => {
    const next = snap(2, [sc('b', 1), sc('a', 2), sc('c', 3), sc('d', 4), sc('e', 5), sc('f', 6), sc('g', 7)]);
    const stories = deriveStories(base, next, null);
    expect(stories.filter((s) => s.school.key === 'b')).toHaveLength(1);
    const top = pickStory(stories)!;
    expect(top).toMatchObject({ kind: 'LEAD_CHANGE', school: { key: 'b' }, displaced: { key: 'a' }, priority: 10 });
    expect(storyText(top, fr).line).toBe('B passe devant A et prend la 1re place');
  });

  it('entering the top five subsumes the climb that did it', () => {
    const next = snap(2, [sc('a', 1), sc('b', 2), sc('g', 3), sc('c', 4), sc('d', 5), sc('e', 6), sc('f', 7)]);
    const g = deriveStories(base, next, null).filter((s) => s.school.key === 'g');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ kind: 'SCHOOL_ENTERS_TOP_5', from: 7, to: 3 });
    expect(storyText(g[0], fr).line).toBe('G entre dans le top 5, 3e place');
  });

  it('an overtake inside the five is a climb', () => {
    const next = snap(2, [sc('a', 1), sc('d', 2), sc('b', 3), sc('c', 4), sc('e', 5), sc('f', 6), sc('g', 7)]);
    const top = pickStory(deriveStories(base, next, null))!;
    expect(top).toMatchObject({ kind: 'SCHOOL_OVERTAKE', school: { key: 'd' }, from: 4, to: 2 });
    expect(storyText(top, fr).line).toBe('D passe de la 4e à la 2e place');
  });

  it('unqualified schools never move on the story strip', () => {
    const next = snap(2, [...base.schools.slice(0, 6), sc('z', 1, false)]);
    expect(deriveStories(base, next, null).some((s) => s.school.key === 'z')).toBe(false);
  });

  it('prefers the followed school at equal priority', () => {
    const next = snap(2, [sc('a', 1), sc('c', 2), sc('b', 3), sc('e', 4), sc('d', 5), sc('f', 6), sc('g', 7)]);
    expect(pickStory(deriveStories(base, next, 'e'))!.school.key).toBe('e');
    expect(pickStory(deriveStories(base, next, null))!.school.key).toBe('c');
  });

  it('a student entering the individual top five', () => {
    const prev = snap(1, base.schools, [{ uid: 'u1', displayName: 'Sandra', schoolKey: 'c', rank: 8 }]);
    const next = snap(2, base.schools, [{ uid: 'u1', displayName: 'Sandra', schoolKey: 'c', rank: 4 }]);
    const top = pickStory(deriveStories(prev, next, null))!;
    expect(top).toMatchObject({ kind: 'PLAYER_ENTERS_TOP_5', player: { uid: 'u1' }, to: 4 });
    expect(storyText(top, fr).line).toBe('Sandra (C) entre dans le top 5');
  });

  it('a lead change outranks everything else in the same close', () => {
    const prev = snap(1, base.schools, [{ uid: 'u1', displayName: 'Sandra', schoolKey: 'c', rank: 8 }]);
    const next = snap(2, [sc('g', 1), sc('a', 2), sc('b', 3), sc('c', 4), sc('d', 5), sc('e', 6), sc('f', 7)], [{ uid: 'u1', displayName: 'Sandra', schoolKey: 'c', rank: 2 }]);
    expect(pickStory(deriveStories(prev, next, 'c'))!.kind).toBe('LEAD_CHANGE');
  });

  it('a first leader takes the lead without displacing anyone', () => {
    const prev = snap(1, [sc('a', 0, false)]);
    const next = snap(2, [sc('a', 1)]);
    const top = pickStory(deriveStories(prev, next, null))!;
    expect(top).toMatchObject({ kind: 'LEAD_CHANGE', displaced: null });
    expect(storyText(top, fr).line).toBe('A prend la tête');
  });
});
