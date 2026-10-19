/**
 * homeSpotlight — which time-sensitive thing, if any, opens the Home page.
 *
 * Owner feedback (TestFlight build 61): when the Arène has an event, it was a
 * small plain row buried under the courses, goal and stats — "when there is
 * an event this should be the main thing on the page". The stronger, later
 * rule (no hero bands) still holds: it becomes the FIRST CONTENT CARD, not a
 * banner above the page.
 *
 * Only one thing may take that slot, and only something real and current that
 * the student can act on now. Priority:
 *
 *   live now  >  starting soon  >  registration open (closing at doors)
 *
 * Ties break on the earlier start. Everything here is pure (state in, facts
 * out) so web and mobile share one ordering and one tested set of rules.
 */

export type SpotlightUrgency = 'live' | 'soon' | 'registration';

/** "Starting soon" for a tournament the student is in: the next two hours. */
export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000;
/**
 * A user tournament whose start passed without the server noticing yet
 * (state is advanced lazily, on the next tick) still counts as "live" for
 * this long — after that, an un-ticked `scheduled` doc is stale, not live.
 */
export const LATE_START_GRACE_MS = 30 * 60 * 1000;

const RANK: Record<SpotlightUrgency, number> = { live: 0, soon: 1, registration: 2 };

export interface SpotlightLike {
  urgency: SpotlightUrgency;
  startsAt: number;
}

/** The one item that takes the first card, or null. */
export function pickSpotlight<T extends SpotlightLike>(items: ReadonlyArray<T | null | undefined>): T | null {
  let best: T | null = null;
  for (const it of items) {
    if (!it) continue;
    if (
      !best ||
      RANK[it.urgency] < RANK[best.urgency] ||
      (RANK[it.urgency] === RANK[best.urgency] && (it.startsAt || Infinity) < (best.startsAt || Infinity))
    ) {
      best = it;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The Arène championship
// ---------------------------------------------------------------------------

export type ArenaSpotlightPhase =
  /** Sign-up open; the student has not registered. */
  | 'register'
  /** Sign-up open; the student is already in. */
  | 'registered'
  /** Doors open — the room is filling. */
  | 'doors'
  /** Live, and the student is registered: get back in. */
  | 'live-play'
  /** Live, not registered: sign-up has closed, but it can be watched. */
  | 'live-watch';

export interface ArenaLikeTournament {
  id: string;
  title: string;
  state: string;
  startsAt: number;
  doorsAt?: number;
}

export interface ArenaSpotlight extends SpotlightLike {
  kind: 'arena';
  id: string;
  title: string;
  phase: ArenaSpotlightPhase;
  /** The moment the countdown runs to, or null (live). */
  countdownTo: number | null;
  countdownKind: 'doors' | 'start' | null;
}

/**
 * The championship as a spotlight item. `open` is a tournament in
 * registration/doors, `active` one in live (or later — only `live` counts).
 * `registered` is about whichever of the two is shown.
 */
export function arenaSpotlight(input: {
  open: ArenaLikeTournament | null | undefined;
  active: ArenaLikeTournament | null | undefined;
  registered: boolean;
  now: number;
}): ArenaSpotlight | null {
  const { open, active, registered, now } = input;
  // An event in progress outranks a future one being announced.
  if (active && active.state === 'live') {
    return {
      kind: 'arena', id: active.id, title: active.title, startsAt: active.startsAt,
      urgency: 'live', phase: registered ? 'live-play' : 'live-watch',
      countdownTo: null, countdownKind: null,
    };
  }
  if (!open) return null;
  if (open.state === 'doors') {
    const toStart = open.startsAt > now ? open.startsAt : null;
    return {
      kind: 'arena', id: open.id, title: open.title, startsAt: open.startsAt,
      urgency: 'soon', phase: 'doors',
      countdownTo: toStart, countdownKind: toStart ? 'start' : null,
    };
  }
  if (open.state === 'registration') {
    // Registration closes when the doors open; count to that when it is still
    // ahead, else to the start. A date already behind us is never counted.
    const doors = open.doorsAt && open.doorsAt > now ? open.doorsAt : null;
    const start = open.startsAt > now ? open.startsAt : null;
    const to = doors ?? start;
    return {
      kind: 'arena', id: open.id, title: open.title, startsAt: open.startsAt,
      // A registered student whose event starts within the window is "soon".
      urgency: registered && start && start - now <= SOON_WINDOW_MS ? 'soon' : 'registration',
      phase: registered ? 'registered' : 'register',
      countdownTo: to, countdownKind: to ? (doors ? 'doors' : 'start') : null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// A user tournament the student is in (Tournois)
// ---------------------------------------------------------------------------

export interface TournoiSpotlight extends SpotlightLike {
  kind: 'tournoi';
  id: string;
  title: string;
  countdownTo: number | null;
  playerCount: number | null;
}

/**
 * The tournament from `users/{uid}/myTournaments` to watch closely: the one
 * whose start is nearest and still relevant (not more than the grace period
 * in the past, not further than the soon window ahead).
 */
export function nearestTournoi<T extends { tid: string; startsAt: number }>(
  mine: ReadonlyArray<T> | null | undefined,
  now: number,
  pastWindowMs = 6 * 60 * 60 * 1000,
): T | null {
  const rows = (mine || []).filter(
    (m) => m && m.tid && m.startsAt >= now - pastWindowMs && m.startsAt <= now + SOON_WINDOW_MS,
  );
  if (rows.length === 0) return null;
  // Prefer one that has started (possibly running) over one still ahead.
  return rows.sort((a, b) => Math.abs(a.startsAt - now) - Math.abs(b.startsAt - now))[0];
}

/** A watched user tournament as a spotlight item, from its live state. */
export function tournoiSpotlight(
  doc: { id: string; title: string; state: string; startsAt: number; playerCount?: number } | null | undefined,
  now: number,
): TournoiSpotlight | null {
  if (!doc) return null;
  const base = { kind: 'tournoi' as const, id: doc.id, title: doc.title, startsAt: doc.startsAt, playerCount: typeof doc.playerCount === 'number' ? doc.playerCount : null };
  if (doc.state === 'running') return { ...base, urgency: 'live', countdownTo: null };
  if (doc.state === 'scheduled') {
    if (doc.startsAt > now && doc.startsAt - now <= SOON_WINDOW_MS) {
      return { ...base, urgency: 'soon', countdownTo: doc.startsAt };
    }
    if (doc.startsAt <= now && now - doc.startsAt <= LATE_START_GRACE_MS) {
      return { ...base, urgency: 'live', countdownTo: null };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time, in Haiti
// ---------------------------------------------------------------------------

const HAITI_TZ = 'America/Port-au-Prince';
const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKDAYS_HT = ['dimanch', 'lendi', 'madi', 'mèkredi', 'jedi', 'vandredi', 'samdi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_HT = ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Parts { weekday: number; day: number; month: number; hour: number; minute: number }

/** Calendar parts of `ms` on the Port-au-Prince clock (device clock as a fallback). */
export function haitiParts(ms: number): Parts {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: HAITI_TZ, weekday: 'short', day: 'numeric', month: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekday = WEEKDAY_EN.indexOf(get('weekday'));
    const out = {
      weekday,
      day: Number(get('day')),
      month: Number(get('month')) - 1,
      hour: Number(get('hour')) % 24,
      minute: Number(get('minute')),
    };
    if (weekday >= 0 && [out.day, out.month, out.hour, out.minute].every(Number.isFinite)) return out;
  } catch {
    /* fall through to the device clock */
  }
  const d = new Date(ms);
  return { weekday: d.getDay(), day: d.getDate(), month: d.getMonth(), hour: d.getHours(), minute: d.getMinutes() };
}

/**
 * "samedi 25 octobre · 19 h 00, heure d'Haïti" /
 * "samdi 25 oktòb · 19:00, lè Ayiti". Empty for a missing date.
 */
export function haitiDateTime(ms: number, isCreole: boolean): string {
  if (!ms) return '';
  const p = haitiParts(ms);
  const mm = p.minute < 10 ? `0${p.minute}` : String(p.minute);
  if (isCreole) return `${WEEKDAYS_HT[p.weekday]} ${p.day} ${MONTHS_HT[p.month]} · ${p.hour}:${mm}, lè Ayiti`;
  return `${WEEKDAYS_FR[p.weekday]} ${p.day} ${MONTHS_FR[p.month]} · ${p.hour} h ${mm}, heure d’Haïti`;
}

/** "02:14:09", or "2j 03:04:05" past a day (the lobby's own format). */
export function spotlightCountdown(msRemaining: number): string {
  const s = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(s / 86400);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const clock = `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return days > 0 ? `${days}j ${clock}` : clock;
}
