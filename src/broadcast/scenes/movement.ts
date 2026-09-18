/**
 * The arithmetic behind the movement sequences.
 *
 * Every scene in this folder that says "the standings changed" needs the same
 * handful of sums: where a lane has to start so that it can TRAVEL to where it
 * now is, what shape a comeback drew, how far a counter has got, which players
 * to name. Those sums are the part that can be wrong in a way nobody sees until
 * it is on a projector in front of a school, so they live here — plain
 * functions, no React, no clock — and are tested in
 * `src/utils/__tests__/broadcastMovement.test.ts`.
 *
 * ── Why the motion itself is CSS and not this file ─────────────────────────
 * The stage ticks once every 100ms for the whole broadcast. That is the right
 * clock for a number counting up — ten steps a second on tabular figures reads
 * as a counter — and completely the wrong one for travel: a lane sliding at
 * 10fps is a stutter, and the travel IS the information. So `elapsed` drives
 * VALUES here, and the transforms are CSS keyframes given their start offset
 * through a custom property. Nothing in this folder animates a layout property,
 * and nothing runs a timer of its own.
 */

import { NAMED_CAUSES, type ArenaCause, type ArenaEvent, type ArenaEventType } from '../../../shared/arena/events';
import type { Scene } from '../../../shared/arena/director';

// ── Clock ───────────────────────────────────────────────────────────────────

export interface Timing {
  /** Milliseconds into the scene before this value starts moving. */
  delayMs?: number;
  durationMs: number;
}

/** How far through a beat the scene is, 0..1, clamped at both ends. */
export function progressAt(elapsed: number, timing: Timing): number {
  const delay = timing.delayMs ?? 0;
  const duration = Math.max(1, timing.durationMs);
  if (!Number.isFinite(elapsed)) return 1;
  return Math.min(1, Math.max(0, (elapsed - delay) / duration));
}

/**
 * A value-space stand-in for `cubic-bezier(0.16, 1, 0.3, 1)`.
 *
 * Not the same curve — the real one is solved by the compositor for transforms.
 * This is only ever applied to a NUMBER being counted, where what matters is
 * that it leaves fast and settles slowly, so the figure spends most of its time
 * near the value it is going to hold.
 */
export function easeOutStage(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 1 - (1 - c) ** 4;
}

/** Interpolate between two real values. `reduceMotion` lands immediately. */
export function valueAt(from: number, to: number, elapsed: number, timing: Timing, reduceMotion = false): number {
  if (reduceMotion) return to;
  return from + (to - from) * easeOutStage(progressAt(elapsed, timing));
}

/** A figure counting up to a value it then holds. */
export function countUpAt(to: number, elapsed: number, timing: Timing, reduceMotion = false): number {
  return valueAt(0, to, elapsed, timing, reduceMotion);
}

/**
 * Where the tie counter opens.
 *
 * The margin is the whole story of sequence 12 and it is a small number, so it
 * is announced by being ARRIVED AT: the readout opens at a round figure above
 * the true gap and closes onto it, the way a measurement settles. It lands well
 * before the scene ends and holds the true value for the rest of it, and under
 * reduced motion it is the true value from the first frame.
 */
export function tieCountdownStart(margin: number): number {
  const m = Number.isFinite(margin) ? Math.abs(margin) : 0;
  return Math.max(1, Math.ceil(m) + 1);
}

/** The tie margin as it stands at `elapsed`, counting down onto the truth. */
export function tieMarginAt(margin: number, elapsed: number, timing: Timing, reduceMotion = false): number {
  const target = Number.isFinite(margin) ? Math.abs(margin) : 0;
  return valueAt(tieCountdownStart(target), target, elapsed, timing, reduceMotion);
}

// ── Lanes ───────────────────────────────────────────────────────────────────

export type LaneRole = 'mover' | 'passed' | 'still';

export interface LaneTravel {
  rank: number;
  role: LaneRole;
  /**
   * Where this lane must START, relative to where it now sits, in whatever
   * unit `laneHeight` was given in. Positive is below. The scenes pass 1 — one
   * lane — and write it out as `calc(var(--mv-lane-h) * n)`, so the travel
   * stays exact at every breakpoint without measuring the DOM.
   *
   * The lanes are rendered in the SETTLED order and given this as their
   * keyframe origin — a FLIP — so the board the viewer is looking at is always
   * the true one, and the motion is the change itself rather than a
   * re-enactment of it.
   */
  offset: number;
}

/**
 * The travel a climb puts on every lane in view.
 *
 * A school going 5 → 3 does not move alone: the two lanes it passed each drop
 * one place in the same motion, and that simultaneity is what makes it read as
 * overtaking rather than as two unrelated slides.
 */
export function overtakeTravel(from: number, to: number, ranks: number[], laneHeight = 1): LaneTravel[] {
  const rows = (ranks || []).map((rank) => ({ rank, role: 'still' as LaneRole, offset: 0 }));
  if (!(from > to) || !Number.isFinite(laneHeight)) return rows;
  return rows.map((row) => {
    if (row.rank === to) return { ...row, role: 'mover' as LaneRole, offset: (from - to) * laneHeight };
    if (row.rank > to && row.rank <= from) return { ...row, role: 'passed' as LaneRole, offset: -laneHeight };
    return row;
  });
}

/**
 * Which slice of the board to show, guaranteeing the ranks the scene is about
 * are inside it.
 *
 * A climb from 11 to 4 shown on a top-8 board is a lane appearing from nowhere.
 * Inclusive, 1-based, and never wider than the board.
 */
export function laneWindow(total: number, focus: number[], size: number): { start: number; end: number } {
  const cap = Math.max(1, Math.min(size, Math.max(1, total)));
  const marks = (focus || []).filter((r) => Number.isFinite(r) && r >= 1 && r <= total);
  if (marks.length === 0) return { start: 1, end: cap };

  const lo = Math.min(...marks);
  const hi = Math.max(...marks);
  if (hi - lo + 1 >= cap) return { start: lo, end: hi };

  const span = cap - 1;
  let start = Math.round((lo + hi) / 2 - span / 2);
  start = Math.max(1, Math.min(start, total - span));
  return { start, end: start + span };
}

// ── The comeback's shape ────────────────────────────────────────────────────

export interface RankStep { from: number; to: number }

/**
 * The rank path a comeback actually drew.
 *
 * `ComebackPayload` carries only where the school was at its worst and where it
 * is now, which would be a straight line — and a straight line is a decoration,
 * not a story. The intermediate points come from the events the DIRECTOR
 * composed into this scene: every `SCHOOL_OVERTAKE` and `BIGGEST_CLIMBER` about
 * the same school carries a real `from`/`to`. Nothing here is interpolated;
 * a point is on the line because it happened.
 *
 * Steps outside the span between the worst rank and now are dropped rather than
 * drawn: they belong to a different part of the night, and a path that wanders
 * off its own axis claims something the payload never said.
 */
export function rankPath(wasRank: number, nowRank: number, steps: RankStep[] = []): number[] {
  const out: number[] = [];
  const lo = Math.min(wasRank, nowRank);
  const hi = Math.max(wasRank, nowRank);
  const push = (rank: number) => {
    if (!Number.isFinite(rank) || rank < 1) return;
    if (rank < lo || rank > hi) return;
    if (out.length > 0 && out[out.length - 1] === rank) return;
    out.push(rank);
  };

  push(wasRank);
  for (const step of steps || []) {
    push(step?.from);
    push(step?.to);
  }
  push(nowRank);

  if (out.length === 0) return [];
  if (out.length === 1) return [out[0], out[0]];
  return out;
}

export interface Point { x: number; y: number }

/**
 * The path in the box. Rank 1 is the top edge, the worst rank on the path is
 * the bottom edge — the chart's own extent, so the climb always uses the full
 * height it earned rather than being flattened by a board of 40 schools.
 */
export function rankPathPoints(ranks: number[], width: number, height: number): Point[] {
  const rows = (ranks || []).filter((r) => Number.isFinite(r));
  if (rows.length === 0) return [];
  const best = Math.min(...rows);
  const worst = Math.max(...rows);
  const span = worst - best;
  const round = (n: number) => Math.round(n * 100) / 100;

  return rows.map((rank, i) => ({
    x: round(rows.length === 1 ? 0 : (i / (rows.length - 1)) * width),
    y: round(span === 0 ? height / 2 : ((rank - best) / span) * height),
  }));
}

export function polylinePoints(points: Point[]): string {
  return (points || []).map((p) => `${p.x},${p.y}`).join(' ');
}

// ── Who caused it ───────────────────────────────────────────────────────────

const causesOf = (event: ArenaEvent | null | undefined): ArenaCause[] => {
  const payload = (event?.payload ?? null) as { causedBy?: unknown } | null;
  const list = payload?.causedBy;
  return Array.isArray(list) ? (list as ArenaCause[]).filter((c) => c && typeof c.uid === 'string') : [];
};

/**
 * One list of names for a scene that may be speaking for several events.
 *
 * A composed scene — she entered the five, so the school passed three others —
 * has the same student named in two payloads. Merging by uid and summing the
 * gain is what turns that into one sentence instead of the same name read out
 * twice.
 */
export function mergeCauses(lists: ArenaCause[][]): ArenaCause[] {
  const byUid = new Map<string, ArenaCause>();
  for (const list of lists || []) {
    for (const cause of list || []) {
      if (!cause || typeof cause.uid !== 'string') continue;
      const seen = byUid.get(cause.uid);
      const gained = Number.isFinite(cause.gained) ? cause.gained : 0;
      if (seen) seen.gained += gained;
      else byUid.set(cause.uid, { ...cause, gained });
    }
  }
  return [...byUid.values()].sort((a, b) => b.gained - a.gained || a.uid.localeCompare(b.uid));
}

/** Every cause this scene speaks for, merged. */
export function sceneCauses(scene: Scene): ArenaCause[] {
  const events = scene?.composed?.length ? scene.composed : [scene?.event].filter(Boolean) as ArenaEvent[];
  return mergeCauses((events || []).map(causesOf));
}

/** Three names is what a scene can say out loud; the rest are counted. */
export function namedCauses(causes: ArenaCause[], limit = NAMED_CAUSES): { named: ArenaCause[]; others: number } {
  const all = causes || [];
  return { named: all.slice(0, limit), others: Math.max(0, all.length - limit) };
}

/**
 * The other things this scene is also about, in order, deduped.
 *
 * Used to add ONE clause to the story — "· entre dans les cinq" — never to play
 * a second scene after the first.
 */
export function composedKinds(scene: Scene): ArenaEventType[] {
  const primary = scene?.event?.type ?? scene?.composed?.[0]?.type ?? null;
  const out: ArenaEventType[] = [];
  for (const event of scene?.composed || []) {
    if (!event || event.type === primary || out.includes(event.type)) continue;
    out.push(event.type);
  }
  return out;
}

// ── The five ────────────────────────────────────────────────────────────────

export interface SubSlot {
  uid: string;
  index: number;
  role: 'incoming' | 'held';
}

/**
 * The school's five as slots, with the arriving player's slot identified.
 *
 * The standings have already settled by the time the scene plays, so the five
 * here is the NEW five: the slot the newcomer occupies is the one the displaced
 * team-mate just vacated, which is exactly where the outgoing card has to fade
 * and drop from for the substitution to read.
 */
export function substitutionSlots(top5: string[], incomingUid: string | null, size = 5): { slots: SubSlot[]; vacatedIndex: number } {
  const base = (top5 || []).filter((uid) => typeof uid === 'string' && uid).slice(0, size);
  if (incomingUid && !base.includes(incomingUid) && base.length < size) base.push(incomingUid);

  const slots = base.map((uid, index) => ({
    uid,
    index,
    role: (uid === incomingUid ? 'incoming' : 'held') as SubSlot['role'],
  }));
  return { slots, vacatedIndex: slots.findIndex((s) => s.role === 'incoming') };
}

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * A school's lane colour, derived from its key.
 *
 * Section L: a hue we assign is OUR wayfinding and a crest is theirs, so this
 * is only ever drawn as an edge bar, never as a fill and never as a stand-in
 * for a school's real colours. FNV-1a so the same school gets the same lane on
 * every screen in the room.
 */
export function schoolHue(key: string): number {
  let hash = 2166136261;
  const text = typeof key === 'string' ? key : '';
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

// ── One story, not two ──────────────────────────────────────────────────────

export type Translate = (fr: string, ht: string) => string;

/**
 * The clause a composed event adds to the scene that is already playing.
 *
 * The director hands a scene every event about the same school. Played one
 * after another those are a notification feed; what section I&J asks for is one
 * sentence — *she came into the five, so they passed three schools*. So a
 * secondary event never gets its own moment here: it gets a few words appended
 * to the moment that is already on screen.
 */
export function movementClause(kind: ArenaEventType, t: Translate): string | null {
  switch (kind) {
    case 'LEAD_CHANGE': return t('prend la tête', 'pran tèt la');
    case 'SCHOOL_OVERTAKE': return t('gagne des places', 'genyen plas');
    case 'PLAYER_ENTERS_TOP_5': return t('nouvelle entrée dans les cinq', 'nouvo antre nan senk yo');
    case 'PLAYER_LEAVES_TOP_5': return t('changement dans les cinq', 'chanjman nan senk yo');
    case 'PERFECT_ROUND': return t('tour sans faute', 'tou san fot');
    case 'PLAYER_STREAK': return t('série en cours', 'seri ap kontinye');
    case 'SCHOOL_STREAK': return t('série d’école', 'seri lekòl');
    case 'COMEBACK': return t('remontée', 'remonte');
    case 'BIGGEST_CLIMBER': return t('plus belle progression', 'pi gwo pwogrè');
    case 'PLAYER_CARRY': return t('portée par un seul joueur', 'yon sèl jwè ap pote l');
    default: return null;
  }
}

/** Every other event this scene speaks for, as one appended clause. */
export function composedClause(scene: Scene, t: Translate): string | null {
  const parts = composedKinds(scene)
    .map((kind) => movementClause(kind, t))
    .filter((clause): clause is string => !!clause);
  return parts.length > 0 ? parts.join(' · ') : null;
}
