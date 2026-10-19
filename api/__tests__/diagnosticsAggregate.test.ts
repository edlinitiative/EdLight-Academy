import { FakeDb } from './helpers/fakeFirestore';
import {
  DIAG_COLLECTION,
  FATAL_SPIKE_THRESHOLD,
  __resetDiagnosticsBudgetForTests,
  alertAdminsOfError,
  dayKey,
  decideErrorAlert,
  groupErrors,
  readErrorSummaries,
  recordErrorAggregates,
} from '../_lib/diagnosticsAggregate';
import { sanitizeDiagnostic, type DiagnosticEvent } from '../../shared/telemetry';

jest.mock('../_lib/competitionNotify', () => ({ deliverCompetitionNotices: jest.fn().mockResolvedValue(undefined) }));

const NOW = Date.UTC(2026, 9, 19, 12);
const DAY = 86_400_000;

function event(over: Partial<DiagnosticEvent> & { detail?: any; context?: any } = {}): DiagnosticEvent {
  return sanitizeDiagnostic({
    type: 'error', name: 'uncaught_error', timestamp: NOW,
    error: { name: 'TypeError', frames: ['main.jsbundle:1:42'] },
    detail: { signature: 'deadbeef', errorKind: 'undefined_access', topFrame: 'main.jsbundle:1:42', screen: 'LessonDetail', fatal: false },
    context: { platform: 'ios', appVersion: '1.2.0', buildNumber: '61', updateId: 'upd-1', runtimeVersion: '1.2.0' },
    ...over,
  })!;
}
const fatal = (over: any = {}) => event({ name: 'js_fatal_crash', ...over, detail: { ...event().detail, fatal: true, previousSession: true, ...over.detail } });

beforeEach(() => __resetDiagnosticsBudgetForTests());

it('groups a batch by signature and ignores events without a valid signature', () => {
  const groups = groupErrors([
    event(), event({ context: { platform: 'android' } }), fatal(),
    event({ detail: { signature: 'not-a-sig' } }), sanitizeDiagnostic({ type: 'event', name: 'x', timestamp: 1 })!,
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toEqual(expect.objectContaining({
    signature: 'deadbeef', count: 3, fatalCount: 1, platforms: { ios: 2, android: 1 }, eventName: 'js_fatal_crash',
  }));
});

it('alert rule: new fatal signature alerts at once, a known one only at the spike threshold, never twice', () => {
  expect(decideErrorAlert({ fatalCount: 1, alreadyAlerted: false, seenBefore: false })).toBe(true);
  expect(decideErrorAlert({ fatalCount: 1, alreadyAlerted: false, seenBefore: true })).toBe(false);
  expect(decideErrorAlert({ fatalCount: FATAL_SPIKE_THRESHOLD, alreadyAlerted: false, seenBefore: true })).toBe(true);
  expect(decideErrorAlert({ fatalCount: 9, alreadyAlerted: true, seenBefore: false })).toBe(false);
  expect(decideErrorAlert({ fatalCount: 0, alreadyAlerted: false, seenBefore: false })).toBe(false);
});

it('writes one bounded doc per signature per day and accumulates counts', async () => {
  const db = new FakeDb();
  const send = jest.fn().mockResolvedValue(undefined);
  await recordErrorAggregates(db as any, [event(), event()], NOW, send);
  await recordErrorAggregates(db as any, [event({ context: { platform: 'web', release: 'abcdef1234' } })], NOW + 1000, send);
  const doc = db.store.get(`${DIAG_COLLECTION}/${dayKey(NOW)}_deadbeef`)!;
  expect(doc).toEqual(expect.objectContaining({
    signature: 'deadbeef', day: '20261019', count: 3, fatalCount: 0, platforms: { ios: 2, web: 1 },
    errorName: 'TypeError', errorKind: 'undefined_access', topFrame: 'main.jsbundle:1:42', screen: 'LessonDetail',
    firstSeen: NOW, lastSeen: NOW + 1000, alertedAt: null,
  }));
  expect(doc.last).toEqual({ platform: 'web', release: 'abcdef1234' });
  expect(send).not.toHaveBeenCalled();
  // Nothing personal can be stored: only these keys exist.
  expect(Object.keys(doc).sort()).toEqual(['alertedAt', 'count', 'day', 'errorKind', 'errorName', 'eventName',
    'fatalCount', 'firstSeen', 'last', 'lastSeen', 'platforms', 'screen', 'signature', 'topFrame']);
});

it('alerts a new fatal signature once per day, again the next day only if it spikes', async () => {
  const db = new FakeDb();
  const send = jest.fn().mockResolvedValue(undefined);
  await recordErrorAggregates(db as any, [fatal()], NOW, send);
  await recordErrorAggregates(db as any, [fatal(), fatal()], NOW + 60_000, send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toEqual({ signature: 'deadbeef', day: '20261019', title: expect.stringMatching(/^Crash TypeError · undefined_access · ios 1\.2\.0 \(61\)/) });

  // Next day: known signature → no alert until the spike threshold.
  const tomorrow = NOW + DAY;
  for (let i = 1; i < FATAL_SPIKE_THRESHOLD; i++) await recordErrorAggregates(db as any, [fatal()], tomorrow + i, send);
  expect(send).toHaveBeenCalledTimes(1);
  await recordErrorAggregates(db as any, [fatal()], tomorrow + 99, send);
  expect(send).toHaveBeenCalledTimes(2);
  await recordErrorAggregates(db as any, [fatal(), fatal()], tomorrow + 120, send);
  expect(send).toHaveBeenCalledTimes(2);
});

it('a failing alert or write never throws into the request', async () => {
  const db = new FakeDb();
  const send = jest.fn().mockRejectedValue(new Error('push down'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(recordErrorAggregates(db as any, [fatal()], NOW, send)).resolves.toEqual({ written: 1, alerted: 0 });
  jest.restoreAllMocks();
});

it('delivers the alert as an admin inbox item + push, only to admins', async () => {
  const db = new FakeDb();
  db.store.set('users/admin1', { role: 'admin' });
  db.store.set('users/student1', { role: 'student' });
  const { deliverCompetitionNotices } = jest.requireMock('../_lib/competitionNotify');
  await alertAdminsOfError(db as any, { signature: 'deadbeef', day: '20261019', title: 'Crash TypeError' }, NOW);
  expect(db.store.get('users/admin1/competitionInbox/diag_20261019_deadbeef')).toEqual(expect.objectContaining({
    action: 'error_spike', targetKind: 'diagnostic', targetId: 'deadbeef', read: false,
  }));
  expect(db.store.has('users/student1/competitionInbox/diag_20261019_deadbeef')).toBe(false);
  expect(deliverCompetitionNotices).toHaveBeenCalledWith(db, [expect.objectContaining({ uid: 'admin1', action: 'error_spike' })], 'system_diagnostics');
});

it('summaries fold days per signature, newest first, within the requested window', async () => {
  const db = new FakeDb();
  const send = jest.fn().mockResolvedValue(undefined);
  await recordErrorAggregates(db as any, [event()], NOW - 10 * DAY, send);
  await recordErrorAggregates(db as any, [event()], NOW - DAY, send);
  await recordErrorAggregates(db as any, [event({ detail: { signature: 'cafebabe' } })], NOW, send);
  await recordErrorAggregates(db as any, [event()], NOW + 5, send);
  const rows = await readErrorSummaries(db as any, NOW + 10, 7);
  expect(rows.map((r) => r.signature)).toEqual(['deadbeef', 'cafebabe']);
  expect(rows[0]).toEqual(expect.objectContaining({ count: 2, days: 2, lastSeen: NOW + 5 }));
  expect((await readErrorSummaries(db as any, NOW + 10, 30))[0].count).toBe(3);
});
