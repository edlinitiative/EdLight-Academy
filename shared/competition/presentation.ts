/**
 * Competition presentation — the pure rules behind the motion and the cues
 * (roadmap P2 "Arena presentation"). No React, no DOM, no audio: the web room,
 * the projector and the Expo screens all read the same answers, and the tests
 * run without a renderer.
 *
 *  - `presentationPhase`  ONE phase name for a room or a projector, from the
 *    tournament state and the live document. Transitions are keyed on it, so a
 *    newer authoritative phase always replaces a cosmetic one.
 *  - `phaseCue`           which cue (sound on the web, haptic on the phone) a
 *    phase change earns. Reading phases earn nothing.
 *  - `answerCue`          the student's own reveal: correct / wrong / none.
 *  - `standingsMoves`     how far each row moved between two boards, so a
 *    reorder can be animated from where the row was and labelled "▲ 2".
 *  - `boardLines`         the rows a public board shows (named teams, school or
 *    class teams, or players), with the school context each one carries.
 */
import type { LiveState, Standings } from '../tournois/models';
import { identityText } from './deletedAccount';

export type PresentationPhase =
  | 'lobby'      // before the first question (scheduled, or live/lobby)
  | 'question'   // a question is open
  | 'reveal'     // the answer is shown
  | 'interval'   // running, between documents (no question on screen)
  | 'results'    // finished: the podium
  | 'cancelled';

export function presentationPhase(
  tournamentState: string | null | undefined,
  live: Pick<LiveState, 'phase'> | null | undefined,
): PresentationPhase {
  if (tournamentState === 'cancelled') return 'cancelled';
  if (tournamentState === 'finished' || live?.phase === 'done') return 'results';
  if (live?.phase === 'question') return 'question';
  if (live?.phase === 'reveal') return 'reveal';
  if (tournamentState === 'scheduled' || live?.phase === 'lobby' || !tournamentState) return 'lobby';
  return 'interval';
}

/** The short cue vocabulary shared by both platforms. */
export type CompetitionCue = 'roundStart' | 'locked' | 'correct' | 'wrong' | 'podium';

/**
 * The cue a phase change earns. Only real beats: a question opening, and the
 * results arriving. The reveal itself is personal (see `answerCue`), and a
 * first render (prev === null) never fires — opening a room mid-question is
 * not a round starting.
 */
export function phaseCue(prev: PresentationPhase | null, next: PresentationPhase): CompetitionCue | null {
  if (prev === null || prev === next) return null;
  if (next === 'question') return 'roundStart';
  if (next === 'results' && prev !== 'cancelled') return 'podium';
  return null;
}

/** The student's own outcome at the reveal; nothing when they did not answer. */
export function answerCue(picked: number | null | undefined, answer: number | null | undefined): CompetitionCue | null {
  if (picked == null || answer == null || picked < 0) return null;
  return picked === answer ? 'correct' : 'wrong';
}

export interface RowMove {
  /** Places gained since the previous board (positive = moved up). 0 for new rows. */
  delta: number;
  /** Not on the previous board. */
  entered: boolean;
}

/**
 * Movement between two orderings of row keys. `prev` null (the first board a
 * viewer sees) means nothing moved: a row is never announced as "new" just
 * because the page loaded.
 */
export function standingsMoves(prev: readonly string[] | null | undefined, next: readonly string[]): Record<string, RowMove> {
  const out: Record<string, RowMove> = {};
  const before = new Map<string, number>();
  (prev || []).forEach((k, i) => { if (!before.has(k)) before.set(k, i); });
  next.forEach((k, i) => {
    if (!prev) { out[k] = { delta: 0, entered: false }; return; }
    const was = before.get(k);
    out[k] = was == null ? { delta: 0, entered: true } : { delta: was - i, entered: false };
  });
  return out;
}

/** True when any row changed place (the board deserves its reorder beat). */
export function boardMoved(moves: Record<string, RowMove>): boolean {
  return Object.values(moves).some((m) => m.delta !== 0 || m.entered);
}

export interface BoardLine {
  key: string;
  rank: number;
  name: string;
  points: number;
  /** The school this row stands for or plays for (crest + colours), when known. */
  school: string | null;
  /** Player rows: the face to draw. */
  face?: { seed: string; avatar?: string | null };
  kind: 'team' | 'squad' | 'player';
}

/**
 * The rows a public board shows. Named teams first (they ARE the contest when
 * present), then school/class squads, then players. `teamRule === 'school'`
 * makes a squad's label a school name, so it gets a crest.
 */
export function boardLines(
  board: Standings | null | undefined,
  lang: 0 | 1,
  limit: number,
  teamRule?: string | null,
): BoardLine[] {
  if (!board) return [];
  if (board.namedTeams?.length) {
    return board.namedTeams.slice(0, limit).map((r) => ({
      key: `t:${r.id}`, rank: r.rank, name: identityText(r.label, lang), points: r.points, school: null, kind: 'team',
    }));
  }
  if (board.teams?.length) {
    return board.teams.slice(0, limit).map((r) => ({
      key: `s:${r.key}`,
      rank: r.rank,
      name: identityText(r.label, lang),
      points: r.score,
      school: teamRule === 'school' ? r.label : null,
      kind: 'squad',
    }));
  }
  return (board.rows || []).slice(0, limit).map((r) => ({
    key: `p:${r.uid}`,
    rank: r.rank,
    name: identityText(r.displayName, lang),
    points: r.points,
    school: r.school || null,
    face: { seed: r.uid, avatar: r.avatar },
    kind: 'player',
  }));
}

/** Seconds left on the clock, never negative; null when no question is open. */
export function secondsLeft(live: Pick<LiveState, 'phase' | 'closesAt'> | null | undefined, now: number): number | null {
  if (!live || live.phase !== 'question') return null;
  return Math.max(0, Math.ceil((live.closesAt - now) / 1000));
}
