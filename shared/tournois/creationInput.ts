/**
 * tournois/creationInput — the one mapping from a creation form to the
 * /api/tournois/create body, shared by the web wizard (src/pages/tournois/
 * TournoisCreate.tsx) and the native form (mobile/src/components/arena/
 * TournoisCreateForm.tsx), so both platforms send the same contract.
 *
 * The rules themselves live in ./config (validateTournamentInput, LIMITS);
 * this module only shapes the input and lists the choices the forms offer.
 * Pure: `now` is always passed in.
 */
import {
  LIMITS,
  type TeamRule,
  type TournamentFormat,
  type Visibility,
} from './config';

/** What a creation form holds. `startsAt` is epoch ms. */
export interface TournamentDraft {
  title: string;
  description: string;
  format: TournamentFormat;
  teamRule: TeamRule;
  teamSize: number;
  visibility: Visibility;
  categories: string[];
  questionCount: number;
  secondsPerQuestion: number;
  startsAt: number;
  windowHours: number;
  roundCount: number;
  roundHours: number;
  maxPlayers: number;
  creatorPlays: boolean;
}

/**
 * The request body (before identity fields). A knockout is always solo, its
 * rounds are capped at the bracket limit, and only a knockout sends a player
 * cap (the other formats take the server's default).
 */
export function creationPayload(d: TournamentDraft): Record<string, unknown> {
  const bracket = d.format === 'bracket';
  return {
    title: d.title,
    description: d.description,
    format: d.format,
    teamRule: bracket ? 'solo' : d.teamRule,
    teamSize: d.teamSize,
    visibility: d.visibility,
    categories: d.categories,
    questionCount: d.questionCount,
    secondsPerQuestion: d.secondsPerQuestion,
    startsAt: d.startsAt,
    windowHours: d.windowHours,
    roundCount: d.roundCount,
    roundHours: bracket
      ? Math.min(d.roundHours, LIMITS.bracketRoundHours.max)
      : d.roundHours,
    maxPlayers: bracket ? d.maxPlayers : undefined,
    creatorPlays: d.creatorPlays,
  };
}

/** The preset values each form offers (all inside LIMITS). */
export const CREATION_CHOICES = {
  liveQuestionCounts: [5, 10, 15, 20, 30],
  roundQuestionCounts: [5, 10, 15, 20],
  windowHours: [3, 24, 72, 168, 336],
  roundCounts: [2, 3, 5, 7, 10],
  roundHours: [1, 24, 48, 168],
  bracketRoundHours: [1, 6, 24, 48],
  bracketPlayers: [4, 8, 16, 32, 64],
  teamSizes: [3, 5],
} as const;

/** Which validator fields each part of the form owns (web wizard steps). */
export const CREATION_STEP_FIELDS: string[][] = [
  ['title', 'format'],
  ['categories', 'questionCount', 'secondsPerQuestion'],
  ['startsAt', 'windowHours', 'roundCount', 'roundHours', 'maxPlayers'],
  ['visibility'],
];

/** Twenty minutes out, rounded up to the next five minutes (local clock). */
export function defaultStartAt(now: number): number {
  const d = new Date(now + 20 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return d.getTime();
}

/** The web wizard's starting values. */
export function defaultDraft(now: number): TournamentDraft {
  return {
    title: '',
    description: '',
    format: 'live',
    teamRule: 'solo',
    teamSize: 5,
    visibility: 'public',
    categories: ['maths_eclair', 'sciences'],
    questionCount: 10,
    secondsPerQuestion: 15,
    startsAt: defaultStartAt(now),
    windowHours: 24,
    roundCount: 5,
    roundHours: 24,
    maxPlayers: 16,
    creatorPlays: true,
  };
}

/**
 * The app's one-tap "Rapide" tournament: public, solo, starts in ten minutes,
 * 10 questions of 20 seconds, 24-hour windows/rounds, 2 rounds; a knockout
 * takes up to 32 players.
 */
export function quickDraft(
  title: string,
  format: TournamentFormat,
  category: string,
  now: number,
): TournamentDraft {
  return {
    title,
    description: '',
    format,
    teamRule: 'solo',
    teamSize: 5,
    visibility: 'public',
    categories: [category],
    questionCount: 10,
    secondsPerQuestion: 20,
    startsAt: now + 10 * 60_000,
    windowHours: 24,
    roundCount: 2,
    roundHours: 24,
    maxPlayers: 32,
    creatorPlays: true,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms → the local "YYYY-MM-DD" and "HH:MM" a form shows. */
export function localDateParts(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Local "YYYY-MM-DD" + "HH:MM" → epoch ms, or NaN when either is malformed. */
export function parseLocalDateTime(date: string, time: string): number {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!dm || !tm) return NaN;
  const [y, mo, d, h, mi] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return NaN;
  const out = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject roll-overs such as 31 February.
  return out.getMonth() === mo - 1 && out.getDate() === d ? out.getTime() : NaN;
}
