/**
 * shared/arena/mapPlaces — a tournament's geography, turned into map pins.
 * ───────────────────────────────────────────────────────────────────────────
 * The broadcast shows a map of Haiti with the schools racing on it and the
 * students watching from everywhere else. This module is the whole of the
 * decision about WHAT goes on that map; `HaitiMap` owns how it is drawn.
 *
 * Pure. No Firestore, no React, no clock. The same reason `scoring.ts` is
 * pure: the stage is a live broadcast and every rule it renders has to be
 * reproducible from data afterwards, not only observable at 18:41.
 *
 * ── THE RULE THIS FILE EXISTS TO HOLD ───────────────────────────────────────
 *
 * A student's residence is NOT their school's location, and nothing here may
 * turn one into the other. The product already shipped that mistake once:
 * school addresses were derived from applicants' "Addresse de residence", which
 * split Saint-Louis de Gonzague into two schools, and `schools-seed.json` was
 * rebuilt carrying no location at all as a result.
 *
 * So a school's commune arrives here already stated by a person, or it arrives
 * as null — and a null school is NOT placed. It is counted, honestly, in
 * `schoolsWithoutLocation`, and the stage says "12 écoles · 9 situées" rather
 * than quietly drawing nine pins as if that were all of them. Students board,
 * move, and cross communes to get to school; the modal ville of forty players
 * is evidence about forty students and about nothing else.
 *
 * ── WHY PLAYERS ARE COUNTED PER PLACE AND NOT PINNED ONE BY ONE ─────────────
 *
 * Most of this audience is under 18 and the stage is a public stream. One pin
 * per uid publishes "this student lives in this commune", which is a fact about
 * a minor that no part of this product has ever asked permission to broadcast —
 * the standings already hide nameless entries rather than invent names for
 * them. A commune with a count is the same picture of where the country is
 * watching from, and says nothing about any one student.
 */

export type PlaceKind = 'school' | 'player';

/** The map component's contract. Fixed — do not widen it from this side. */
export interface MapPlace {
  /** Commune or department name, as spelled in haitiGeo.ts. */
  name: string;
  kind: PlaceKind;
  /** Stable identity: the same pin keeps the same id across ticks. */
  id: string;
  /** School short name — what the stage has room for. */
  label?: string;
  value?: number;
  active?: boolean;
}

/**
 * One school in the tournament.
 *
 * `commune` is nullable and that is the point of the type. An empty string and
 * a missing field mean the same thing here — nobody has said where this school
 * is — and both must survive as "unknown" rather than as ''.
 */
export interface MapSchoolInput {
  /** `schoolKey()` from shared/schools.ts — the key the board groups by. */
  key: string;
  /** Short name if the school has one, else its full name. Never derived. */
  label: string;
  /** Stated by a person (an admin, or the student who added the school). */
  commune: string | null;
  /** Players this school fields in this tournament. */
  players?: number;
  /** Qualified schools are the ones actually racing. */
  qualified?: boolean;
}

/**
 * One player in the tournament, with the geography THEY chose on their own
 * leaderboard profile. Never their school's.
 */
export interface MapPlayerInput {
  uid: string;
  /** The ville the student picked in their profile, or null. */
  city: string | null;
  /** Their département — coarser, and the only placement left when the ville
   *  is missing (the Diaspora entry has no ville list at all). */
  department: string | null;
  /** Answering right now, on the current question. */
  active?: boolean;
}

export interface MapPlacesResult {
  places: MapPlace[];
  /** Schools in this tournament. */
  schoolsTotal: number;
  /**
   * Schools nobody has said the location of. Not an error and not a number to
   * hide: until a human types them in, this equals `schoolsTotal`.
   */
  schoolsWithoutLocation: number;
  playersTotal: number;
  /** Players with neither a ville nor a département on their profile. */
  playersWithoutLocation: number;
}

/** A name is present only if it is a non-empty string once trimmed. */
function place(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Turn a tournament's schools and players into the map's input array.
 *
 * Spelling is NOT canonicalised here, deliberately. Both writers already
 * validated against the one vocabulary — a school's commune through
 * `/api/schools/location`, a player's ville through the profile picker — so
 * folding names a second time here, with a copy of the rules that could drift,
 * is how "Port-au-Prince" and "Port au Prince" become two pins. A name this
 * function cannot trust is a bug upstream, and it travels through visibly
 * rather than being silently re-spelt.
 *
 * The output order is deterministic: schools by descending player count then
 * key, players by descending count then name. The stage re-renders this every
 * tick, and pins that reshuffle because a Map iterated differently is a map
 * that looks broken on camera.
 */
export function selectMapPlaces(input: {
  schools: readonly MapSchoolInput[];
  players: readonly MapPlayerInput[];
}): MapPlacesResult {
  const schools = input.schools ?? [];
  const players = input.players ?? [];

  // ── Schools ───────────────────────────────────────────────────────────────
  const schoolPlaces: MapPlace[] = [];
  let schoolsWithoutLocation = 0;

  for (const school of schools) {
    const commune = place(school.commune);
    if (!commune) {
      // NOT placed, and NOT guessed at from where this school's players live.
      schoolsWithoutLocation += 1;
      continue;
    }
    schoolPlaces.push({
      name: commune,
      kind: 'school',
      id: `school:${school.key}`,
      label: school.label,
      value: Math.max(0, Math.round(school.players ?? 0)),
      active: school.qualified === true,
    });
  }

  schoolPlaces.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.id.localeCompare(b.id));

  // ── Players, aggregated per place ─────────────────────────────────────────
  //
  // Ville first, département second. A student in the Diaspora entry has no
  // ville to pick, and dropping them for it would empty the one part of the map
  // that shows the tournament being watched from outside the country.
  const byPlace = new Map<string, { count: number; active: boolean }>();
  let playersWithoutLocation = 0;

  for (const player of players) {
    const name = place(player.city) ?? place(player.department);
    if (!name) {
      playersWithoutLocation += 1;
      continue;
    }
    const cell = byPlace.get(name) ?? { count: 0, active: false };
    cell.count += 1;
    cell.active = cell.active || player.active === true;
    byPlace.set(name, cell);
  }

  const playerPlaces: MapPlace[] = [...byPlace.entries()]
    .map(([name, cell]) => ({
      name,
      kind: 'player' as const,
      // Keyed by the place, not by a uid: this pin is a count of students, and
      // it has to be the same pin next tick even as individuals come and go.
      id: `players:${name}`,
      value: cell.count,
      active: cell.active,
    }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name));

  return {
    places: [...schoolPlaces, ...playerPlaces],
    schoolsTotal: schools.length,
    schoolsWithoutLocation,
    playersTotal: players.length,
    playersWithoutLocation,
  };
}
