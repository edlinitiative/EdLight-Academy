import { duelOutcome, returnedDuels, unseenDuels } from '../duels';

const duel = (challengerScore: number, opponentScore: number | null, code = 'AAAA1111') => ({
  code,
  challengerUid: 'me',
  challengerName: 'Ted J.',
  categoryId: 'culture-generale',
  questionIdxs: [1, 2, 3],
  total: 10,
  challengerScore,
  createdAt: 0,
  expiresAt: 0,
  opponent: opponentScore === null
    ? null
    : { uid: 'them', name: 'Marie L.', score: opponentScore, playedAt: 1 },
  status: (opponentScore === null ? 'open' : 'played') as 'open' | 'played',
});

describe('reading a duel from the challenger\'s side', () => {
  it('calls it a loss when the opponent scored higher', () => {
    // The scores are stored challenger-vs-opponent, but the person reading
    // this list IS the challenger. Getting it backwards would congratulate a
    // student for a duel they lost.
    expect(duelOutcome(duel(6, 8))).toBe('lost');
    expect(duelOutcome(duel(8, 6))).toBe('won');
    expect(duelOutcome(duel(7, 7))).toBe('tie');
  });

  it('treats a duel nobody has played as a win by default, and hides it', () => {
    expect(returnedDuels([duel(5, null)])).toEqual([]);
  });
});

describe('which results are new', () => {
  const played = [duel(5, 9, 'AAA'), duel(5, 2, 'BBB')];

  it('counts only results the player has not seen', () => {
    expect(unseenDuels(played, []).map((c) => c.code)).toEqual(['AAA', 'BBB']);
    expect(unseenDuels(played, ['AAA']).map((c) => c.code)).toEqual(['BBB']);
  });

  it('shows nothing until the seen list has loaded', () => {
    // null is "not read from storage yet". Treating it as empty would flash a
    // "you were beaten" card on every cold start.
    expect(unseenDuels(played, null)).toEqual([]);
  });

  it('only counts duels that came back', () => {
    expect(returnedDuels([...played, duel(5, null, 'CCC')]).map((c) => c.code))
      .toEqual(['AAA', 'BBB']);
  });
});
