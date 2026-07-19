/**
 * Lightweight client platform detection for the "get the app" prompts.
 * UA sniffing is imperfect but fine for a best-effort store redirect/banner.
 */

export const APP_STORE_URL = 'https://apps.apple.com/app/id6792210920';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.edlightacademy';
/** Device-detecting smart link (QR target) — forwards to the right store. */
export const DOWNLOAD_URL = 'https://academy.edlight.org/download';

export type MobilePlatform = 'ios' | 'android';

/** Returns 'ios' | 'android' for phones/tablets, or null on desktop/unknown. */
export function getMobilePlatform(): MobilePlatform | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac; disambiguate via touch points.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

/** True when the page is running as an installed PWA / standalone app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    // iOS Safari legacy flag
    (navigator as any).standalone === true
  );
}

/** Store URL for a given platform. */
export function storeUrlFor(platform: MobilePlatform): string {
  return platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
}
