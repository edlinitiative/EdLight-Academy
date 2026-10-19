/**
 * Changing school from the Profil (TestFlight build 63). One writer —
 * setLeaderboardOptIn — and every store the app reads a school from:
 * the board profile, this week's entry and the all-time entry.
 */
const store: Record<string, any> = {};

jest.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  collection: jest.fn(),
  getDoc: jest.fn(async (ref: any) => ({
    exists: () => !!store[ref.path],
    data: () => store[ref.path],
  })),
  getDocs: jest.fn(),
  setDoc: jest.fn(async (ref: any, data: any) => {
    store[ref.path] = { ...(store[ref.path] || {}), ...data };
  }),
  serverTimestamp: jest.fn(() => 'ts'),
  increment: jest.fn((n: number) => ({ __increment: n })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

import { setDoc } from 'firebase/firestore';
import { setMySchool } from '../triviaService';
import { weekId } from '../leaderboardService';

const PROFILE = 'users/u1/gamification/profile';

function writesTo(path: string) {
  return (setDoc as jest.Mock).mock.calls.filter(([ref]) => ref.path === path).map(([, data]) => data);
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('setMySchool', () => {
  it('writes the profile, this week’s entry and the all-time entry', async () => {
    store[PROFILE] = {
      xp: 120,
      leaderboard: { optedIn: true, displayName: 'Ted', school: 'Collège Dominique Savio', city: 'Delmas', department: 'Ouest' },
    };
    const updated = await setMySchool('u1', 'Institution Saint-Louis de Gonzague');

    expect(updated?.leaderboard.school).toBe('Institution Saint-Louis de Gonzague');
    expect(store[PROFILE].leaderboard.school).toBe('Institution Saint-Louis de Gonzague');

    const weekly = writesTo(`leaderboards/${weekId()}/entries/u1`);
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toMatchObject({ school: 'Institution Saint-Louis de Gonzague', xp: { __increment: 0 } });

    const allTime = writesTo('leaderboards/all-time/entries/u1');
    expect(allTime).toHaveLength(1);
    // increment(0): the stored XP is never rewritten, only the school.
    expect(allTime[0]).toMatchObject({ uid: 'u1', school: 'Institution Saint-Louis de Gonzague', xp: { __increment: 0 } });
  });

  it('keeps the residence: ville and département are where the student LIVES', async () => {
    store[PROFILE] = {
      leaderboard: { optedIn: true, displayName: 'Ted', school: 'A', city: 'Delmas', department: 'Ouest' },
    };
    await setMySchool('u1', 'B');
    expect(store[PROFILE].leaderboard).toMatchObject({ school: 'B', city: 'Delmas', department: 'Ouest', displayName: 'Ted' });
  });

  it('never publishes a student who hid themselves from the board', async () => {
    store[PROFILE] = { leaderboard: { optedIn: false, displayName: 'Ted', school: 'A' } };
    await setMySchool('u1', 'B');
    expect(store[PROFILE].leaderboard).toMatchObject({ optedIn: false, school: 'B' });
    expect(writesTo(`leaderboards/${weekId()}/entries/u1`)).toHaveLength(0);
    expect(writesTo('leaderboards/all-time/entries/u1')).toHaveLength(0);
  });

  it('touches no Arène registration', async () => {
    store[PROFILE] = { leaderboard: { optedIn: true, displayName: 'Ted', school: 'A' } };
    await setMySchool('u1', 'B');
    const paths = (setDoc as jest.Mock).mock.calls.map(([ref]) => ref.path);
    expect(paths.some((p: string) => p.startsWith('tournament'))).toBe(false);
  });

  it('returns null for a missing uid without writing', async () => {
    expect(await setMySchool('', 'B')).toBeNull();
    expect(setDoc).not.toHaveBeenCalled();
  });
});
