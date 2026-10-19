/**
 * returnPath — where to send a student after sign-in (P0 validation A-2).
 *
 * A signed-out visit to a signed-in-only page (/dashboard) redirects to "/"
 * with `?next=<path>`; once the session is confirmed, "/" sends the student
 * on to that path. Only same-site paths are accepted, so `next` can never be
 * used to bounce a student to another site (open redirect).
 */

const MAX_LEN = 512;

/** A same-origin path: "/x…", never "//host", "/\\host", a scheme or control characters. */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.trim();
  if (!p || p.length > MAX_LEN) return null;
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(p)) return null;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(p)) return null;
  // "/" itself is where the student already is.
  if (p === '/' || p.startsWith('/?') || p.startsWith('/#')) return null;
  return p;
}

/** "/" carrying the destination, for a signed-out redirect. */
export function signInRedirect(pathWithSearch: string): string {
  const safe = safeInternalPath(pathWithSearch);
  return safe ? `/?next=${encodeURIComponent(safe)}` : '/';
}

/** The validated destination from a "/?next=…" search string, or null. */
export function readNextParam(search: string): string | null {
  try {
    return safeInternalPath(new URLSearchParams(search).get('next'));
  } catch {
    return null;
  }
}
