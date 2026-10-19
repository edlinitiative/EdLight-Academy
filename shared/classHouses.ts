/**
 * House groups inside one class: pure validation and balancing.
 *
 * A teacher splits an approved roster into 2 to 6 named, coloured houses. Auto
 * balance is a snake draft over recent practice XP, so headcounts differ by at
 * most one and the strongest students are spread out (1-2-3-3-2-1…). Ties fall
 * back to the uid so the same roster always gives the same split.
 */
import { ClassError, HOUSE_COLORS, HOUSE_LIMITS, type ClassHouse, type HouseColor } from './classes';

const COLOR_IDS = HOUSE_COLORS.map((c) => c.id) as readonly string[];

/** Validate a teacher's house list. Names are trimmed, colours unique, ids positional (h1…h6). */
export function parseHouses(input: unknown): ClassHouse[] {
  if (!Array.isArray(input) || input.length < HOUSE_LIMITS.min || input.length > HOUSE_LIMITS.max) throw new ClassError('invalid_input');
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    const color = typeof raw?.color === 'string' ? raw.color : '';
    if (!name || name.length > HOUSE_LIMITS.name || !COLOR_IDS.includes(color) || seen.has(color)) throw new ClassError('invalid_input');
    seen.add(color);
    return { id: `h${i + 1}`, name, color: color as HouseColor };
  });
}

/** Snake draft: order by strength (desc), then deal 0,1,…,k-1,k-1,…,0. */
export function balanceHouses(uids: string[], houseIds: string[], strength: Record<string, number> = {}): Record<string, string> {
  if (!houseIds.length) return {};
  const order = [...uids].sort((a, b) => (strength[b] || 0) - (strength[a] || 0) || a.localeCompare(b));
  const k = houseIds.length;
  return Object.fromEntries(order.map((uid, i) => {
    const round = Math.floor(i / k), pos = i % k;
    return [uid, houseIds[round % 2 === 0 ? pos : k - 1 - pos]];
  }));
}

/** The house with the fewest members (first one on ties): where a newly approved student goes. */
export function smallestHouse(houseIds: string[], houseOf: Record<string, string>, memberUids: string[]): string | null {
  if (!houseIds.length) return null;
  const counts = new Map(houseIds.map((id) => [id, 0]));
  for (const uid of memberUids) {
    const h = houseOf[uid];
    if (counts.has(h)) counts.set(h, (counts.get(h) || 0) + 1);
  }
  return houseIds.reduce((best, id) => ((counts.get(id) || 0) < (counts.get(best) || 0) ? id : best), houseIds[0]);
}

/**
 * Keep existing assignments whose house still exists, then place everyone else
 * in the currently smallest house. Used when a teacher renames or recolours.
 */
export function keepAndFill(memberUids: string[], houseIds: string[], previous: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const uid of memberUids) if (houseIds.includes(previous[uid])) out[uid] = previous[uid];
  for (const uid of memberUids) if (!out[uid]) out[uid] = smallestHouse(houseIds, out, memberUids) as string;
  return out;
}
