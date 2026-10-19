/**
 * Runs the inline Google tag bootstrap from src/index.html, as the browser
 * would, and checks what it queues for gtag.js: Consent Mode v2 defaults, the
 * landing URL on the first page_view, and that the library itself is always
 * requested.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((m) => m[1]);
const bootstrap = scripts.find((s) => s.includes("gtag('consent'"));

type Call = unknown[];

function run(): Call[] {
  (window as any).dataLayer = [];
  new Function(`${bootstrap}\nwindow.gtag = gtag;`)();
  return ((window as any).dataLayer as IArguments[]).map((a) => Array.from(a));
}

function consentDefaults(calls: Call[]) {
  return calls.filter((c) => c[0] === 'consent' && c[1] === 'default').map((c) => c[2] as Record<string, unknown>);
}

describe('index.html Google tag bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    window.history.replaceState({}, '', '/?gclid=TEST123&utm_source=google');
  });

  afterEach(() => {
    delete (window as any).gtag;
    delete (window as any).__edlightLoadGtag;
  });

  it('exists and is plain ES5 (it is inlined, never transpiled)', () => {
    expect(bootstrap).toBeDefined();
    const code = bootstrap!.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });

  it('denies all four signals in the EEA, UK and Switzerland, and grants them elsewhere', () => {
    const [regional, global] = consentDefaults(run());
    const signals = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];
    signals.forEach((k) => {
      expect(regional[k]).toBe('denied');
      expect(global[k]).toBe('granted');
    });
    expect(global.region).toBeUndefined();
    const region = regional.region as string[];
    ['FR', 'DE', 'IE', 'IS', 'LI', 'NO', 'GB', 'CH', 'GP', 'MQ'].forEach((cc) => expect(region).toContain(cc));
    expect(region).not.toContain('HT');
    expect(region).not.toContain('US');
  });

  it('denies everything everywhere for a visitor who declined', () => {
    localStorage.setItem('edlight_analytics_optout', '1');
    const defaults = consentDefaults(run());
    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('sets consent defaults before config, and passes ad click ids through', () => {
    const calls = run();
    const firstConsent = calls.findIndex((c) => c[0] === 'consent');
    const config = calls.findIndex((c) => c[0] === 'config');
    expect(firstConsent).toBeGreaterThanOrEqual(0);
    expect(firstConsent).toBeLessThan(config);
    expect(calls).toContainEqual(['set', 'url_passthrough', true]);
    const linker = calls.find((c) => c[0] === 'set' && c[1] === 'linker');
    expect((linker![2] as any).domains).toEqual(expect.arrayContaining([
      'edlight.org', 'www.edlight.org', 'apply.edlight.org', 'academy.edlight.org', 'code.edlight.org',
    ]));
  });

  it('sends the first page_view with the landing URL, gclid included, even if the router rewrites it later', () => {
    const calls = run();
    window.history.replaceState({}, '', '/jeux'); // the app redirecting before gtag.js arrives
    expect(calls).toContainEqual(['config', 'G-KNBX35H1X1', { send_page_view: false }]);
    const pageView = calls.find((c) => c[0] === 'event' && c[1] === 'page_view');
    expect((pageView![2] as any).page_location).toContain('gclid=TEST123');
  });

  it('always requests gtag.js, and only once', () => {
    run();
    expect(typeof (window as any).__edlightLoadGtag).toBe('function');
    (window as any).__edlightLoadGtag();
    (window as any).__edlightLoadGtag();
    const tags = document.head.querySelectorAll('script[src="https://www.googletagmanager.com/gtag/js?id=G-KNBX35H1X1"]');
    expect(tags).toHaveLength(1);
  });
});
