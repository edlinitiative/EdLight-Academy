jest.mock('../firebase', () => ({ db: {}, getIdToken: jest.fn().mockResolvedValue('tok') }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

import { trackEvent } from '../../utils/telemetry';
import { answerRound, cancelTournament, joinTournament, liveAnswer, reviewAnswers, startRound, tick } from '../tournoisService';
import { sanitizeDiagnostic } from '../../../shared/telemetry';

const track = trackEvent as jest.Mock;
const fetchMock = jest.fn();
const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
const named = (name: string) => track.mock.calls.filter(([n]) => n === name).map(([, d]) => d);
// Private values the requests carry; none may reach a diagnostic.
const PRIVATE = /tid_secret|482913|Ana|Lycee|tok|\/api|choice/;

beforeEach(() => {
  fetchMock.mockReset();
  track.mockReset();
  (global as any).fetch = fetchMock;
});
afterEach(() => {
  expect(JSON.stringify(track.mock.calls)).not.toMatch(PRIVATE);
  // Every emitted field survives the shared filter: nothing silently dropped.
  for (const [name, detail] of track.mock.calls) {
    expect(sanitizeDiagnostic({ type: 'event', name, timestamp: 1, detail })?.detail).toEqual(detail);
  }
});

describe('tournament attempt diagnostics (web)', () => {
  it('routes requests through the observed transport with the bearer token unchanged', async () => {
    respond(200, { ok: true, round: 0, pos: 0, count: 10, done: false });
    await startRound('tid_secret');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tournois/play');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(named('critical_request_succeeded')[0]).toMatchObject({ flow: 'tournois', step: 'play', httpStatus: 200 });
    expect(named('tournament_attempt_started')[0]).toMatchObject({ phase: 'round', round: 0, total: 10 });
  });

  it('reports a resume from the server-held attempt as a recovery', async () => {
    respond(200, { ok: true, round: 1, pos: 4, count: 10, done: false });
    await startRound('tid_secret');
    expect(named('tournament_attempt_recovered')[0]).toMatchObject({ phase: 'round', round: 1, count: 4, total: 10, recovered: true });
    expect(named('tournament_attempt_started')).toHaveLength(0);
  });

  it('classifies answer receipts without correctness', async () => {
    respond(200, { ok: true, recorded: true, duplicate: false, done: false, pos: 1 });
    respond(200, { ok: true, recorded: false, duplicate: true, done: true });
    respond(200, { ok: true, recorded: false, duplicate: false });
    respond(409, { error: 'answers_closed' });
    for (let i = 0; i < 4; i++) await answerRound('tid_secret', 2, i, 3);
    expect(named('tournament_answer_receipt').map((d) => [d.outcome, d.status])).toEqual([
      ['accepted', 'open'], ['duplicate', 'finished'], ['rejected', 'open'], ['late', undefined],
    ]);
    expect(named('tournament_answer_receipt').every((d) => d.round === 2 && d.phase === 'round')).toBe(true);
  });

  it('reports failures with a bounded server code, including network and malformed codes', async () => {
    respond(403, { error: 'not_joined' });
    await answerRound('tid_secret', 0, 0, 1);
    fetchMock.mockRejectedValueOnce(new Error('offline Ana'));
    await liveAnswer('tid_secret', 3, 1, 5);
    respond(500, { error: 'Something Private <script>' });
    await startRound('tid_secret');
    expect(named('tournament_attempt_failed').map((d) => [d.action, d.errorCode])).toEqual([
      ['answer', 'not_joined'], ['live_answer', 'network'], ['start', 'unknown'],
    ]);
  });

  it('reports live receipts, results, joins and cancellations', async () => {
    respond(200, { ok: true, recorded: true, duplicate: false });
    await liveAnswer('tid_secret', 0, 2, 5);
    respond(200, { ok: true, items: [{ q: 'Ana?' }, { q: 'Lycee?' }] });
    await reviewAnswers('tid_secret', 1);
    respond(200, { tid: 'tid_secret', already: true });
    await joinTournament({ pin: '482913' }, { displayName: 'Ana', school: 'Lycee' });
    respond(409, { error: 'closed' });
    await joinTournament({ tid: 'tid_secret' }, { displayName: 'Ana' });
    respond(200, { ok: true });
    await cancelTournament('tid_secret');
    expect(named('tournament_answer_receipt')[0]).toEqual({ phase: 'live', outcome: 'accepted', durationMs: expect.any(Number) });
    expect(named('tournament_result_viewed')[0]).toEqual({ phase: 'round', round: 1, count: 2, durationMs: expect.any(Number) });
    expect(named('tournament_join_result').map((d) => [d.outcome, d.errorCode])).toEqual([['already', undefined], ['failed', 'closed']]);
    expect(named('tournament_cancel_result')[0]).toMatchObject({ outcome: 'confirmed' });
  });

  it('observes the spectator tick too', async () => {
    respond(200, { serverNow: 42 });
    expect(await tick('tid_secret')).toBe(42);
    expect(named('critical_request_started')[0]).toMatchObject({ flow: 'tournois', step: 'tick' });
  });
});
