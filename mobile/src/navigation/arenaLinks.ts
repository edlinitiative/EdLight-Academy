/**
 * The one URL contract the app shares with the web routes (src/App.tsx).
 *
 * Pure and framework-free so the parsing rules can be tested without a
 * navigator. AppNavigator's `linking.getStateFromPath` calls `resolveAppPath`
 * first and only falls back to React Navigation's default parser for paths
 * this module does not own.
 *
 * Web route                    → app destination
 * ─────────────────────────────────────────────────────────────────────────
 * /defi/:code                  → Defi (code must be a real duel code)
 * /arena                       → ArenaHub
 * /arena/championnat           → ArenaHub (championship section)
 * /arena/jouer                 → ArenaHub (it offers the one-tap rejoin)
 * /arena/jouer/:tid            → ArenaLobby(tid)   (valid id shape only)
 * /arena/demo                  → ArenaHub(section demo): explains the web
 *                                simulation and opens it in a browser
 * /arena/histoire, /arena/studio and every other reserved word
 *                              → ArenaHub (web-only pages; never a tournament)
 * /arena/:tid (app scheme)     → ArenaLobby(tid)   (valid id shape only)
 * /arena/<anything else>       → ArenaHub
 *
 * Reserved words exist because `arena/:tournamentId` used to swallow
 * `championnat` and `demo` as if they were tournament ids, which opened a
 * lobby for an event that does not exist. A reserved word can never be a
 * tournament id here, whatever its shape.
 *
 * /arena/reclamation and /arena/autorisation are deliberately NOT claimed by
 * the Android intent filters (app.json): the claim and parental-consent forms
 * live on the web only. If one reaches the app through the custom scheme it
 * lands on the hub rather than a broken screen.
 */

/** Mirrors `isValidTournamentId` in api/arena/_shared.ts — keep in sync. */
const TOURNAMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Mirrors the duel-code check in api/challenges/accept.ts (no 0/O/1/I/L). */
const DUEL_CODE_RE = /^[2-9A-Z]{8}$/;

/**
 * Path segments under /arena that are web pages, never tournament ids.
 * Lowercase; matching is case-insensitive.
 */
export const RESERVED_ARENA_SEGMENTS: readonly string[] = [
  'championnat',
  'demo',
  'histoire',
  'studio',
  'jouer',
  'reclamation',
  'autorisation',
  'direct',
  'regles',
  'resultats',
];

export function isReservedArenaSegment(segment: string): boolean {
  return RESERVED_ARENA_SEGMENTS.includes(segment.toLowerCase());
}

export function isValidTournamentId(value: unknown): value is string {
  return typeof value === 'string'
    && TOURNAMENT_ID_RE.test(value)
    && !isReservedArenaSegment(value);
}

export function normalizeDuelCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return DUEL_CODE_RE.test(code) ? code : null;
}

export type ArenaHubSection = 'championnat' | 'demo';

/** The web demo — an offline simulation with fictional schools (never a real event). */
export const ARENA_DEMO_URL = 'https://academy.edlight.org/arena/demo';

export type LinkTarget =
  | { screen: 'Defi'; params: { code: string } }
  | { screen: 'ArenaHub'; params?: { section?: ArenaHubSection } }
  | { screen: 'ArenaLobby'; params: { tournamentId: string } }
  | { screen: 'ArenaWatch'; params?: { tournamentId?: string } }
  | { screen: 'Main'; params: { screen: 'Trivia' } };

const HOSTS = ['academy.edlight.org', 'www.academy.edlight.org'];

/**
 * Reduce whatever the OS handed us to path segments.
 *
 * React Navigation gives `getStateFromPath` the part after the prefix
 * ("arena/demo?x=1"), but a full URL is accepted too so the function is
 * honest on its own.
 */
export function pathSegments(input: string): string[] {
  let p = (input || '').trim();
  p = p.replace(/^edlight:\/\//i, '');
  p = p.replace(/^https?:\/\//i, '');
  for (const host of HOSTS) {
    if (p.toLowerCase().startsWith(host)) { p = p.slice(host.length); break; }
  }
  p = p.split('#')[0].split('?')[0];
  return p.split('/').map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  }).filter(Boolean);
}

/**
 * The destination for a path, or null when the path is not ours (Arena or
 * duel) and the default parser should handle it.
 */
export function resolveAppPath(input: string): LinkTarget | null {
  const segs = pathSegments(input);
  if (segs.length === 0) return null;
  const head = segs[0].toLowerCase();

  if (head === 'defi') {
    const code = normalizeDuelCode(segs[1]);
    // A mistyped or truncated code is still a duel invitation: the Jeux tab
    // is where duels live, and a dead ChallengeScreen is not a destination.
    return code ? { screen: 'Defi', params: { code } } : { screen: 'Main', params: { screen: 'Trivia' } };
  }

  if (head !== 'arena') return null;

  const sub = segs[1];
  if (!sub) return { screen: 'ArenaHub' };
  const subLower = sub.toLowerCase();

  if (subLower === 'championnat') return { screen: 'ArenaHub', params: { section: 'championnat' } };
  // The demo is a web simulation: the hub explains it and opens it in a
  // browser. Never ArenaWatch, which would resolve a REAL live event (M7).
  if (subLower === 'demo') return { screen: 'ArenaHub', params: { section: 'demo' } };
  if (subLower === 'jouer') {
    const tid = segs[2];
    return isValidTournamentId(tid) ? { screen: 'ArenaLobby', params: { tournamentId: tid } } : { screen: 'ArenaHub' };
  }
  if (isReservedArenaSegment(subLower)) return { screen: 'ArenaHub' };

  // /arena/:tid — only when the segment can actually be a tournament id, and
  // only when nothing follows it (no web route has /arena/:tid/...).
  if (segs.length === 2 && isValidTournamentId(sub)) {
    return { screen: 'ArenaLobby', params: { tournamentId: sub } };
  }
  return { screen: 'ArenaHub' };
}

/**
 * The navigation state for a resolved target: always with Main underneath,
 * so the back gesture from a deep-linked screen lands somewhere real instead
 * of closing the app.
 */
export interface LinkState {
  routes: Array<{ name: string; params?: object; state?: { routes: Array<{ name: string }> } }>;
}

export function stateForTarget(target: LinkTarget): LinkState {
  if (target.screen === 'Main') {
    return { routes: [{ name: 'Main', state: { routes: [{ name: target.params.screen }] } }] };
  }
  return {
    routes: [
      { name: 'Main' },
      target.params ? { name: target.screen, params: target.params } : { name: target.screen },
    ],
  };
}
