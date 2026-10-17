import {
  selectResultTier,
  summarizeResult,
  contributionFor,
  nextActionFor,
  celebrationFor,
  celebrationKey,
  type ResultInput,
} from '../arenaResultTier';

const base: ResultInput = {
  state: 'provisional',
  me: { score: 9000, rank: 40 },
  school: { rank: 7, qualified: true },
  inTheFive: true,
  prizeCents: 0,
  previousScore: null,
  nextEventOpen: false,
};

describe('selectResultTier', () => {
  it('withholds everything while grading', () => {
    expect(selectResultTier({ ...base, state: 'grading', school: { rank: 1, qualified: true } })).toBe('calculating');
  });

  it('never states a championship before final', () => {
    const lead = { ...base, school: { rank: 1, qualified: true } };
    expect(selectResultTier(lead)).toBe('championProvisional');
    expect(selectResultTier({ ...lead, state: 'final' })).toBe('championConfirmed');
  });

  it('a school ranked 1 that did not qualify is not a champion', () => {
    expect(selectResultTier({ ...base, school: { rank: 1, qualified: false } })).not.toMatch(/champion/);
  });

  it('separates a prize from the team result', () => {
    expect(selectResultTier({ ...base, prizeCents: 5000 })).toBe('prizeProvisional');
    expect(selectResultTier({ ...base, prizeCents: 5000, state: 'final' })).toBe('prizeConfirmed');
  });

  it('team qualification outranks a personal best', () => {
    expect(selectResultTier({ ...base, previousScore: 1000 })).toBe('teamQualified');
  });

  it('personal best only against a known previous score', () => {
    const solo = { ...base, school: { rank: 0, qualified: false } };
    expect(selectResultTier({ ...solo, previousScore: 8000 })).toBe('personalBest');
    expect(selectResultTier({ ...solo, previousScore: 9000 })).toBe('completed');
    expect(selectResultTier({ ...solo, previousScore: null })).toBe('completed');
  });

  it('no row yet is "recorded", never a made-up result', () => {
    expect(selectResultTier({ ...base, me: null, school: null })).toBe('recorded');
  });
});

describe('contribution', () => {
  it('explains the students outside the counting five', () => {
    expect(contributionFor({ school: { rank: 3, qualified: true }, inTheFive: true })).toBe('inFive');
    expect(contributionFor({ school: { rank: 3, qualified: true }, inTheFive: false })).toBe('outsideFive');
    expect(contributionFor({ school: { rank: 0, qualified: false }, inTheFive: false })).toBe('schoolNotQualified');
    expect(contributionFor({ school: null, inTheFive: false })).toBe('noSchool');
  });
});

describe('next action and celebration', () => {
  it('one next action; the claim wins', () => {
    expect(nextActionFor('prizeProvisional', true)).toBe('claim');
    expect(nextActionFor('calculating', true)).toBe('wait');
    expect(nextActionFor('completed', true)).toBe('nextEvent');
    expect(nextActionFor('completed', false)).toBe('practice');
  });

  it('routine completion is never celebrated', () => {
    expect(celebrationFor('completed')).toBe('none');
    expect(celebrationFor('recorded')).toBe('none');
    expect(celebrationFor('championProvisional')).toBe('calm');
    expect(celebrationFor('championConfirmed')).toBe('big');
  });

  it('summarises and keys celebrations per event and tier', () => {
    const s = summarizeResult({ ...base, state: 'final', school: { rank: 1, qualified: true } });
    expect(s).toEqual({ tier: 'championConfirmed', celebration: 'big', contribution: 'inFive', next: 'practice', confirmed: true });
    expect(celebrationKey('t1', 'championConfirmed')).toBe('arena.celebrated.t1.championConfirmed');
  });
});
