import { standing, playersNeeded, recruitUrgency } from '../tournament';

const groups = [
  { key: 'lycee-petion', name: 'Lycée Pétion', xp: 4200, memberCount: 14 },
  { key: 'savio', name: 'Collège Dominique Savio', xp: 3860, memberCount: 11 },
  { key: 'stlouis', name: 'Saint-Louis de Gonzague', xp: 1200, memberCount: 6 },
];

describe('standing', () => {
  it('places a school and names who is directly above and below', () => {
    const s = standing(groups, 'savio');
    expect(s).not.toBeNull();
    expect(s!.rank).toBe(2);
    expect(s!.xp).toBe(3860);
    expect(s!.ahead?.name).toBe('Lycée Pétion');
    expect(s!.ahead?.gap).toBe(340);
    expect(s!.behind?.name).toBe('Saint-Louis de Gonzague');
  });

  it('has nobody ahead at rank 1, and nobody behind at the bottom', () => {
    expect(standing(groups, 'lycee-petion')!.ahead).toBeNull();
    expect(standing(groups, 'stlouis')!.behind).toBeNull();
  });

  it('returns null when the school is not on the board', () => {
    expect(standing(groups, 'unknown')).toBeNull();
    expect(standing(groups, null)).toBeNull();
    expect(standing([], 'savio')).toBeNull();
  });
});

describe('playersNeeded', () => {
  /**
   * The whole point of a school tournament: recruiting has to be visibly
   * rational. "You are 340 XP behind" is a fact; "two more players closes it"
   * is a reason to send the invite.
   */
  it('converts a gap into a number of additional players at the school average', () => {
    // 3500 XP over 10 members = 350 average.
    expect(playersNeeded(340, 3500, 10)).toBe(1);   // just under one average
    expect(playersNeeded(1050, 3500, 10)).toBe(3);  // exactly three averages
    expect(playersNeeded(1051, 3500, 10)).toBe(4);  // a point over rounds up
  });

  it('never claims zero players will close a real gap', () => {
    expect(playersNeeded(1, 3860, 11)).toBe(1);
  });

  it('returns 0 when there is no gap to close', () => {
    expect(playersNeeded(0, 3860, 11)).toBe(0);
    expect(playersNeeded(-50, 3860, 11)).toBe(0);
  });

  it('degrades safely when the school has no scoring history yet', () => {
    // No members or no XP — we cannot compute an average, so we must not
    // divide by zero or promise a number we cannot support.
    expect(playersNeeded(500, 0, 0)).toBeNull();
    expect(playersNeeded(500, 3860, 0)).toBeNull();
  });
});

describe('recruitUrgency', () => {
  it('is highest when the school is close behind the leader', () => {
    expect(recruitUrgency({ rank: 2, gapAhead: 120 })).toBe('close');
  });

  it('is a defence when the school leads', () => {
    expect(recruitUrgency({ rank: 1, gapAhead: null })).toBe('defending');
  });

  it('is a climb when the gap is large', () => {
    expect(recruitUrgency({ rank: 5, gapAhead: 4000 })).toBe('climbing');
  });
});
