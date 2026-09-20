/**
 * alias — the name a student is shown by in public.
 *
 * ONE derivation, because a student is about to be asked to CONFIRM this name
 * before a tournament, and a confirmation screen that computes the name
 * differently from the server that publishes it is worse than no confirmation
 * at all: it shows them one thing and puts another on a stream.
 *
 * Before this module there were four copies — `api/arena/_shared.ts`,
 * `api/challenges/create.ts`, `api/challenges/accept.ts`, and a FIFTH rule in
 * `mobile/.../LeaderboardJoinModal.tsx` that returned the first name alone
 * where every server copy returns "Ted J.". The Arena lobby needs the server's
 * answer, so the server's answer moves here.
 *
 * Most of this audience is under 18 and the Arena standings go on a public
 * broadcast: a minor's full name must never reach a board.
 */

/**
 * Is this something we are willing to print next to a score?
 *
 * "Contains a letter", and no stricter — this is the server's existing rule,
 * moved rather than rewritten. Tightening it here would silently drop names
 * that are on boards today, which is not a change to make while fixing a
 * confirmation screen.
 */
export function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/**
 * Is this good enough to SAVE from an input field?
 *
 * Stricter than `isValidAlias` on purpose, and only ever applied to something
 * a student just typed: a board row is one line, so no control characters, and
 * two characters is the shortest thing anyone recognises themselves by.
 * Existing stored names are never re-judged by this.
 */
export function isAcceptableAliasInput(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 24) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  return isValidAlias(trimmed);
}

/**
 * "Ted Olivier Jacquet" → "Ted J."
 *
 * First name plus a last initial: enough for a student to recognise
 * themselves on a board, not enough for a stranger watching a stream to
 * identify a child.
 *
 * Returns null when there is nothing usable, and null is a real answer — the
 * standings render an empty name and the leaderboard prompts for one rather
 * than inventing it. A name we made up is worse on a broadcast than no name.
 */
export function defaultAlias(name: string | undefined | null): string | null {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !isValidAlias(parts[0])) return null;
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/**
 * The auth layer substitutes "Élève"/"Elèv" when Firebase has no name at all.
 * That is a placeholder, not a name, and prefilling a confirmation field with
 * it would have students confirming a word the product chose for them.
 */
export function isPlaceholderName(name: string | undefined | null): boolean {
  return /^(élève|eleve|elèv|elev|student|etidyan)$/i.test(String(name || '').trim());
}
