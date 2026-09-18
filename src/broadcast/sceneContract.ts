/**
 * The seam between the director and the twenty sequences.
 *
 * `shared/arena/director.ts` decides WHAT should be on screen — it consumes the
 * typed event feed, holds the board as its resting state, and enforces the
 * dwell rules that stop a scene being cut before it can be read. It has never
 * had a consumer: until now the only file importing it was its own test.
 *
 * This module is the other half. It fixes one contract that every scene is
 * written against, so that a scene can be built, reviewed and replaced on its
 * own without any scene knowing about any other. That isolation is the whole
 * reason twenty sequences are tractable at all.
 *
 * ── The rules every scene inherits (section K of the design doc) ────────────
 * Built from the mark's straight rays, hairline rules, tabular mono figures,
 * coral as the single flourish. NO gradients, NO glass, NO particles, NO neon.
 * Motion exists to say what changed, never to decorate.
 *
 *   Enter  320ms  cubic-bezier(0.16, 1, 0.3, 1)  ·  14px of travel
 *   Exit   180ms
 *   A rank movement always TRAVELS — a row never teleports, because the travel
 *   is the information.
 *   A ray sweep marks a gain. Nothing else uses it.
 *   One number is the biggest thing on screen. Never two.
 *
 * ── What a scene may and may not do ────────────────────────────────────────
 * A scene is a pure function of its props. It does not subscribe to Firestore,
 * does not hold a timer that outlives it, and does not decide when it leaves —
 * the director owns that, and a scene that sets its own exit will fight the
 * dwell rules and flicker on the one night anybody is watching.
 *
 * `elapsed` is the scene's own clock. Drive internal beats from it rather than
 * from a local interval: it is monotonic, it survives a re-render, and it is
 * the same number the director is using to decide when this scene ends.
 */

import type { ComponentType } from 'react';
import type { ArenaEvent, StandingsSnapshot } from '../../shared/arena/events';
import type { Scene } from '../../shared/arena/director';

/**
 * A school or a player, placed on the map of Haiti.
 *
 * Declared here rather than imported so the stage never blocks on the data
 * layer that fills it. `shared/arena/mapPlaces.ts` builds these from a
 * tournament; `HaitiMap` renders them.
 *
 * `kind` is load-bearing and the two are NOT interchangeable: a player's place
 * is the ville they chose on their own profile, and a school's is where a
 * person said the school is. Students board, move and travel across communes,
 * so treating one as a proxy for the other is how a school ends up on the map
 * in a town it has never been in — a mistake this product has already shipped
 * once and rebuilt its data to undo.
 */
export type PlaceKind = 'school' | 'player';

export interface MapPlace {
  /** Commune or department, spelled as in `src/data/haitiGeo.ts`. */
  name: string;
  kind: PlaceKind;
  /** Stable identity, so an arrivals animation knows what is genuinely new. */
  id: string;
  /** A school's short name (CODOSA). Players carry none — they are the crowd. */
  label?: string;
  value?: number;
  active?: boolean;
}

/** The tournament as the stage needs it. Public fields only — no answer keys. */
export interface StageTournament {
  id: string;
  title: string;
  state: string;
  startsAt: number;
  doorsAt: number;
  questionCount: number;
  currentIndex: number;
  counts: { schools: number; players: number; qualifiedSchools: number };
}

/**
 * Everything every scene is allowed to read.
 *
 * One object rather than a dozen props because scenes are swapped by a
 * registry: a scene cannot be given bespoke props without the registry knowing
 * which scene it is, and the moment the registry knows that, adding a sequence
 * means editing the registry and every author collides on one file.
 */
export interface StageData {
  tournament: StageTournament | null;
  standings: StandingsSnapshot | null;
  /** Schools and players, ready for `HaitiMap`. */
  places: MapPlace[];
  /** Schools we cannot place. Shown honestly, never hidden. */
  unplacedSchools: number;
  isCreole: boolean;
  /** The wall clock the whole stage shares. */
  now: number;
}

export interface SceneProps {
  scene: Scene;
  data: StageData;
  /** Milliseconds this scene has held the screen. Monotonic. */
  elapsed: number;
  /**
   * The viewer asked for less motion. Honour it by removing TRAVEL and holds,
   * never by removing information: a scene that says nothing in reduced motion
   * has failed the person who needed it most.
   */
  reduceMotion: boolean;
  /** Bilingual copy. The stage is French-first with Kreyòl alongside. */
  t: (fr: string, ht: string) => string;
}

export type SceneComponent = ComponentType<SceneProps>;

// ── Shared motion constants ─────────────────────────────────────────────────

export const ENTER_MS = 320;
export const EXIT_MS = 180;
export const ENTER_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const TRAVEL_PX = 14;
/** Staggered card entrances, per the halftime sequence. */
export const STAGGER_MS = 55;

/**
 * The first event a scene speaks for, typed at the call site.
 *
 * `scene.composed` carries every event the scene is telling one story about;
 * `scene.event` is the one that earned the screen. A scene that reads
 * `composed` must tell ONE combined story — playing them back to back is what
 * the director's composition exists to prevent.
 */
export function primaryEvent(scene: Scene): ArenaEvent | null {
  return scene.event ?? scene.composed?.[0] ?? null;
}

/** A scene's payload, narrowed. Returns null rather than throwing on a mismatch. */
export function payloadOf<T>(scene: Scene, kind: string): T | null {
  const event = primaryEvent(scene);
  if (!event || event.type !== kind) return null;
  return (event.payload ?? null) as T | null;
}
