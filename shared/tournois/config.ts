/**
 * tournois/config — what a student may ask for when creating a tournament.
 *
 * Pure: no clock of its own, no I/O. The API validates every creation through
 * `validateTournamentInput(input, now, allowedCategories)` and stores only what
 * comes out, so a tournament document can never carry a format, a duration or a
 * question count this module did not accept.
 *
 * Ted, 2026-09-23: "allow people to create their own tournament and play … they
 * can choose the mode … a two week tournament, a day, different format — and we
 * create the schedule and time for them to play … they can decide to make the
 * visibility public or not."
 */

/**
 * The four shapes a tournament can take.
 *
 *   live     — everyone at the same time: one question on screen for all,
 *              revealed together, podium between questions (the Salon mockup).
 *   window   — open for a day to two weeks; each player plays ONE timed round
 *              whenever it suits them; best score wins.
 *   rounds   — "Manches": several consecutive windows (e.g. one per day for a
 *              week); points add up across rounds.
 *   bracket  — knockout: players are paired, each round is a window in which
 *              both play the same round; the higher score goes through.
 */
export const FORMATS = ['live', 'window', 'rounds', 'bracket'] as const;
export type TournamentFormat = (typeof FORMATS)[number];

/**
 * Who a player's points count for.
 *
 *   solo    — individuals only.
 *   school  — school vs school: each school is scored on its best `teamSize`
 *             players (the Arène rule), so a big school cannot win on turnout.
 *   grade   — class vs class: the same best-N rule, grouped by class (NS I…).
 */
export const TEAM_RULES = ['solo', 'school', 'grade'] as const;
export type TeamRule = (typeof TEAM_RULES)[number];

/**
 *   public    — listed on /tournois, anyone can watch, any signed-in student can join.
 *   unlisted  — not listed; anyone with the link or the PIN can watch and join.
 *   private   — not listed; only players who joined with the PIN can see it.
 */
export const VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SECONDS_PER_QUESTION = [10, 15, 20, 30] as const;
export const TEAM_SIZES = [3, 5] as const;

export const LIMITS = {
  titleMin: 3,
  titleMax: 60,
  descriptionMax: 240,
  categoriesMax: 15,
  liveQuestions: { min: 5, max: 30 },
  roundQuestions: { min: 5, max: 20 },
  /** Earliest start: two minutes out, so the lobby has time to fill. */
  minLeadMs: 2 * 60 * 1000,
  /** Latest start: sixty days out. */
  maxLeadMs: 60 * 24 * 60 * 60 * 1000,
  /** A window: one hour to two weeks. */
  windowHours: { min: 1, max: 14 * 24 },
  rounds: { min: 2, max: 10 },
  roundHours: { min: 1, max: 7 * 24 },
  bracketRoundHours: { min: 1, max: 72 },
  players: { min: 2, max: 500 },
  bracketPlayers: { min: 2, max: 64 },
} as const;

export interface TournamentConfig {
  title: string;
  description: string;
  format: TournamentFormat;
  teamRule: TeamRule;
  teamSize: number;
  visibility: Visibility;
  categories: string[];
  questionCount: number;
  secondsPerQuestion: number;
  /** Live: when question 1 opens. Other formats: when round 1 opens. */
  startsAt: number;
  /** window only. */
  windowHours: number;
  /** rounds and bracket: length of each round. */
  roundHours: number;
  /** rounds only. */
  roundCount: number;
  maxPlayers: number;
  /** The creator is also a player (a student organising) — off for a teacher who only hosts. */
  creatorPlays: boolean;
}

export type ValidationResult =
  | { ok: true; config: TournamentConfig }
  | { ok: false; errors: string[] };

const isStr = (v: unknown): v is string => typeof v === 'string';
const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  (isStr(v) && (list as readonly string[]).includes(v) ? (v as T) : null);

/** Collapse whitespace, strip control characters. A title is shown on a stage. */
export function cleanText(v: unknown, max: number): string {
  if (!isStr(v)) return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate a creation request. Every field either comes out clean and bounded
 * or is named in `errors` — the API returns the list verbatim so the wizard can
 * point at the field.
 */
export function validateTournamentInput(
  input: Record<string, unknown>,
  now: number,
  allowedCategories: readonly string[],
): ValidationResult {
  const errors: string[] = [];

  const title = cleanText(input.title, LIMITS.titleMax);
  if (title.length < LIMITS.titleMin) errors.push('title');
  const description = cleanText(input.description, LIMITS.descriptionMax);

  const format = oneOf(input.format, FORMATS);
  if (!format) errors.push('format');

  let teamRule = oneOf(input.teamRule, TEAM_RULES) ?? 'solo';
  // A knockout pairs individuals; team scoring there would need team pairings.
  if (format === 'bracket') teamRule = 'solo';

  const teamSize = intIn(input.teamSize, 3, 5);
  const visibility = oneOf(input.visibility, VISIBILITIES);
  if (!visibility) errors.push('visibility');

  const rawCats = Array.isArray(input.categories) ? input.categories : [];
  const categories = [...new Set(rawCats.filter(isStr))].filter((c) => allowedCategories.includes(c));
  if (categories.length === 0 || categories.length > LIMITS.categoriesMax) errors.push('categories');

  const qLim = format === 'live' ? LIMITS.liveQuestions : LIMITS.roundQuestions;
  const questionCount = intIn(input.questionCount, qLim.min, qLim.max);
  if (questionCount == null) errors.push('questionCount');

  const secondsPerQuestion = intIn(input.secondsPerQuestion, 5, 60);
  if (secondsPerQuestion == null || !(SECONDS_PER_QUESTION as readonly number[]).includes(secondsPerQuestion)) {
    errors.push('secondsPerQuestion');
  }

  const startsAt = typeof input.startsAt === 'number' ? Math.round(input.startsAt)
    : isStr(input.startsAt) ? Date.parse(input.startsAt) : NaN;
  if (!Number.isFinite(startsAt) || startsAt < now + LIMITS.minLeadMs - 5_000 || startsAt > now + LIMITS.maxLeadMs) {
    errors.push('startsAt');
  }

  const windowHours = format === 'window'
    ? intIn(input.windowHours, LIMITS.windowHours.min, LIMITS.windowHours.max) : 0;
  if (format === 'window' && windowHours == null) errors.push('windowHours');

  const roundCount = format === 'rounds' ? intIn(input.roundCount, LIMITS.rounds.min, LIMITS.rounds.max) : 0;
  if (format === 'rounds' && roundCount == null) errors.push('roundCount');

  const rhLim = format === 'bracket' ? LIMITS.bracketRoundHours : LIMITS.roundHours;
  const roundHours = format === 'rounds' || format === 'bracket'
    ? intIn(input.roundHours, rhLim.min, rhLim.max) : 0;
  if ((format === 'rounds' || format === 'bracket') && roundHours == null) errors.push('roundHours');

  const pLim = format === 'bracket' ? LIMITS.bracketPlayers : LIMITS.players;
  const maxPlayers = input.maxPlayers == null ? pLim.max : intIn(input.maxPlayers, pLim.min, pLim.max);
  if (maxPlayers == null) errors.push('maxPlayers');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    config: {
      title,
      description,
      format: format as TournamentFormat,
      teamRule,
      teamSize: teamRule === 'solo' ? 0 : (teamSize && (TEAM_SIZES as readonly number[]).includes(teamSize) ? teamSize : 5),
      visibility: visibility as Visibility,
      categories,
      questionCount: questionCount as number,
      secondsPerQuestion: secondsPerQuestion as number,
      startsAt,
      windowHours: windowHours || 0,
      roundHours: roundHours || 0,
      roundCount: roundCount || 0,
      maxPlayers: maxPlayers as number,
      creatorPlays: input.creatorPlays !== false,
    },
  };
}

/** A six-digit room PIN, from an injected random source (Math.random in the API). */
export function makePin(rand: () => number): string {
  return String(Math.floor(100000 + rand() * 900000));
}

/** "829415" → "829 415", the way the Salon header shows it. */
export function formatPin(pin: string): string {
  const d = String(pin || '').replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

export function isValidPin(v: unknown): v is string {
  return isStr(v) && /^\d{6}$/.test(v);
}

export function isValidTid(v: unknown): v is string {
  return isStr(v) && /^[A-Za-z0-9_-]{6,40}$/.test(v);
}
