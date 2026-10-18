const DELETE = { __delete: true };
jest.mock('../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'u-1', getIdToken: jest.fn(() => Promise.resolve('tok')) },
    authStateReady: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteField: jest.fn(() => ({ __delete: true })),
  serverTimestamp: jest.fn(() => 'ts'),
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  increment: jest.fn(),
}));

import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { loadAvatar, saveAvatar, storedAvatarFor } from '../avatarService';
import { weekId } from '../leaderboardService';
import {
  defaultConfigFor, serializeConfig, type AvatarConfig,
} from '../../components/arena/art/avatars/avatarConfig';

const custom = (uid: string): AvatarConfig => {
  const d = defaultConfigFor(uid);
  return { ...d, hair: d.hair === 'afro' ? 'locs' : 'afro', glasses: 'round', presentation: 'fille' };
};

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
  (global as any).fetch = fetchMock;
});

describe('storedAvatarFor (the save payload)', () => {
  it('is null when the look is the seeded face', () => {
    expect(storedAvatarFor('u-1', defaultConfigFor('u-1'))).toBeNull();
    expect(storedAvatarFor('u-1', serializeConfig(defaultConfigFor('u-1')))).toBeNull();
  });
  it('is the wire string for a customised look', () => {
    const c = custom('u-1');
    expect(storedAvatarFor('u-1', c)).toBe(serializeConfig(c));
    expect(storedAvatarFor('u-1', c)).toMatch(/^1[0-9a-z]{16}$/);
  });
  it('is null for junk', () => {
    expect(storedAvatarFor('u-1', null)).toBeNull();
    expect(storedAvatarFor('u-1', '<script>' as any)).toBeNull();
  });
  it("one student's seeded face is a real choice for another", () => {
    const other = defaultConfigFor('u-2');
    if (serializeConfig(other) !== serializeConfig(defaultConfigFor('u-1'))) {
      expect(storedAvatarFor('u-1', other)).toBe(serializeConfig(other));
    }
  });
});

describe('saveAvatar', () => {
  it('deletes the field (and posts null) when saving the seeded face', async () => {
    const r = await saveAvatar('u-1', defaultConfigFor('u-1'));
    expect(r).toEqual({ avatar: null, propagated: true });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/u-1' },
      { avatar: DELETE, avatar_updated_at: 'ts' },
      { merge: true },
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ avatar: null });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('stores the wire string and falls back to the own entries when the endpoint 404s', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 404 }));
    const c = custom('u-1');
    const r = await saveAvatar('u-1', c);
    const wire = serializeConfig(c);
    expect(r).toEqual({ avatar: wire, propagated: true });
    expect((setDoc as jest.Mock).mock.calls[0][1].avatar).toBe(wire);
    const paths = (updateDoc as jest.Mock).mock.calls.map((call) => call[0].path).sort();
    expect(paths).toEqual([`leaderboards/${weekId()}/entries/u-1`, 'leaderboards/all-time/entries/u-1'].sort());
    for (const call of (updateDoc as jest.Mock).mock.calls) expect(call[1]).toEqual({ avatar: wire });
  });

  it('still succeeds offline (fetch throws, entry updates rejected)', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    (updateDoc as jest.Mock).mockImplementation(() => Promise.reject(new Error('no entry')));
    const r = await saveAvatar('u-1', custom('u-1'));
    expect(r.propagated).toBe(false);
    expect(r.avatar).toMatch(/^1[0-9a-z]{16}$/);
  });
});

describe('loadAvatar (sanitize on read)', () => {
  const snap = (data: any) => ({ exists: () => data != null, data: () => data });
  it('returns a valid stored wire string', async () => {
    const wire = serializeConfig(custom('u-1'));
    (getDoc as jest.Mock).mockResolvedValueOnce(snap({ avatar: wire }));
    expect(await loadAvatar('u-1')).toBe(wire);
  });
  it('drops junk and missing values to null (the seeded face)', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(snap({ avatar: '1zzzzzzzzzzzzzzzz' }));
    expect(await loadAvatar('u-1')).toBeNull();
    (getDoc as jest.Mock).mockResolvedValueOnce(snap({ avatar: 42 }));
    expect(await loadAvatar('u-1')).toBeNull();
    (getDoc as jest.Mock).mockResolvedValueOnce(snap(null));
    expect(await loadAvatar('u-1')).toBeNull();
  });
  it('re-serializes an object-shaped value through the whitelist', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(snap({ avatar: { hair: 'locs', skin: 999, evil: '<x>' } }));
    expect(await loadAvatar('u-1')).toMatch(/^1[0-9a-z]{16}$/);
  });
  it("never reads another student's doc", async () => {
    expect(await loadAvatar('someone-else')).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
