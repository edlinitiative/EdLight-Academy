/**
 * Account isolation + best-effort profile sync, with Firebase mocked out.
 */
jest.mock('../../services/firebase', () => ({
  upsertUserDocument: jest.fn(),
  getUserProfile: jest.fn(),
  updateUserGrade: jest.fn(),
}));
jest.mock('../../services/masterySync', () => ({ stopMasterySync: jest.fn() }));
jest.mock('../../services/sandraService', () => ({ writeConvId: jest.fn(() => Promise.resolve()) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../../contexts/store';
import * as firebase from '../../services/firebase';
import { stopMasterySync } from '../../services/masterySync';
import { queryClient } from '../queryClient';
import { queryKeys } from '../queryKeys';
import {
  clearStudentSession,
  syncProfile,
  getProfileSyncState,
  markProfileSynced,
  syncGradeAndTrack,
  sessionGuard,
  installAccountIsolation,
} from '../session';
import { shouldPersist } from '../../services/queryPersistence';

const upsert = firebase.upsertUserDocument as jest.Mock;
const getProfile = firebase.getUserProfile as jest.Mock;

function signInStore(uid: string) {
  useStore.getState().setUser({ uid, name: '', email: '', picture: '' });
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  useStore.getState().logout();
});

describe('clearStudentSession', () => {
  it('drops student state, keeps device preferences, and clears both caches', async () => {
    signInStore('A');
    const s = useStore.getState();
    s.setLanguage('fr');
    s.setTheme('dark');
    s.setLanguageChosen(true);
    s.setTourCompleted(true);
    s.setGrade('NS3');
    s.setGradeChosen(true);
    s.recordActivity({ type: 'lesson', path: '/x', title: 'L', ts: 1 });
    s.updateProgress('v1', { done: true });
    queryClient.setQueryData(queryKeys.streak('A'), { currentStreak: 9 });
    queryClient.setQueryData(['coursesData'], [1]);
    await AsyncStorage.setItem('edlight:queryCache:v1', '[]');

    clearStudentSession('account-switch');

    const after = useStore.getState();
    expect(after.user).toBeNull();
    expect(after.isAuthenticated).toBe(false);
    expect(after.grade).toBeNull();
    expect(after.gradeChosen).toBe(false);
    expect(after.progress).toEqual({});
    expect(after.lastActivity).toBeNull();
    // device prefs survive
    expect(after.language).toBe('fr');
    expect(after.theme).toBe('dark');
    expect(after.languageChosen).toBe(true);
    expect(after.tourCompleted).toBe(true);

    expect(queryClient.getQueryData(queryKeys.streak('A'))).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(stopMasterySync).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(await AsyncStorage.getItem('edlight:queryCache:v1')).toBeNull();
  });
});

describe('installAccountIsolation', () => {
  it('clears the query cache when the store account moves away (direct logout path)', () => {
    const off = installAccountIsolation();
    signInStore('A');
    queryClient.setQueryData(queryKeys.streak('A'), { currentStreak: 3 });
    useStore.getState().logout();
    expect(queryClient.getQueryData(queryKeys.streak('A'))).toBeUndefined();
    off();
  });

  it('does not clear on null → A (rehydration / guest sign-in)', () => {
    const off = installAccountIsolation();
    queryClient.setQueryData(['coursesData'], [1]);
    signInStore('A');
    expect(queryClient.getQueryData(['coursesData'])).toEqual([1]);
    off();
  });
});

describe('syncProfile', () => {
  it('records failure without throwing, then succeeds on retry', async () => {
    upsert.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(syncProfile({ uid: 'P1' })).resolves.toBeUndefined();
    expect(getProfileSyncState()).toMatchObject({ uid: 'P1', status: 'failed', failures: 1 });

    upsert.mockResolvedValueOnce(undefined);
    await syncProfile({ uid: 'P1' }, { force: true });
    expect(getProfileSyncState()).toMatchObject({ uid: 'P1', status: 'synced', failures: 0 });
  });

  it('a slow result for a previous account does not overwrite the new account state', async () => {
    let resolveA: () => void = () => {};
    upsert.mockImplementationOnce(() => new Promise<void>((r) => { resolveA = r; }));
    const pendingA = syncProfile({ uid: 'SA' });
    expect(getProfileSyncState()).toMatchObject({ uid: 'SA', status: 'pending' });

    upsert.mockRejectedValueOnce(new Error('offline'));
    await syncProfile({ uid: 'SB' });
    resolveA();
    await pendingA;
    expect(getProfileSyncState()).toMatchObject({ uid: 'SB', status: 'failed' });
  });

  it('skips when an explicit sign-in already synced', async () => {
    markProfileSynced('M1');
    await syncProfile({ uid: 'M1' });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('syncGradeAndTrack', () => {
  it('ignores a profile read that returns after the account changed', async () => {
    signInStore('G1');
    const token = sessionGuard.begin('G1');
    let resolve: (v: any) => void = () => {};
    getProfile.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const p = syncGradeAndTrack('G1', token);

    sessionGuard.begin('G2');
    useStore.getState().logout();
    signInStore('G2');
    resolve({ grade: 'NS4', track: 'SVT' });
    await p;

    expect(useStore.getState().grade).toBeNull();
    expect(useStore.getState().track).toBeNull();
  });

  it('restores the server grade for the current account', async () => {
    signInStore('G3');
    const token = sessionGuard.begin('G3');
    getProfile.mockResolvedValueOnce({ grade: 'NS2' });
    await syncGradeAndTrack('G3', token);
    expect(useStore.getState().grade).toBe('NS2');
    expect(useStore.getState().gradeChosen).toBe(true);
  });
});

describe('shouldPersist', () => {
  it('persists whitelisted keys only for their owner', () => {
    expect(shouldPersist(queryKeys.streak('A'), 'A')).toBe(true);
    expect(shouldPersist(queryKeys.streak('A'), 'B')).toBe(false);
    expect(shouldPersist(queryKeys.streak('A'), null)).toBe(false);
    expect(shouldPersist(['leaderboard-weekly', 'w', 25], null)).toBe(true);
    // not whitelisted
    expect(shouldPersist(['coursesData'], 'A')).toBe(false);
  });
});
