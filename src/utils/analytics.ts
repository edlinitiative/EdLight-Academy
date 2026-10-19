/**
 * The one place the app talks to GA4 (gtag is loaded in src/index.html).
 *
 * Conversion events (sign_up, lesson_complete, quiz_complete,
 * app_download_click) are marked as key events in GA4 and imported into
 * Google Ads, so call sites must fire only once the action has actually
 * succeeded. Never pass names, emails or any other personal data in params.
 *
 * Safe everywhere: a no-op when gtag is missing (SSR/prerender, blockers,
 * tests) and it never throws into the caller.
 */
export type AnalyticsParams = Record<string, unknown>;

type Gtag = (...args: unknown[]) => void;

function getGtag(): Gtag | null {
  if (typeof window === 'undefined') return null;
  const gtag = (window as any).gtag;
  return typeof gtag === 'function' ? gtag : null;
}

/**
 * index.html fetches gtag.js only after the page has loaded, to keep it off
 * the critical path. When an event has to leave before the visitor does, ask
 * for the library now. Idempotent; a no-op when the loader is absent.
 */
function loadGtagNow(): void {
  try {
    const load = (window as any).__edlightLoadGtag;
    if (typeof load === 'function') load();
  } catch {
    /* best-effort */
  }
}

export function track(name: string, params?: AnalyticsParams): void {
  try {
    const gtag = getGtag();
    if (!gtag) return;
    gtag('event', name, params);
  } catch {
    /* analytics is best-effort */
  }
}

/**
 * For a click that takes the visitor to another site in a new tab (store
 * badges). The page stays open, but on a phone it is backgrounded at once, so
 * the hit goes out as a beacon, and the library is requested now in case the
 * click came before it loaded.
 */
export function trackOutbound(name: string, params?: AnalyticsParams): void {
  try {
    const gtag = getGtag();
    if (!gtag) return;
    loadGtagNow();
    gtag('event', name, { ...params, transport_type: 'beacon' });
  } catch {
    /* analytics is best-effort */
  }
}

/**
 * For an event that is immediately followed by leaving the page in the same
 * tab (e.g. /download forwarding a phone to its store). Runs `then` once the
 * hit has been handed to the browser, or after `timeoutMs` at the latest, so
 * a blocked or slow tag can never strand the visitor. `then` runs exactly once.
 */
export function trackThenLeave(
  name: string,
  params: AnalyticsParams | undefined,
  then: () => void,
  timeoutMs = 1500,
): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    then();
  };
  try {
    const gtag = getGtag();
    if (!gtag) {
      finish();
      return;
    }
    loadGtagNow();
    setTimeout(finish, timeoutMs);
    gtag('event', name, {
      ...params,
      transport_type: 'beacon',
      // Called per destination once sent; `finish` ignores all but the first.
      event_callback: finish,
      event_timeout: timeoutMs,
    });
  } catch {
    finish();
  }
}

/** localStorage key the inline consent defaults in index.html also read. */
export const ANALYTICS_OPT_OUT_KEY = 'edlight_analytics_optout';

const ALL_SIGNALS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] as const;

export function isAnalyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The visitor's own choice, from the privacy page. Declining denies every
 * Consent Mode signal now and on later visits (index.html reads the flag
 * before gtag starts); allowing again grants them.
 */
export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
    else localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
  } catch {
    /* private mode: the choice still applies to this page view below */
  }
  try {
    const gtag = getGtag();
    if (!gtag) return;
    const state = optOut ? 'denied' : 'granted';
    const update: Record<string, string> = {};
    ALL_SIGNALS.forEach((k) => { update[k] = state; });
    gtag('consent', 'update', update);
  } catch {
    /* best-effort */
  }
}
