import { rankNamedTeams, rosterProblem } from '../../shared/teams/policy';
import { leagueTable, roundRobin } from '../../shared/leagues/standings';
import {
  competitionKey,
  nextAction,
  officialPhase,
  prioritize,
  userPhase,
  type CompetitionSummary,
} from '../../shared/competition/model';
import { taskPayload, workspacePage } from '../../shared/competition/workspace';
import { validateTournamentInput } from '../../shared/tournois/config';

describe('competition identity and truthful phases', () => {
  it('does not merge equal-looking source IDs or promote provisional results', () => {
    expect(competitionKey({ kind: 'official_arena', id: 'same' })).not.toBe(
      competitionKey({ kind: 'user_tournament', id: 'same', schemaVersion: 1 }),
    );
    expect(officialPhase('provisional')).toBe('provisional');
    expect(userPhase('finished')).toBe('final');
  });
  it('puts a registered live obligation ahead of recommendations and does not offer entry after cancellation', () => {
    const summary = {
      key: 'mine',
      phase: 'live',
      startsAt: 100,
      capabilities: { enter: true, watch: true },
    } as CompetitionSummary;
    expect(
      prioritize(
        [{ ...summary, key: 'other', startsAt: 0 }, summary],
        new Set(['mine']),
      )[0].key,
    ).toBe('mine');
    expect(nextAction(summary, true)).toBe('rejoin');
    expect(nextAction({ ...summary, phase: 'cancelled' }, true)).toBe(
      'unavailable',
    );
  });
});
describe('named team roster and tie rules', () => {
  it('requires three distinct accepted and confirmed starters', () => {
    expect(rosterProblem(['a', 'a', 'b'], ['a', 'b'], ['a', 'b'])).toBe(
      'roster_incomplete',
    );
    expect(rosterProblem(['a', 'b', 'c'], ['a', 'b'], ['a', 'b', 'c'])).toBe(
      'membership_required',
    );
    expect(rosterProblem(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b'])).toBe(
      'confirmation_required',
    );
  });
  it('sums three confirmed scores, penalizes absent slots, and shares a sporting tie', () => {
    const rosters = [
      { id: 'z', label: 'Z', starters: ['a', 'b', 'c'] },
      { id: 'a', label: 'A', starters: ['d', 'e', 'f'] },
    ];
    const rows = rankNamedTeams(
      rosters,
      [
        { uid: 'a', points: 100, correct: 1, answered: 1, totalMs: 2000 },
        { uid: 'd', points: 100, correct: 1, answered: 1, totalMs: 2000 },
      ],
      5,
      10000,
    );
    expect(rows[0]).toMatchObject({
      id: 'a',
      points: 100,
      totalMs: 142000,
      missing: 2,
      rank: 1,
    });
    expect(rows[1].rank).toBe(1);
  });
  it('absence cannot lower the elapsed criterion, including a partially answered round', () => {
    const rows = rankNamedTeams(
      [{ id: 't', label: 'T', starters: ['a', 'b', 'c'] }],
      [{ uid: 'a', points: 1, correct: 1, answered: 2, totalMs: 5000 }],
      10,
      20000,
    );
    expect(rows[0].totalMs).toBe(565000);
  });
});
describe('versioned league rebuild', () => {
  const entrants = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];
  it('schedules each pairing once, including an odd field', () => {
    const fixtures = roundRobin(['a', 'b', 'c'], 1000, 3600000);
    expect(fixtures).toHaveLength(3);
    expect(
      new Set(fixtures.map((f) => [f.home, f.away].sort().join('/'))).size,
    ).toBe(3);
  });
  it('does not count a disputed fixture; correction rebuilds rather than increments', () => {
    const fixtures = roundRobin(['a', 'b'], 1000, 3600000);
    fixtures[0] = {
      ...fixtures[0],
      status: 'final',
      homeScore: 20,
      awayScore: 10,
    };
    expect(
      leagueTable(entrants.slice(0, 2), fixtures).find((r) => r.id === 'a')
        ?.points,
    ).toBe(3);
    fixtures[0] = { ...fixtures[0], status: 'disputed', revision: 2 };
    expect(
      leagueTable(entrants.slice(0, 2), fixtures).every(
        (r) => r.points === 0 && r.remaining === 1,
      ),
    ).toBe(true);
    fixtures[0] = {
      ...fixtures[0],
      status: 'final',
      homeScore: 5,
      awayScore: 10,
      revision: 3,
    };
    const table = leagueTable(entrants.slice(0, 2), fixtures);
    expect(table.find((r) => r.id === 'b')?.points).toBe(3);
    expect(table.find((r) => r.id === 'a')?.points).toBe(0);
    expect(leagueTable(entrants.slice(0, 2), fixtures)).toEqual(table);
    expect(() => leagueTable(entrants, [fixtures[0], fixtures[0]])).toThrow(
      'duplicate_fixture',
    );
  });
});
it('rejects unsupported schema/capability payloads before legacy bracket coercion', () => {
  const out = validateTournamentInput(
    {
      schemaVersion: 2,
      entryMode: 'named_team',
      gameMode: 'relay',
      format: 'bracket',
    },
    0,
    [],
  );
  expect(out.ok).toBe(false);
  if (!out.ok)
    expect(out.errors).toEqual(
      expect.arrayContaining(['schemaVersion', 'unsupported_capability']),
    );
});
it('keeps new creation controls hidden when creation is disabled, retaining history', () => {
  const page = workspacePage(
    { kind: 'home' },
    { events: [], summaries: [] },
    {
      uid: 'a',
      creationEnabled: false,
      inbox: [{ kind: 'event', title: 'Existing', targetId: 'event' }],
    },
    0,
  );
  expect(
    page.panels
      .flatMap((p) => p.tasks || [])
      .some((t) => ['event-save', 'team-create'].includes(t.action)),
  ).toBe(false);
  expect(
    page.panels
      .flatMap((p) => p.links || [])
      .some((l) => l.path === '/arena/evenements/event'),
  ).toBe(true);
});
it('translates form dates, roster selections and booleans into typed commands', () => {
  expect(
    taskPayload(
      {
        id: 'f',
        action: 'membership-review',
        label: ['', ''],
        fields: [{ key: 'approve', label: ['', ''] }],
      },
      { approve: 'false' },
      0,
    ).approve,
  ).toBe(false);
  expect(
    taskPayload(
      {
        id: 'f',
        action: 'roster-save',
        label: ['', ''],
        fields: [{ key: 'starters', label: ['', ''] }],
      },
      { starters: 'a, b,c' },
      0,
    ).starters,
  ).toEqual(['a', 'b', 'c']);
});
