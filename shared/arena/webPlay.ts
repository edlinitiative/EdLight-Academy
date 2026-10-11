/**
 * arena/webPlay — may a student PLAY the Arena in a web browser?
 *
 * Ted, 2026-10-10: "for now let people play on laptops as well — I just want
 * to be able to test everything, then we'll put the barriers after."
 *
 * So this is ON. It is the single switch the web reads to decide between the
 * play room (`/arena/jouer`) and the "install the app to play" message; flip it
 * to `false` and every web surface falls back to registration-only, exactly as
 * it was on 2026-09-21. Nothing server-side reads it: the API already accepts a
 * submission with no App Check token as normal ("absent" is never flagged), so
 * re-gating later is a client decision first and an enforcement decision
 * (App Check on the answer endpoint) second, if ever.
 *
 * Kept in `shared/` so the mobile app, the admin console and any later server
 * check can read the same answer instead of three copies drifting apart.
 */
export const ARENA_WEB_PLAY = true;
