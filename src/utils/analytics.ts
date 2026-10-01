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

export function track(name: string, params?: AnalyticsParams): void {
  try {
    if (typeof window === 'undefined') return;
    const gtag = (window as any).gtag;
    if (typeof gtag !== 'function') return;
    gtag('event', name, params);
  } catch {
    /* analytics is best-effort */
  }
}
