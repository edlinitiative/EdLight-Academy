import {
  acceptErrorMessage, drawIdxs, duelShareMessage, duelState, duelUrl, idxsInBank, isDuelCode,
  normalizeDuelCode, outcomeFor, questionKey, questionsAt, shuffleOptions, sortDuels, uniqueByCode,
  whatsappUrl, type DuelLike, type DuelQuestion,
} from '../duels';
import { TRIVIA_QUESTIONS as WEB_BANK } from '../../data/triviaData';
import { TRIVIA_QUESTIONS as APP_BANK } from '../../../mobile/src/data/triviaData';
import { loadDuelBank } from '../duelBank';

const q = (text: string, options = ['a', 'b', 'c', 'd'], answer = 0, extra: Partial<DuelQuestion> = {}): DuelQuestion =>
  ({ q: text, options, answer, ...extra });

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('codes and links', () => {
  it('normalizes what people paste and accepts only the server alphabet', () => {
    expect(normalizeDuelCode(' ab2c-d3ef ')).toBe('AB2CD3EF');
    expect(isDuelCode('AB2CD3EF')).toBe(true);
    expect(isDuelCode('AB2CD3E')).toBe(false); // 7 chars
    expect(isDuelCode('AB0CD3EF')).toBe(false); // 0 is not in the alphabet
    expect(isDuelCode('AB1CD3EF')).toBe(false);
  });
  it('builds the public link and the WhatsApp intent', () => {
    expect(duelUrl('AB2CD3EF')).toBe('https://academy.edlight.org/defi/AB2CD3EF');
    expect(whatsappUrl('a & b ?')).toBe('https://wa.me/?text=a%20%26%20b%20%3F');
  });
});

describe('question identity and bank lookups', () => {
  it('tells flag questions apart even though they share their text', () => {
    const a = q('De quel pays est ce drapeau ?', ['Haïti', 'Cuba'], 0, { flag: 'HT' });
    const b = q('De quel pays est ce drapeau ?', ['Cuba', 'Haïti'], 0, { flag: 'CU' });
    expect(questionKey(a)).not.toBe(questionKey(b));
  });
  it('treats a reshuffled question as the same question, and a changed answer as a different one', () => {
    const a = q('Capitale ?', ['Paris', 'Rome'], 0);
    expect(questionKey(a)).toBe(questionKey(q('Capitale ?', ['Rome', 'Paris'], 1)));
    expect(questionKey(a)).not.toBe(questionKey(q('Capitale ?', ['Paris', 'Rome'], 1)));
  });
  it('maps a played round back to bank indexes in play order', () => {
    const bank = [q('A'), q('B'), q('C'), q('D')];
    expect(idxsInBank(bank, [q('C'), q('A')])).toEqual([2, 0]);
  });
  it('refuses a round with any question missing from the bank', () => {
    const bank = [q('A'), q('B')];
    expect(idxsInBank(bank, [q('A'), q('Z')])).toBeNull();
    expect(idxsInBank(undefined, [q('A')])).toBeNull();
    expect(idxsInBank(bank, [])).toBeNull();
  });
  it('refuses a round that would repeat an index (the server rejects duplicates)', () => {
    expect(idxsInBank([q('A'), q('A')], [q('A'), q('A')])).toBeNull();
  });
  it('reads questions back by index and fails closed out of range', () => {
    const bank = [q('A'), q('B')];
    expect(questionsAt(bank, [1, 0])!.map((x) => x.q)).toEqual(['B', 'A']);
    expect(questionsAt(bank, [2])).toBeNull();
    expect(questionsAt(bank, [-1])).toBeNull();
    expect(questionsAt(bank, [0.5])).toBeNull();
    expect(questionsAt(bank, [])).toBeNull();
  });
  it('draws distinct indexes, capped by the bank size', () => {
    const d = drawIdxs(30, 10);
    expect(d).toHaveLength(10);
    expect(new Set(d).size).toBe(10);
    expect(d.every((i) => i >= 0 && i < 30)).toBe(true);
    expect(drawIdxs(4, 10)).toHaveLength(4);
    expect(drawIdxs(0, 10)).toEqual([]);
  });
  it('reshuffles options without moving the answer or desyncing Kreyòl', () => {
    const src = q('X', ['un', 'deux', 'trois', 'quatre'], 2, { optionsHt: ['en', 'de', 'twa', 'kat'] });
    const out = shuffleOptions(src, seq([0.1, 0.9, 0.4]));
    expect(out.options[out.answer]).toBe('trois');
    expect(out.optionsHt![out.answer]).toBe('twa');
    out.options.forEach((o, i) => expect(src.optionsHt![src.options.indexOf(o)]).toBe(out.optionsHt![i]));
    expect(questionKey(out)).toBe(questionKey(src));
  });
});

describe('the duel bank is the app’s bank', () => {
  it('loads mobile/src/data/triviaData — the bank every existing duel indexes into', async () => {
    const bank = await loadDuelBank();
    expect(Object.keys(bank).sort()).toEqual(Object.keys(APP_BANK).sort());
    for (const k of Object.keys(APP_BANK)) {
      expect(bank[k].map((x) => x.q)).toEqual((APP_BANK as any)[k].map((x: any) => x.q));
    }
  });
  it('lets a web round of a generated deck become a duel (same countries, same order)', () => {
    for (const k of ['capitals', 'currencies', 'flags']) {
      const played = (WEB_BANK as any)[k].slice(5, 15);
      expect(idxsInBank((APP_BANK as any)[k], played)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    }
  });
  it('every deck has enough questions for a full duel round', () => {
    for (const [k, deck] of Object.entries(APP_BANK as Record<string, any[]>)) {
      expect([k, deck.length >= 10]).toEqual([k, true]);
    }
  });
});

const duel = (over: Partial<DuelLike & { createdAt: number }> = {}): DuelLike & { createdAt: number } => ({
  code: 'AAAAAAAA', challengerUid: 'me', challengerScore: 6, total: 10, expiresAt: 2000, status: 'open', opponent: null, createdAt: 1000, ...over,
});

describe('reading a duel from the viewer’s side', () => {
  const played = (score: number) => duel({ status: 'played', opponent: { uid: 'friend', name: 'Ana', score, playedAt: 1500 } });

  it('never tells the challenger they won a duel they lost', () => {
    expect(outcomeFor(played(8), 'me')).toBe('lost');
    expect(outcomeFor(played(8), 'friend')).toBe('won');
    expect(outcomeFor(played(3), 'me')).toBe('won');
    expect(outcomeFor(played(3), 'friend')).toBe('lost');
    expect(outcomeFor(played(6), 'me')).toBe('tie');
    expect(outcomeFor(played(6), 'friend')).toBe('tie');
  });
  it('has no outcome for an unplayed duel or a bystander', () => {
    expect(outcomeFor(duel(), 'me')).toBeNull();
    expect(outcomeFor(played(8), 'someone')).toBeNull();
    expect(outcomeFor(played(8), null)).toBeNull();
  });
  it('classifies duels for the list', () => {
    expect(duelState(duel(), 'me', 1500)).toBe('waiting');
    expect(duelState(duel(), 'friend', 1500)).toBe('to-play');
    expect(duelState(duel(), 'friend', 2500)).toBe('expired');
    expect(duelState(played(8), 'me', 2500)).toBe('played');
    expect(duelState(played(8), 'friend', 2500)).toBe('played');
    expect(duelState(played(8), 'third', 1500)).toBe('taken');
  });
  it('puts duels to play first, then the most recent activity', () => {
    const a = duel({ code: 'A', createdAt: 100 });                     // mine, waiting
    const b = duel({ code: 'B', challengerUid: 'x', createdAt: 50 });   // to play
    const c = duel({ code: 'C', createdAt: 10, status: 'played', opponent: { uid: 'y', name: null, score: 1, playedAt: 900 } });
    expect(sortDuels([a, b, c], 'me', 1500).map((d) => d.code)).toEqual(['B', 'C', 'A']);
  });
  it('de-duplicates by code', () => {
    expect(uniqueByCode([{ code: 'A' }, { code: 'B' }, { code: 'A' }]).map((d) => d.code)).toEqual(['A', 'B']);
  });
});

describe('messages', () => {
  it('writes the share text in both languages with the link and optional referral code', () => {
    const fr = duelShareMessage({ categoryLabel: 'Capitales', score: 7, total: 10, url: 'U', referralCode: 'REF1', isCreole: false });
    expect(fr).toContain("J'ai fait 7/10 en Capitales");
    expect(fr).toContain('REF1');
    expect(fr.endsWith(' U')).toBe(true);
    const ht = duelShareMessage({ categoryLabel: 'Kapital', score: 7, total: 10, url: 'U', isCreole: true });
    expect(ht).toContain('Mwen fè 7/10 nan Kapital');
    expect(ht).not.toContain('kòd');
  });
  it('turns every accept error into an actionable sentence', () => {
    for (const e of ['already_played', 'expired', 'not_found', 'self_challenge', 'rate_limit_exceeded', 'network', undefined]) {
      expect(acceptErrorMessage(e, false).length).toBeGreaterThan(10);
      expect(acceptErrorMessage(e, true).length).toBeGreaterThan(10);
    }
    expect(acceptErrorMessage('already_played', false)).not.toBe(acceptErrorMessage('expired', false));
  });
});
