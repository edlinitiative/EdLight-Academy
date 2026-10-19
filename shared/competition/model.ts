/** Presentation contracts never grant entry or change source-engine finality. */
export type CompetitionSource =
  | { kind: 'official_arena'; id: string }
  | { kind: 'user_tournament'; id: string; schemaVersion: 1 | 2 }
  | { kind: 'external_event'; id: string };
export type Phase =
  | 'scheduled'
  | 'registration'
  | 'waiting'
  | 'live'
  | 'grading'
  | 'provisional'
  | 'final'
  | 'cancelled';
export interface CompetitionSummary {
  key: string;
  source: CompetitionSource;
  title: string;
  host: string;
  phase: Phase;
  startsAt: number;
  endsAt: number | null;
  schoolKey: string | null;
  department: string | null;
  entryMode: 'individual' | 'named_team' | 'school_group' | 'grade_group';
  format: string;
  resultAuthority: 'app_computed' | 'official_review' | 'organizer_reported';
  capabilities: {
    enter: boolean;
    namedTeams: boolean;
    livePlay: boolean;
    windowPlay: boolean;
    watch: boolean;
    checkIn: boolean;
    externalRegistration: boolean;
  };
  href: string;
}
export const competitionKey = (source: CompetitionSource) =>
  `${source.kind}:${source.id}`;
export function officialPhase(state: string): Phase {
  const phases: Record<string, Phase> = {
    draft: 'scheduled',
    registration: 'registration',
    doors: 'waiting',
    live: 'live',
    grading: 'grading',
    provisional: 'provisional',
    final: 'final',
    void: 'cancelled',
  };
  return phases[state] ?? 'scheduled';
}
export function userPhase(state: string): Phase {
  return state === 'running'
    ? 'live'
    : state === 'finished'
      ? 'final'
      : state === 'cancelled'
        ? 'cancelled'
        : 'scheduled';
}
export function nextAction(
  summary: CompetitionSummary,
  registered: boolean,
): 'results' | 'rejoin' | 'enter' | 'watch' | 'unavailable' {
  if (summary.phase === 'final' || summary.phase === 'provisional')
    return 'results';
  if (summary.phase === 'cancelled') return 'unavailable';
  if (registered && ['waiting', 'live'].includes(summary.phase))
    return 'rejoin';
  if (!registered && summary.capabilities.enter) return 'enter';
  return summary.capabilities.watch ? 'watch' : 'unavailable';
}
export function prioritize(
  summaries: CompetitionSummary[],
  registeredKeys: ReadonlySet<string>,
): CompetitionSummary[] {
  const priority = (s: CompetitionSummary) =>
    registeredKeys.has(s.key) && ['waiting', 'live'].includes(s.phase)
      ? 0
      : registeredKeys.has(s.key) && !['final', 'cancelled'].includes(s.phase)
        ? 1
        : s.phase === 'live'
          ? 2
          : ['final', 'cancelled'].includes(s.phase)
            ? 4
            : 3;
  return [...summaries].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      a.startsAt - b.startsAt ||
      a.key.localeCompare(b.key),
  );
}
