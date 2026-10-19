/**
 * shared/arena/arcadeCity — the Arène city's layout rules, for web and phone.
 *
 * The web /arena (src/pages/arena/ArenaArcade.tsx) and the phone's Arène hub
 * (mobile/src/components/arena/city/ArenaCity.tsx) draw the same night city:
 * a far skyline of anonymous blocks, the mornes, and a street of real schools
 * as pixel buildings (schoolBuilding.ts) whose height is their team score.
 * These rules decide WHO stands on the street, in what order and how tall —
 * so the two cities can never disagree.
 *
 * Pure: no React, no DOM, no network.
 */
import type { TeamStanding } from '../leaderboardAgg';

/** A school's floors on the street: 2–6, proportional to its team XP. */
export function floorsFor(teamXp: number, maxXp: number): number {
  if (!maxXp || !(maxXp > 0)) return 2;
  const ratio = Math.max(0, Math.min(1, (Number(teamXp) || 0) / maxXp));
  return 2 + Math.round(ratio * 4);
}

export interface FarBlock {
  x: number;
  w: number;
  h: number;
  /** Lit windows, in the same user units as the block. */
  lit: { x: number; y: number }[];
}

/**
 * A far skyline, deterministic (a Lehmer generator from `seed`) so it never
 * reshuffles between renders or devices. Blocks stand on y = `ground`.
 */
export function farSkyline(seed = 7, width = 1600, ground = 220): FarBlock[] {
  let s = Math.max(1, Math.floor(seed)) % 2147483647;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const blocks: FarBlock[] = [];
  let x = 0;
  while (x < width) {
    const w = 26 + Math.round(rnd() * 50);
    const h = 40 + Math.round(rnd() * 120);
    const lit: { x: number; y: number }[] = [];
    for (let wy = 8; wy < h - 8; wy += 12) {
      for (let wx = 6; wx < w - 6; wx += 10) if (rnd() < 0.16) lit.push({ x: x + wx, y: ground - h + wy });
    }
    blocks.push({ x, w, h, lit });
    x += w + Math.round(rnd() * 6);
  }
  return blocks;
}

/** The mornes behind the city, on a 1600 × 200 canvas (stretched to fit). */
export const MORNES_PATH =
  'M0 200 L0 120 C120 70 210 60 320 104 C420 140 470 64 600 52 C720 40 790 120 900 112 C1010 104 1060 34 1190 40 C1310 46 1370 118 1480 100 C1540 92 1580 80 1600 84 L1600 200 Z';

export type CityTower = TeamStanding & { floors: number };

/**
 * The street: the top `max` schools by team score, tallest in the middle so
 * the city reads as a podium. The student's school joins even when it is not
 * in the top — a student always finds their building.
 */
export function cityLineup(
  standings: readonly TeamStanding[],
  mine: TeamStanding | null,
  max = 7,
): CityTower[] {
  const top = standings.slice(0, Math.max(0, max));
  if (mine && !top.some((s) => s.key === mine.key)) top.push(mine);
  const maxXp = Math.max(1, ...top.map((s) => s.teamXp || 0));
  const sorted = [...top].sort((a, b) => (b.teamXp || 0) - (a.teamXp || 0));
  const podium: TeamStanding[] = [];
  sorted.forEach((s, i) => (i % 2 === 0 ? podium.push(s) : podium.unshift(s)));
  return podium.map((s) => ({ ...s, floors: floorsFor(s.teamXp || 0, maxXp) }));
}

/**
 * The tag over a building: an official rank only for a qualified school,
 * otherwise its roster count ("3/5") — a placement is earned, never implied.
 */
export function towerTag(s: Pick<TeamStanding, 'qualified' | 'rank' | 'members'>, teamSize: number): string {
  return s.qualified && s.rank > 0 ? `#${s.rank}` : `${Math.min(s.members || 0, teamSize)}/${teamSize}`;
}
