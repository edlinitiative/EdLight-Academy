/**
 * Native tournament creation sends the web wizard's contract
 * (shared/tournois/creationInput.creationPayload) and refuses, without a
 * request, anything the server's own validator would refuse.
 */
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('tok') } } }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('../telemetry', () => ({ trackEvent: jest.fn() }));

import { createFromDraft, checkCreation, TOURNAMENT_CATEGORY_IDS } from '../tournoisService';
import {
  creationPayload,
  defaultDraft,
  parseLocalDateTime,
  quickDraft,
  type TournamentDraft,
} from '../../../../shared/tournois/creationInput';
import { validateTournamentInput } from '../../../../shared/tournois/config';
import { TRIVIA_CATEGORIES as WEB_CATEGORIES } from '../../../../src/data/triviaData';

const NOW = new Date(2026, 9, 19, 9, 0, 0, 0).getTime();
const WEB_ALLOWED = WEB_CATEGORIES.map((c) => c.id);
const who = { displayName: 'Ana', school: 'Lycée Pétion', grade: 'NS3' };

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, tid: 't_abcdef', pin: '482913', creatorJoined: true }),
  });
  (global as any).fetch = fetchMock;
});

const draft = (patch: Partial<TournamentDraft>): TournamentDraft => ({
  ...defaultDraft(NOW),
  title: 'Défi NS3 du vendredi',
  ...patch,
});

async function sent(d: TournamentDraft) {
  const res = await createFromDraft(d, who, NOW);
  expect(res.ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://academy.edlight.org/api/tournois/create');
  expect(init.headers.Authorization).toBe('Bearer tok');
  return { res, body: JSON.parse(init.body) as Record<string, unknown> };
}

/** What the web wizard would POST for the same draft (JSON drops undefined). */
const webBody = (d: TournamentDraft) => JSON.parse(JSON.stringify(creationPayload(d)));

describe('native tournament creation payload', () => {
  it('offers exactly the categories the API accepts', () => {
    expect([...TOURNAMENT_CATEGORY_IDS]).toEqual(WEB_ALLOWED);
  });

  it('private PIN room: same body as the web, accepted by the server validator', async () => {
    const d = draft({ visibility: 'private', format: 'live', questionCount: 30 });
    const { res, body } = await sent(d);
    expect(res.data).toMatchObject({ tid: 't_abcdef', pin: '482913' });
    const { operationId, displayName, school, grade, ...rest } = body;
    expect(rest).toEqual(webBody(d));
    expect(rest.visibility).toBe('private');
    expect(rest).not.toHaveProperty('maxPlayers');
    expect(operationId).toMatch(/^create_[A-Za-z0-9_]+$/);
    expect({ displayName, school, grade }).toEqual(who);
    expect(validateTournamentInput(body, NOW, WEB_ALLOWED)).toMatchObject({
      ok: true,
      config: { visibility: 'private', format: 'live', questionCount: 30 },
    });
  });

  it('team rules: school vs school over rounds keeps the rule and counted players', async () => {
    const d = draft({
      format: 'rounds',
      teamRule: 'school',
      teamSize: 3,
      roundCount: 7,
      roundHours: 48,
      questionCount: 15,
      categories: ['histoire_haiti', 'geo_haiti', 'sciences'],
    });
    const { body } = await sent(d);
    expect(body).toMatchObject({
      format: 'rounds',
      teamRule: 'school',
      teamSize: 3,
      roundCount: 7,
      roundHours: 48,
      categories: ['histoire_haiti', 'geo_haiti', 'sciences'],
    });
    const v = validateTournamentInput(body, NOW, WEB_ALLOWED);
    expect(v.ok && v.config).toMatchObject({ teamRule: 'school', teamSize: 3 });
  });

  it('a knockout is always solo, caps its rounds and sends its player cap', async () => {
    const d = draft({ format: 'bracket', teamRule: 'grade', roundHours: 168, maxPlayers: 64 });
    const { body } = await sent(d);
    expect(body).toMatchObject({ teamRule: 'solo', roundHours: 72, maxPlayers: 64 });
    expect(body).toEqual(expect.objectContaining(webBody(d)));
  });

  it('scheduled: a local date and time three days out is sent as that instant', async () => {
    const startsAt = parseLocalDateTime('2026-10-22', '18:30');
    expect(startsAt).toBe(new Date(2026, 9, 22, 18, 30).getTime());
    const d = draft({ format: 'window', windowHours: 168, visibility: 'unlisted', startsAt });
    const { body } = await sent(d);
    expect(body).toMatchObject({ startsAt, windowHours: 168, visibility: 'unlisted', format: 'window' });
  });

  it('the one-tap Rapide preset is a valid public solo tournament', async () => {
    const d = quickDraft('Rapide', 'window', TOURNAMENT_CATEGORY_IDS[0], NOW);
    const { body } = await sent(d);
    expect(body).toMatchObject({
      visibility: 'public',
      teamRule: 'solo',
      startsAt: NOW + 10 * 60_000,
      questionCount: 10,
      secondsPerQuestion: 20,
    });
  });

  it('rejects invalid input client-side with the shared validator, without a request', async () => {
    const bad = draft({
      title: 'ab',
      categories: ['not_a_deck'],
      startsAt: NOW + 30_000,
      secondsPerQuestion: 12,
    });
    const expected = validateTournamentInput(creationPayload(bad), NOW, WEB_ALLOWED);
    const res = await createFromDraft(bad, who, NOW);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res).toEqual({
      ok: false,
      error: 'invalid',
      fields: expected.ok ? [] : expected.errors,
    });
    expect(res.fields).toEqual(
      expect.arrayContaining(['title', 'categories', 'startsAt', 'secondsPerQuestion']),
    );
    expect(checkCreation(draft({ startsAt: NaN }), NOW)).toEqual({ ok: false, errors: ['startsAt'] });
    expect(
      checkCreation(draft({ format: 'rounds', questionCount: 30 }), NOW),
    ).toEqual({ ok: false, errors: ['questionCount'] });
  });

  it('parses only well-formed local dates and times', () => {
    expect(parseLocalDateTime('2026-02-31', '10:00')).toBeNaN();
    expect(parseLocalDateTime('2026-10-22', '24:00')).toBeNaN();
    expect(parseLocalDateTime('22/10/2026', '10:00')).toBeNaN();
    expect(parseLocalDateTime('2026-10-22', '9:05')).toBe(new Date(2026, 9, 22, 9, 5).getTime());
  });
});
