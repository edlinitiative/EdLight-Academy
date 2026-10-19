import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

jest.mock('../../contexts/store', () => {
  const state = { user: null };
  const useStore: any = () => state;
  useStore.getState = () => state;
  return { __esModule: true, default: useStore, waitForStoreHydration: () => Promise.resolve() };
});

// eslint-disable-next-line import/first
import { hydrateQueryCache } from '../queryPersistence';

describe('query cache hydration (startup is no longer always blocked on it)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('seeds a cold cache from disk', async () => {
    await AsyncStorage.setItem('edlight:queryCache:v1', JSON.stringify([{ key: ['leaderboard-weekly'], data: ['old'], updatedAt: Date.now() - 1000 }]));
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await hydrateQueryCache(qc);
    expect(qc.getQueryData(['leaderboard-weekly'])).toEqual(['old']);
  });

  it('never overwrites fresher data a screen already fetched', async () => {
    await AsyncStorage.setItem('edlight:queryCache:v1', JSON.stringify([{ key: ['leaderboard-weekly'], data: ['old'], updatedAt: Date.now() - 60_000 }]));
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    qc.setQueryData(['leaderboard-weekly'], ['fresh']);
    await hydrateQueryCache(qc);
    expect(qc.getQueryData(['leaderboard-weekly'])).toEqual(['fresh']);
  });
});
