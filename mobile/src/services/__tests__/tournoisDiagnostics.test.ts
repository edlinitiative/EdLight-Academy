jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('tok') } } }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('../telemetry', () => ({ trackEvent: jest.fn() }));

import { trackEvent } from '../telemetry';
import { answerRound, joinTournament, startRound } from '../tournoisService';
import { sanitizeDiagnostic } from '../../../../shared/telemetry';

const track = trackEvent as jest.Mock;
const fetchMock = jest.fn();
const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
const named = (name: string) => track.mock.calls.filter(([n]) => n === name).map(([, d]) => d);

beforeEach(() => {
  fetchMock.mockReset();
  track.mockReset();
  (global as any).fetch = fetchMock;
});

describe('tournament attempt diagnostics (app)', () => {
  it('emits attempt, receipt, recovery and failure events with technical fields only', async () => {
    respond(200, { ok: true, round: 0, pos: 0, count: 8, done: false });
    await startRound('tid_secret');
    respond(200, { ok: true, recorded: true, duplicate: false, done: false });
    await answerRound('tid_secret', 0, 0, 2);
    respond(200, { ok: true, round: 0, pos: 1, count: 8, done: false });
    await startRound('tid_secret'); // app restarted: the server still holds the attempt
    respond(409, { error: 'full' });
    await joinTournament({ pin: '482913' }, { displayName: 'Ana', school: 'Lycee' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://academy.edlight.org/api/tournois/play');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(named('tournament_attempt_started')[0]).toMatchObject({ phase: 'round', round: 0, total: 8 });
    expect(named('tournament_answer_receipt')[0]).toMatchObject({ phase: 'round', round: 0, outcome: 'accepted' });
    expect(named('tournament_attempt_recovered')[0]).toMatchObject({ count: 1, recovered: true });
    expect(named('tournament_join_result')[0]).toMatchObject({ outcome: 'failed', errorCode: 'full' });
    expect(named('critical_request_started').every((d) => d.flow === 'tournois')).toBe(true);

    expect(JSON.stringify(track.mock.calls)).not.toMatch(/tid_secret|482913|Ana|Lycee|tok|academy\.edlight/);
    for (const [name, detail] of track.mock.calls) {
      expect(sanitizeDiagnostic({ type: 'event', name, timestamp: 1, detail })?.detail).toEqual(detail);
    }
  });
});
