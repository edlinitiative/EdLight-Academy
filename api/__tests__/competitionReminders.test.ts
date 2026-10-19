import { FakeDb } from './helpers/fakeFirestore';
import type { Firestore } from 'firebase-admin/firestore';
const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));
const mockExpoPush = jest.fn(async (..._args: unknown[]) => ({
  sent: 1,
  pruned: 0,
  failed: 0,
}));
const mockWebPush = jest.fn(async (..._args: unknown[]) => ({}));
jest.mock('../_lib/expoPush', () => ({
  sendExpoPushToUser: (...args: unknown[]) => mockExpoPush(...args),
}));
jest.mock('../_lib/push', () => ({
  isPushConfigured: () => true,
  sendPushToUser: (...args: unknown[]) => mockWebPush(...args),
}));
import { mutateCompetition } from '../_lib/competition';
import { sweepReminders } from '../_lib/competitionReminders';
import { pushCopy } from '../../shared/competition/notifications';

const now = 1792340000000;
const MIN = 60000;
const HOUR = 60 * MIN;
let sequence = 0;
const db = mockDb as unknown as Firestore;
const mutate = (
  uid: string,
  action: string,
  values: Record<string, unknown> = {},
  at = now,
) =>
  mutateCompetition(
    db,
    uid,
    uid,
    { action, operationId: `operation_${++sequence}`, ...values },
    at,
  );
const doc = (path: string) => mockDb.store.get(path)!;
const reminders = () =>
  Object.fromEntries(
    mockDb.childrenOf('competitionReminders').map(([p, d]) => [p.split('/')[1], d]),
  );
const pushedTo = () =>
  mockExpoPush.mock.calls.map((call) => call[0] as string).sort();
async function createEvent(
  startsIn: number,
  closesIn: number,
  more: Record<string, unknown> = {},
  format = 'window',
) {
  const created = await mutate('host', 'event-save', {
    config: {
      title: 'Coupe pilote',
      description: '',
      format,
      visibility: 'public',
      teamRule: 'solo',
      categories: ['maths_eclair'],
      questionCount: 5,
      secondsPerQuestion: 20,
      startsAt: now + startsIn,
      windowHours: 1,
      maxPlayers: 30,
    },
    entryMode: 'individual',
    audience: 'public',
    delivery: 'online',
    registrationClosesAt: now + closesIn,
    ...more,
  });
  await mutate('host', 'event-publish', {
    eventId: created.eventId,
    revision: 1,
  });
  return String(created.eventId);
}
beforeEach(() => {
  mockDb.store.clear();
  mockExpoPush.mockClear();
  mockWebPush.mockClear();
  process.env.COMPETITION_CREATION_ENABLED = 'true';
  for (const uid of ['a', 'b', 'c', 'd', 'host'])
    mockDb.store.set(`users/${uid}`, { displayName: uid });
});
afterAll(() => {
  delete process.env.COMPETITION_CREATION_ENABLED;
});

it('publishing queues reminders at the right times, with no person or score in the row', async () => {
  const eventId = await createEvent(3 * HOUR, 150 * MIN);
  expect(reminders()).toEqual({
    [`${eventId}_start_60`]: {
      eventId,
      kind: 'start_60',
      dueAt: now + 2 * HOUR,
      targetAt: now + 3 * HOUR,
      revision: 2,
    },
    // Too close for the 24 h nudge: the 2 h one instead.
    [`${eventId}_registration_closing`]: {
      eventId,
      kind: 'registration_closing',
      dueAt: now + 30 * MIN,
      targetAt: now + 150 * MIN,
      revision: 2,
    },
  });
  const live = await createEvent(48 * HOUR, 30 * HOUR, {}, 'live');
  expect(reminders()[`${live}_start_10`].dueAt).toBe(now + 48 * HOUR - 10 * MIN);
  expect(reminders()[`${live}_registration_closing`].dueAt).toBe(now + 6 * HOUR);
  // Starting within the hour: no reminder whose "in 1 hour" would already be false.
  const soon = await createEvent(30 * MIN, 20 * MIN);
  expect(Object.keys(reminders()).filter((k) => k.startsWith(soon))).toEqual([]);
});

it('postponing reschedules and cancelling removes every reminder', async () => {
  const eventId = await createEvent(3 * HOUR, 150 * MIN, {}, 'live');
  await mutate('host', 'event-postpone', { eventId, startsAt: now + 30 * HOUR });
  const rows = reminders();
  expect(rows[`${eventId}_start_60`]).toMatchObject({
    dueAt: now + 29 * HOUR,
    targetAt: now + 30 * HOUR,
    revision: 3,
  });
  expect(rows[`${eventId}_start_10`].dueAt).toBe(now + 30 * HOUR - 10 * MIN);
  // Postponing reopens registration until the new start.
  expect(rows[`${eventId}_registration_closing`]).toMatchObject({
    dueAt: now + 6 * HOUR,
    targetAt: now + 30 * HOUR,
  });
  await mutate('host', 'event-cancel', { eventId });
  expect(reminders()).toEqual({});
});

it('sends each reminder once, to the right people only, honoring opt-outs', async () => {
  const eventId = await createEvent(3 * HOUR, 150 * MIN);
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  await mutate('b', 'roster-save', { eventId });
  await mutate('c', 'roster-save', { eventId });
  await mutate('d', 'event-follow', { eventId, follow: true });
  mockDb.store.set('users/c/settings/notifications', { competitionUpdates: false });
  mockExpoPush.mockClear();

  // Registration nudge: only the unregistered drafts, never the registered entry or a follower.
  expect(await sweepReminders(db, now + 30 * MIN)).toMatchObject({ due: 1, sent: 1 });
  expect(pushedTo()).toEqual(['b']);
  expect(doc(`users/c/competitionInbox/entry_${eventId}_c`)).toMatchObject({
    action: 'registration_closing',
    read: false,
  });
  expect(doc(`users/a/competitionInbox/entry_${eventId}_a`).action).toBe('registered');
  expect(doc(`users/d/competitionInbox/follow_${eventId}`).action).toBe('following');
  await sweepReminders(db, now + 31 * MIN);
  expect(pushedTo()).toEqual(['b']);

  // Start reminder: registered starters by push, followers in the inbox only.
  mockExpoPush.mockClear();
  expect(await sweepReminders(db, now + 2 * HOUR)).toMatchObject({ due: 1, sent: 1 });
  expect(pushedTo()).toEqual(['a']);
  expect(doc(`users/a/competitionInbox/entry_${eventId}_a`).action).toBe('event_starting');
  expect(doc(`users/d/competitionInbox/follow_${eventId}`)).toMatchObject({
    action: 'event_starting',
    targetKind: 'event',
    read: false,
  });
  expect(doc(`users/b/competitionInbox/entry_${eventId}_b`).action).toBe(
    'registration_closing',
  );
  const [, payload] = mockExpoPush.mock.calls[0] as [string, any];
  expect(payload).toMatchObject({
    body: pushCopy('event_starting', 'Coupe pilote', false).body,
    data: { type: 'competition', action: 'event_starting', targetKind: 'event', targetId: eventId },
  });
  expect(JSON.stringify(mockExpoPush.mock.calls)).not.toMatch(/score/i);
  expect(reminders()).toEqual({});
  await sweepReminders(db, now + 2 * HOUR + MIN);
  expect(pushedTo()).toEqual(['a']);
});

it('drops stale and overdue reminders instead of sending them', async () => {
  const stale = await createEvent(3 * HOUR, 150 * MIN);
  await mutate('a', 'roster-save', { eventId: stale });
  await mutate('a', 'entry-register', { eventId: stale, entryId: 'a' });
  // The schedule moved without the queue (e.g. an old row): it no longer matches.
  doc(`competitionEvents/${stale}`).config.startsAt = now + 4 * HOUR;
  mockExpoPush.mockClear();
  // (The registration nudge is due too but has nobody left to nudge.)
  expect(await sweepReminders(db, now + 2 * HOUR)).toMatchObject({ due: 2, stale: 1 });
  expect(pushedTo()).toEqual([]);
  expect(reminders()[`${stale}_start_60`]).toBeUndefined();

  const late = await createEvent(3 * HOUR, 150 * MIN);
  await mutate('b', 'roster-save', { eventId: late });
  await mutate('b', 'entry-register', { eventId: late, entryId: 'b' });
  mockExpoPush.mockClear();
  // The cron was down: "in 1 hour" with 20 minutes left would be false, so nothing goes out.
  expect(await sweepReminders(db, now + 3 * HOUR - 20 * MIN)).toMatchObject({
    overdue: 2,
    sent: 0,
  });
  expect(pushedTo()).toEqual([]);
  expect(reminders()).toEqual({});
});

it('approval events nudge only approved drafts', async () => {
  const eventId = await createEvent(3 * HOUR, 150 * MIN, { entryPolicy: 'approval' });
  await mutate('a', 'roster-save', { eventId });
  await mutate('b', 'roster-save', { eventId });
  await mutate('host', 'entry-approve', { eventId, entryId: 'a', approve: true });
  mockExpoPush.mockClear();
  await sweepReminders(db, now + 30 * MIN);
  expect(pushedTo()).toEqual(['a']);
});
