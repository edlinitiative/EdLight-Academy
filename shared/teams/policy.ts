/** Frozen three-starter independent-answer policy. Missing work has full timeout cost. */
export const TEAM_POLICY = 'independent-three-v1';
export const STARTERS = 3;
export interface LockedRoster {
  id: string;
  label: string;
  starters: string[];
}
export interface ConfirmedScore {
  uid: string;
  points: number;
  correct: number;
  answered: number;
  totalMs: number;
}
export function rosterProblem(
  starters: string[],
  accepted: string[],
  confirmed: string[],
): string | null {
  if (starters.length !== STARTERS || new Set(starters).size !== STARTERS)
    return 'roster_incomplete';
  if (starters.some((uid) => !accepted.includes(uid)))
    return 'membership_required';
  if (starters.some((uid) => !confirmed.includes(uid)))
    return 'confirmation_required';
  return null;
}
export function rankNamedTeams(
  rosters: LockedRoster[],
  scores: ConfirmedScore[],
  questions: number,
  questionMs: number,
) {
  const byUid = new Map(scores.map((s) => [s.uid, s]));
  const rows = rosters
    .map((roster) => {
      const contributions = roster.starters.map((uid) => {
        const s = byUid.get(uid);
        return {
          uid,
          points: s?.points ?? 0,
          correct: s?.correct ?? 0,
          answered: s?.answered ?? 0,
          totalMs:
            Math.max(
              0,
              Math.min(
                Math.min(questions, s?.answered ?? 0) * questionMs,
                s?.totalMs ?? 0,
              ),
            ) +
            Math.max(0, questions - (s?.answered ?? 0)) * questionMs,
        };
      });
      return {
        ...roster,
        points: contributions.reduce((n, s) => n + s.points, 0),
        correct: contributions.reduce((n, s) => n + s.correct, 0),
        totalMs: contributions.reduce((n, s) => n + s.totalMs, 0),
        missing: contributions.filter((s) => s.answered === 0).length,
        contributions,
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.correct - a.correct ||
        a.totalMs - b.totalMs ||
        a.id.localeCompare(b.id),
    );
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank =
      prev &&
      row.points === prev.points &&
      row.correct === prev.correct &&
      row.totalMs === prev.totalMs
        ? prev.rank
        : i + 1;
  });
  return rows;
}
