/**
 * The automatic championship pushes (api/arena/_announce.ts): who gets them,
 * in which language, and — the load-bearing part — that a retry can never
 * send them twice.
 */
import { FakeDb } from './helpers/fakeFirestore';
import type { Firestore } from 'firebase-admin/firestore';

const mockExpoPush = jest.fn(async (..._args: unknown[]) => ({ sent: 1, pruned: 0, failed: 0 }));
const mockWebPush = jest.fn(async (..._args: unknown[]) => ({ sent: 1 }));
jest.mock('../_lib/expoPush', () => ({
  sendExpoPushToUser: (...args: unknown[]) => mockExpoPush(...args),
}));
jest.mock('../_lib/push', () => ({
  isPushConfigured: () => true,
  sendPushToUser: (...args: unknown[]) => mockWebPush(...args),
}));
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}));

import { announceArena, arenaPushCopy, formatArenaDate } from '../arena/_announce';

const NOW = Date.UTC(2026, 9, 20, 15, 0); // Tue 20 Oct 2026, 11:00 in Haiti (EDT, UTC-4)
const STARTS = Date.UTC(2026, 9, 24, 22, 0); // Sat 24 Oct, 18:00 Haiti
const fake = new FakeDb();
const db = fake as unknown as Firestore;

beforeEach(() => {
  fake.store.clear();
  mockExpoPush.mockClear();
  mockWebPush.mockClear();
  fake.store.set('tournaments/oct-2026', {
    title: 'Championnat d’octobre',
    titleHt: 'Chanpyona oktòb',
    state: 'registration',
    startsAt: STARTS,
  });
  // app user, French
  fake.store.set('users/app', { expoPushTokens: ['ExponentPushToken[a]'] });
  // web user, Kreyòl
  fake.store.set('users/web', { language: 'ht' });
  fake.store.set('users/web/pushSubscriptions/s1', { endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' } });
  // opted out of championship pushes
  fake.store.set('users/quiet', { expoPushTokens: ['ExponentPushToken[q]'] });
  fake.store.set('users/quiet/settings/notifications', { arenaAnnouncements: false });
  // no device at all — never read further
  fake.store.set('users/nodevice', {});
});

const pushedTo = () => [...new Set([...mockExpoPush.mock.calls, ...mockWebPush.mock.calls].map((c) => c[0]))];

describe('announcement push', () => {
  it('reaches every user with a device except those who opted out, with a typed /arena payload', async () => {
    const out = await announceArena(db, 'oct-2026', 'announced', NOW);
    expect(out).toMatchObject({ claimed: true, audience: 3, optedOut: 1, pushed: 2, truncated: false });
    expect(new Set(pushedTo())).toEqual(new Set(['app', 'web']));
    const [, message] = mockExpoPush.mock.calls.find((c) => c[0] === 'app')!;
    expect(message).toMatchObject({
      title: 'Un nouveau championnat est annoncé !',
      data: { type: 'arena', kind: 'announced', tournamentId: 'oct-2026', path: '/arena' },
    });
    const [, web] = mockWebPush.mock.calls.find((c) => c[0] === 'web')!;
    expect(web).toMatchObject({ title: 'Yo anonse yon nouvo chanpyona !', url: '/arena' });
    expect((web as { body: string }).body).toContain('Chanpyona oktòb');
  });

  it('is claimed once: a retry or a second run sends nothing', async () => {
    await announceArena(db, 'oct-2026', 'announced', NOW);
    const calls = mockExpoPush.mock.calls.length + mockWebPush.mock.calls.length;
    const again = await announceArena(db, 'oct-2026', 'announced', NOW + 1000);
    expect(again.claimed).toBe(false);
    expect(mockExpoPush.mock.calls.length + mockWebPush.mock.calls.length).toBe(calls);
    expect(fake.store.get('tournaments/oct-2026')).toMatchObject({
      announcedPushAt: { ms: NOW },
      announcedPush: { audience: 3, pushed: 2, optedOut: 1 },
    });
  });

  it('does nothing for a tournament that does not exist', async () => {
    expect((await announceArena(db, 'missing', 'announced', NOW)).claimed).toBe(false);
    expect(pushedTo()).toEqual([]);
  });
});

describe('doors-open push', () => {
  it('goes only to registered players, is separate from the announcement, and is claimed once', async () => {
    fake.store.set('tournaments/oct-2026/players/app', { schoolKey: 's' });
    fake.store.set('tournaments/oct-2026/players/quiet', { schoolKey: 's' });
    await announceArena(db, 'oct-2026', 'announced', NOW);
    mockExpoPush.mockClear();
    mockWebPush.mockClear();

    const doorsAt = STARTS - 10 * 60_000;
    const out = await announceArena(db, 'oct-2026', 'doors', doorsAt);
    expect(out).toMatchObject({ claimed: true, audience: 2, optedOut: 1, pushed: 1 });
    expect(pushedTo()).toEqual(['app']);
    expect(mockExpoPush.mock.calls[0][1]).toMatchObject({
      title: 'L’Arène ouvre ses portes !',
      body: expect.stringContaining('commence dans 10 minutes'),
      data: { type: 'arena', kind: 'doors' },
    });
    expect((await announceArena(db, 'oct-2026', 'doors', doorsAt)).claimed).toBe(false);
    expect(pushedTo()).toEqual(['app']);
  });
});

describe('copy', () => {
  it('formats the date on the Haiti clock, in French and Kreyòl', () => {
    expect(formatArenaDate(STARTS, false)).toBe('samedi 24 octobre à 18h');
    expect(formatArenaDate(STARTS, true)).toBe('samdi 24 oktòb a 18è');
    expect(formatArenaDate(STARTS + 30 * 60_000, true)).toBe('samdi 24 oktòb a 18è30');
  });

  it('names the tournament and the date, never anything about the reader', () => {
    const t = { title: 'Coupe', titleHt: 'Koup', startsAt: STARTS };
    expect(arenaPushCopy('announced', t, false, NOW).body).toBe(
      'Coupe — samedi 24 octobre à 18h. Inscris ton école dans l’Arène.',
    );
    expect(arenaPushCopy('announced', t, true, NOW).body).toBe(
      'Koup — samdi 24 oktòb a 18è. Enskri lekòl ou nan Arèn nan.',
    );
    expect(arenaPushCopy('doors', t, true, STARTS - 5 * 60_000).body).toContain('ap kòmanse nan 5 minit');
    expect(arenaPushCopy('doors', t, false, STARTS + 1000).body).toBe('Coupe commence maintenant. Entre dans l’Arène.');
  });
});
