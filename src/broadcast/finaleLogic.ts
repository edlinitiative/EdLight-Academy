/**
 * The finale's arithmetic — everything sequences 13 to 20 need to decide, with
 * no React anywhere near it.
 *
 * The champion reveal, the podium and the post-game board are the only part of
 * the broadcast whose *timing carries meaning*: "reveal from 5th up, one per
 * 2.5s" is not decoration, it is the suspense, and a reveal that skips a school
 * or lands the champion a beat early is a mistake ten thousand people watch
 * happen live. That timing therefore has to be a function of `elapsed` that can
 * be asserted in a test, not a chain of `setTimeout`s inside a component that
 * can only be checked by staring at it.
 *
 * The same argument covers the sentences. "30 POINTS SÉPARENT #1 ET #2" is read
 * aloud by a host off this screen, so it has to be right at the boundaries a
 * board actually produces — an exact tie, and a gap under one point that naïve
 * rounding would report as a tie when it is not one.
 *
 * Nothing here reads a clock, a store or the DOM. `elapsed` comes in as a
 * number, because the stage already runs exactly one 100ms tick for the whole
 * broadcast and a second timer in here would drift against it.
 */

import type {
  ArenaEvent,
  BiggestClimberPayload,
  IndividualStanding,
  SchoolStanding,
  StandingsSnapshot,
} from '../../shared/arena/events';
import type { CSSProperties } from 'react';
import type { MapPlace } from './sceneContract';
import { ENTER_EASE, ENTER_MS, STAGGER_MS, TRAVEL_PX } from './sceneContract';

/** Bilingual copy, French first. Same shape the scenes receive. */
export type Translate = (fr: string, ht: string) => string;

// ── Cadences (section K) ────────────────────────────────────────────────────

/** Sequence 17: one school per 2.5s, 5th up. Five slots ≈ 12.5s + the hold. */
export const REVEAL_STEP_MS = 2500;
/** Sequence 18: #3, #2, #1. Three steps ≈ 9s, which is the "~10s" in section K. */
export const PODIUM_STEP_MS = 3000;
/** The school reveal is a top five, not a top eight. */
export const CHAMPION_SLOTS = 5;
/** The individual podium is three. */
export const PODIUM_SLOTS = 3;
/** Sequence 19 holds the superlatives board for 30s… */
export const POSTGAME_STATS_MS = 30_000;
/** …then sequence 20 runs 8s… */
export const POSTGAME_TEASER_MS = 8_000;
/** …of which the champions line owns the first half before the challenge lands. */
export const TEASER_HOLD_MS = 4_000;
/** After which the post-game loops, because a stream left up must never go blank. */
export const POSTGAME_CYCLE_MS = POSTGAME_STATS_MS + POSTGAME_TEASER_MS;

const safe = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

// ── Reveals ─────────────────────────────────────────────────────────────────

/**
 * How many slots have been revealed at `elapsedMs`.
 *
 * One is revealed immediately: a reveal sequence that opens on an empty screen
 * for 2.5 seconds reads as a stalled stream, not as suspense.
 */
export function revealCount(elapsedMs: number, total: number, stepMs: number = REVEAL_STEP_MS): number {
  const slots = Math.max(0, Math.floor(safe(total)));
  if (slots === 0) return 0;
  const step = stepMs > 0 ? stepMs : REVEAL_STEP_MS;
  const steps = Math.floor(Math.max(0, safe(elapsedMs)) / step) + 1;
  return Math.min(slots, steps);
}

/**
 * The order a ranked list is revealed in: worst of the shortlist first, the
 * champion last. Never mutates the caller's array — `standings.schools` is the
 * board's own state and a `reverse()` in place would reorder the leaderboard
 * underneath the scene that is reading it.
 */
export function revealOrder<T>(ranked: readonly T[], slots: number = CHAMPION_SLOTS): T[] {
  return (ranked || []).slice(0, Math.max(0, slots)).reverse();
}

/**
 * The entry currently on screen during a staged reveal, and what preceded it.
 * `revealed` is in reveal order, so its last element is the current card.
 */
export interface RevealState<T> {
  /** Everything shown so far, worst first. */
  revealed: T[];
  /** The card holding the screen right now. */
  current: T | null;
  /** True once the last slot — the champion — has landed. */
  complete: boolean;
}

export function revealState<T>(
  ranked: readonly T[],
  elapsedMs: number,
  opts: { slots?: number; stepMs?: number; reduceMotion?: boolean } = {},
): RevealState<T> {
  const order = revealOrder(ranked, opts.slots ?? CHAMPION_SLOTS);
  // Reduced motion removes the HOLDS, not the information: the whole result is
  // present at once rather than being drip-fed to someone who asked for less.
  const count = opts.reduceMotion
    ? order.length
    : revealCount(elapsedMs, order.length, opts.stepMs ?? REVEAL_STEP_MS);
  const revealed = order.slice(0, count);
  return {
    revealed,
    current: revealed.length > 0 ? revealed[revealed.length - 1] : null,
    complete: order.length > 0 && count >= order.length,
  };
}

// ── Margins ─────────────────────────────────────────────────────────────────

/**
 * A margin split into the one number and the words around it, because section K
 * allows exactly one thing on screen to be set in display type. The scene sets
 * `figure` big and `words` small; `marginSentence` glues them back together for
 * the places a margin is a caption rather than a headline.
 */
export interface MarginPhrase {
  figure: string;
  words: string;
}

export function marginPhrase(
  margin: number,
  rankA: number,
  rankB: number,
  t: Translate,
): MarginPhrase {
  const gap = Math.abs(safe(margin));
  const rounded = Math.round(gap);
  const between = t(`#${rankA} ET #${rankB}`, `#${rankA} AK #${rankB}`);

  if (gap === 0) {
    return { figure: t('ÉGALITÉ', 'MENM PWEN'), words: t(`ENTRE ${between}`, `ANT ${between}`) };
  }
  // A real gap that rounds to nothing must not be reported as a tie: the board
  // still has an order, and "égalité" on a screen a host reads from is a lie
  // the stream cannot take back.
  if (rounded === 0) {
    return {
      figure: t("MOINS D'UN POINT", 'MWENS PASE 1 PWEN'),
      words: t(`SÉPARE ${between}`, `SEPARE ${between}`),
    };
  }
  return {
    figure: String(rounded),
    words: rounded === 1
      ? t(`POINT SÉPARE ${between}`, `PWEN SEPARE ${between}`)
      : t(`POINTS SÉPARENT ${between}`, `PWEN SEPARE ${between}`),
  };
}

/** The whole line — "30 POINTS SÉPARENT #1 ET #2". */
export function marginSentence(margin: number, rankA: number, rankB: number, t: Translate): string {
  const { figure, words } = marginPhrase(margin, rankA, rankB, t);
  return `${figure} ${words}`;
}

/** margins[i] is the gap from ranked[i] to ranked[i + 1]. Same shape FINAL_FIVE sends. */
export function marginsBetween(ranked: readonly SchoolStanding[]): number[] {
  const list = ranked || [];
  const out: number[] = [];
  for (let i = 0; i + 1 < list.length; i += 1) {
    out.push(Math.max(0, safe(list[i]?.teamAvg) - safe(list[i + 1]?.teamAvg)));
  }
  return out;
}

// ── Players ─────────────────────────────────────────────────────────────────

/** Accuracy as a percentage of the questions asked. Null when nobody knows the total. */
export function accuracyPct(player: IndividualStanding | null, questionCount: number): number | null {
  const total = Math.floor(safe(questionCount));
  if (!player || total <= 0) return null;
  return Math.round((Math.max(0, safe(player.correct)) / total) * 100);
}

/**
 * Seconds, one decimal, decimal comma.
 *
 * The comma is not cosmetic: both the French and the Kreyòl side of this
 * broadcast write 6,4 and read "six virgule quatre", and a stray point on a
 * screen a host is reading from is a stumble on air.
 */
export function avgSeconds(ms: number): string {
  return (Math.max(0, safe(ms)) / 1000).toFixed(1).replace('.', ',');
}

/**
 * Fastest player who is also right — the superlative section K asks for.
 *
 * Speed alone rewards guessing: somebody tapping the first option on every
 * question posts the best average time in the tournament and has earned
 * nothing. So a player only qualifies once they have actually answered
 * correctly, and ties are broken by who was right more often.
 */
export function fastestAccurate(individuals: readonly IndividualStanding[]): IndividualStanding | null {
  let best: IndividualStanding | null = null;
  for (const p of individuals || []) {
    if (!p || safe(p.correct) <= 0 || safe(p.avgMs) <= 0) continue;
    if (
      !best
      || safe(p.avgMs) < safe(best.avgMs)
      || (safe(p.avgMs) === safe(best.avgMs) && safe(p.correct) > safe(best.correct))
    ) best = p;
  }
  return best;
}

/** Everyone the aggregator marked as having taken a round without a single miss. */
export function perfectPerformers(
  individuals: readonly IndividualStanding[],
  limit = 4,
): IndividualStanding[] {
  return (individuals || [])
    .filter((p) => !!p && p.perfectRound === true)
    .sort((a, b) => safe(a.rank) - safe(b.rank) || safe(b.score) - safe(a.score))
    .slice(0, Math.max(0, limit));
}

// ── Participation ───────────────────────────────────────────────────────────

export interface CommuneParticipation {
  name: string;
  players: number;
  schools: number;
}

/**
 * Participation by commune, from the same places the map draws.
 *
 * A player's place and a school's place are counted separately and never summed
 * into one "presence" number: they answer different questions — where the
 * crowd is, and where the institutions are — and the design doc is explicit
 * that conflating the two is how a school ends up pinned to a town it has never
 * been in.
 */
export function participationByCommune(places: readonly MapPlace[]): CommuneParticipation[] {
  const rows = new Map<string, CommuneParticipation>();
  for (const place of places || []) {
    const name = typeof place?.name === 'string' ? place.name.trim() : '';
    if (!name) continue;
    const row = rows.get(name) ?? { name, players: 0, schools: 0 };
    if (place.kind === 'player') row.players += 1;
    else if (place.kind === 'school') row.schools += 1;
    rows.set(name, row);
  }
  return Array.from(rows.values()).sort(
    (a, b) => b.players - a.players || b.schools - a.schools || a.name.localeCompare(b.name, 'fr'),
  );
}

export interface ParticipationTotals {
  players: number;
  schools: number;
  communes: number;
}

export function participationTotals(places: readonly MapPlace[]): ParticipationTotals {
  const communes = participationByCommune(places);
  return {
    players: communes.reduce((n, c) => n + c.players, 0),
    schools: communes.reduce((n, c) => n + c.schools, 0),
    communes: communes.length,
  };
}

// ── Superlatives (sequence 19) ──────────────────────────────────────────────

export interface ImprovedSchool {
  school: SchoolStanding;
  from: number;
  to: number;
  /** Places climbed. Always positive; a school that fell is never "most improved". */
  gained: number;
}

export interface PerfectSchool {
  key: string;
  shortName: string;
  count: number;
}

export interface Superlatives {
  /**
   * Null unless a earlier snapshot is supplied. The stage keeps only the
   * current standings, so improvement is not derivable from the board alone —
   * and inventing a climb from one snapshot would be a made-up statistic on a
   * screen whose whole claim is that it only says true things.
   */
  mostImproved: ImprovedSchool | null;
  fastest: IndividualStanding | null;
  mostPerfect: PerfectSchool | null;
  communes: CommuneParticipation[];
  totals: ParticipationTotals;
}

export function superlatives(
  standings: StandingsSnapshot | null,
  places: readonly MapPlace[],
  previous?: StandingsSnapshot | null,
): Superlatives {
  const schools = standings?.schools ?? [];
  const individuals = standings?.individuals ?? [];

  let mostImproved: ImprovedSchool | null = null;
  if (previous?.schools?.length) {
    const before = new Map(previous.schools.map((s) => [s.key, safe(s.rank)]));
    for (const school of schools) {
      const from = before.get(school.key) ?? 0;
      const to = safe(school.rank);
      // Rank 0 means "cannot yet compete". A school crossing into the ranked
      // set has no rank to have improved FROM, so it is not a climb.
      if (from <= 0 || to <= 0) continue;
      const gained = from - to;
      if (gained > 0 && (!mostImproved || gained > mostImproved.gained)) {
        mostImproved = { school, from, to, gained };
      }
    }
  }

  const perfectBySchool = new Map<string, PerfectSchool>();
  for (const p of individuals) {
    if (p?.perfectRound !== true) continue;
    const key = p.schoolKey || p.schoolShort || '';
    if (!key) continue;
    const row = perfectBySchool.get(key) ?? { key, shortName: p.schoolShort || key, count: 0 };
    row.count += 1;
    perfectBySchool.set(key, row);
  }
  const mostPerfect = Array.from(perfectBySchool.values())
    .sort((a, b) => b.count - a.count || a.shortName.localeCompare(b.shortName, 'fr'))[0] ?? null;

  return {
    mostImproved,
    fastest: fastestAccurate(individuals),
    mostPerfect,
    communes: participationByCommune(places),
    totals: participationTotals(places),
  };
}

// ── Halftime (sequence 13) ──────────────────────────────────────────────────

export interface HalftimeExtras {
  fastest: IndividualStanding | null;
  perfect: IndividualStanding[];
  totals: ParticipationTotals;
}

export function halftimeExtras(
  standings: StandingsSnapshot | null,
  places: readonly MapPlace[],
): HalftimeExtras {
  return {
    fastest: fastestAccurate(standings?.individuals ?? []),
    perfect: perfectPerformers(standings?.individuals ?? []),
    totals: participationTotals(places),
  };
}

/**
 * The biggest climber, if one happens to be composed into this scene.
 *
 * Halftime carries no school key, so the director never composes anything into
 * it on its own — this reads whatever the emitter chose to attach, and the card
 * is simply omitted when nothing did. An omitted card is honest; a card
 * reporting a climb nobody made is not.
 */
export function climberFrom(events: readonly ArenaEvent[] | undefined): BiggestClimberPayload | null {
  for (const event of events || []) {
    if (event?.type === 'BIGGEST_CLIMBER') return (event.payload ?? null) as BiggestClimberPayload | null;
  }
  return null;
}

// ── Post-game phases (sequences 19 → 20) ────────────────────────────────────

export type PostGamePhase = 'stats' | 'teaser';

export interface PostGameBeat {
  phase: PostGamePhase;
  /** Milliseconds into the current phase — the teaser's own hold reads from this. */
  phaseElapsed: number;
}

/**
 * 30s of superlatives, 8s of teaser, then round again.
 *
 * The loop is the point: sequences 19 and 20 run at `final`, after the event
 * feed has nothing left to say, and a screen left up in a school hall for an
 * hour afterwards should keep showing the result rather than fading to an empty
 * stage the moment the last beat lands.
 */
export function postGameBeat(elapsedMs: number): PostGameBeat {
  const at = Math.max(0, safe(elapsedMs)) % POSTGAME_CYCLE_MS;
  return at < POSTGAME_STATS_MS
    ? { phase: 'stats', phaseElapsed: at }
    : { phase: 'teaser', phaseElapsed: at - POSTGAME_STATS_MS };
}

export type TeaserBeat = 'champions' | 'challenge';

/** The champions line holds, then the challenge lands. Section K, sequence 20. */
export function teaserBeat(phaseElapsedMs: number, holdMs: number = TEASER_HOLD_MS): TeaserBeat {
  return Math.max(0, safe(phaseElapsedMs)) < holdMs ? 'champions' : 'challenge';
}

// ── The provisional line ────────────────────────────────────────────────────

/**
 * Only `final` means verified.
 *
 * Section M's integrity argument depends entirely on this being said up front:
 * removing a cheat afterwards is the published rule working, and it is only
 * that if the announcement itself said the podium was provisional. The mobile
 * result screen draws the same boundary from the same field, deliberately —
 * two surfaces disagreeing about whether a prize is confirmed is the one
 * inconsistency this feature cannot afford.
 */
export function isProvisional(state: string | null | undefined): boolean {
  return state !== 'final';
}

/** Word-for-word the mobile result screen's notice, so the two never drift. */
export function provisionalTitle(t: Translate): string {
  return t('Résultats provisoires', 'Rezilta pwovizwa');
}

export function provisionalDetail(t: Translate): string {
  return t(
    'Les prix sont confirmés après vérification. Les gagnants seront contactés.',
    'Nou konfime pri yo apre verifikasyon. N ap kontakte moun ki genyen yo.',
  );
}

// ── The month, for the teaser ───────────────────────────────────────────────

const MONTHS_FR = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
];
const MONTHS_HT = [
  'JANVYE', 'FEVRIYE', 'MAS', 'AVRIL', 'ME', 'JEN',
  'JIYÈ', 'OUT', 'SEPTANM', 'OKTÒB', 'NOVANM', 'DESANM',
];

/**
 * "CODOSA — CHAMPIONS DE SEPTEMBRE".
 *
 * Month names are a table rather than `Intl`: Kreyòl has no ICU locale here,
 * and a French month printed under a Kreyòl broadcast is exactly the kind of
 * half-translation the app's own i18n rules exist to stop.
 */
export function championsLine(shortName: string, at: number, t: Translate): string {
  const month = new Date(safe(at)).getMonth();
  const name = (shortName || '').toUpperCase();
  const label = t(MONTHS_FR[month] ?? '', MONTHS_HT[month] ?? '');
  return t(`${name} — CHAMPIONS DE ${label}`, `${name} — CHANPYON ${label}`);
}

/** "CHAMPIONS DE SEPTEMBRE" on its own, for the frame that sets the name big. */
export function championsTitle(at: number, t: Translate): string {
  const month = new Date(safe(at)).getMonth();
  const label = t(MONTHS_FR[month] ?? '', MONTHS_HT[month] ?? '');
  return t(`CHAMPIONS DE ${label}`, `CHANPYON ${label}`);
}

/**
 * "1ER", "2E", "3E" — and CHAMPION for the top step, because "1ER PLACE" is not
 * what anybody shouts when the winner lands.
 */
export function rankLabel(rank: number, t: Translate): string {
  const r = Math.max(0, Math.floor(safe(rank)));
  if (r === 1) return t('CHAMPION', 'CHANPYON');
  if (r === 2) return t('2E PLACE', '2YÈM PLAS');
  if (r === 3) return t('3E PLACE', '3YÈM PLAS');
  return t(`${r}E PLACE`, `${r}YÈM PLAS`);
}

// ── One staggered entrance, shared by every finale scene ────────────────────

/**
 * The entrance for the n-th element of a staggered group: 320ms, 14px, 55ms
 * apart, exactly as section K specifies and `sceneContract` declares.
 *
 * Reduced motion returns no animation at all rather than a shortened one — the
 * cards are already all present in the DOM, so removing the travel costs the
 * viewer nothing but the movement they asked not to see.
 */
export function staggerStyle(index: number, reduceMotion: boolean): CSSProperties {
  if (reduceMotion) return { animation: 'none' };
  const delay = Math.max(0, Math.floor(safe(index))) * STAGGER_MS;
  return {
    animation: `stage-enter ${ENTER_MS}ms ${ENTER_EASE} ${delay}ms both`,
    ['--stage-travel' as string]: `${TRAVEL_PX}px`,
  };
}
