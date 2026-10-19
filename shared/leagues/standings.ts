/** A rebuild consumes each fixture once at its current accepted revision. */
export interface Fixture {
  id: string;
  home: string;
  away: string;
  startsAt: number;
  revision: number;
  status: 'scheduled' | 'postponed' | 'disputed' | 'final' | 'no_contest';
  homeScore: number | null;
  awayScore: number | null;
  sourceKey: string | null;
}
export function leagueTable(
  entrants: { id: string; label: string }[],
  fixtures: Fixture[],
) {
  if (new Set(fixtures.map((f) => f.id)).size !== fixtures.length)
    throw new Error('duplicate_fixture');
  const rows = entrants.map((e) => ({
    ...e,
    played: 0,
    remaining: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    for: 0,
    against: 0,
    rank: 0,
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const f of fixtures) {
    const a = byId.get(f.home),
      b = byId.get(f.away);
    if (!a || !b || a === b) throw new Error('invalid_fixture');
    if (f.status !== 'final') {
      if (f.status !== 'no_contest') {
        a.remaining++;
        b.remaining++;
      }
      continue;
    }
    if (
      ![f.homeScore, f.awayScore].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
      )
    )
      throw new Error('invalid_result');
    a.played++;
    b.played++;
    a.for += f.homeScore!;
    a.against += f.awayScore!;
    b.for += f.awayScore!;
    b.against += f.homeScore!;
    if (f.homeScore === f.awayScore) {
      a.draws++;
      b.draws++;
      a.points++;
      b.points++;
    } else {
      const winner = f.homeScore! > f.awayScore! ? a : b,
        loser = winner === a ? b : a;
      winner.wins++;
      winner.points += 3;
      loser.losses++;
    }
  }
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.for - b.against - (a.for - a.against) ||
      b.for - a.for ||
      a.id.localeCompare(b.id),
  );
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    r.rank =
      p &&
      p.points === r.points &&
      p.for - p.against === r.for - r.against &&
      p.for === r.for
        ? p.rank
        : i + 1;
  });
  return rows;
}
export function roundRobin(
  ids: string[],
  startsAt: number,
  intervalMs: number,
): Fixture[] {
  if (
    ids.length < 2 ||
    ids.length > 12 ||
    new Set(ids).size !== ids.length ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 3600000 ||
    intervalMs > 90 * 86400000
  )
    throw new Error('invalid_schedule');
  const ring: Array<string | null> = [...ids];
  if (ring.length % 2) ring.push(null);
  const fixtures: Fixture[] = [];
  for (let round = 0; round < ring.length - 1; round++) {
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i],
        b = ring[ring.length - 1 - i];
      if (a && b)
        fixtures.push({
          id: `r${round}m${i}`,
          home: a,
          away: b,
          startsAt: startsAt + round * intervalMs,
          revision: 1,
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
          sourceKey: null,
        });
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return fixtures;
}
