/**
 * The bundle budget rules (scripts/bundle_budget_core.mjs), and the committed
 * baseline's shape. The CLI (`npm run perf:budget`) runs against a real build.
 */
import fs from 'fs';
import path from 'path';
import { chunkName, compare, initialAssetsFromHtml, measure } from '../../scripts/bundle_budget_core.mjs';

const HTML = `<!doctype html><html><head>
<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/x.woff2">
<link rel="preload" as="script" href="/js/runtime.0123456789abcdef.js" fetchpriority="low">
<link rel="preload" as="script" href="/js/react.0123456789abcdef.js">
<link href="/css/main.0123456789abcdef.css" rel="stylesheet">
<link rel="stylesheet" href="/css/home.0123456789abcdef.css">
</head><body><script defer src="/js/main.0123456789abcdef.js"></script><script>inline()</script></body></html>`;

const files = [
  { path: 'js/runtime.0123456789abcdef.js', raw: 4000, gz: 2000 },
  { path: 'js/react.0123456789abcdef.js', raw: 200000, gz: 70000 },
  { path: 'js/main.0123456789abcdef.js', raw: 200000, gz: 60000 },
  { path: 'js/571.0123456789abcdef.js', raw: 500000, gz: 100000 },
  { path: 'js/firebase.0123456789abcdef.js', raw: 480000, gz: 140000 },
  { path: 'css/main.0123456789abcdef.css', raw: 300000, gz: 60000 },
  { path: 'css/home.0123456789abcdef.css', raw: 20000, gz: 5000 },
];

describe('bundle budget measurement', () => {
  it('names chunks by webpack name and ignores unstable numeric ids', () => {
    expect(chunkName('js/main.a1bf21b4f75e25cb4e60.js')).toBe('main.js');
    expect(chunkName('css/main.07357d4937f5a1958620.css')).toBe('main.css');
    expect(chunkName('js/571.e31c54dc406698586114.js')).toBeNull();
    expect(chunkName('js/duel-bank.68d4f7205f18c1ecddcb.js')).toBe('duel-bank.js');
  });

  it('reads the initial assets from the landing HTML (scripts, script preloads, stylesheets)', () => {
    const a = initialAssetsFromHtml(HTML);
    expect(a.js.sort()).toEqual(['js/main.0123456789abcdef.js', 'js/react.0123456789abcdef.js', 'js/runtime.0123456789abcdef.js']);
    expect(a.css.sort()).toEqual(['css/home.0123456789abcdef.css', 'css/main.0123456789abcdef.css']);
  });

  it('measures initial, totals, largest async and named chunks', () => {
    const { metrics, missing } = measure(files, HTML);
    expect(metrics.initialJsGz).toBe(132000);
    expect(metrics.initialCssGz).toBe(65000);
    expect(metrics.totalJsGz).toBe(372000);
    expect(metrics.largestAsyncJsGz).toBe(140000);
    expect(metrics['named:firebase.js']).toBe(140000);
    expect(missing).toEqual([]);
  });
});

describe('bundle budget comparison', () => {
  it('fails a regression beyond the tolerance, never a shrink', () => {
    const r = compare({ initialJsGz: 112, totalJsGz: 80 }, { initialJsGz: 100, totalJsGz: 100 }, 10);
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.name === 'initialJsGz')!.status).toBe('over');
    expect(r.rows.find((x) => x.name === 'totalJsGz')!.status).toBe('ok');
  });

  it('allows growth within the tolerance', () => {
    expect(compare({ initialJsGz: 109 }, { initialJsGz: 100 }, 10).ok).toBe(true);
  });

  it('reports new and gone metrics without failing', () => {
    const r = compare({ 'named:new.js': 5 }, { 'named:old.js': 5 }, 10);
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => x.status).sort()).toEqual(['gone', 'new']);
  });
});

describe('committed baseline', () => {
  it('exists with a tolerance and the core metrics', () => {
    const file = path.join(__dirname, '..', '..', 'perf', 'bundle-budget.json');
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(b.tolerancePct).toBeGreaterThan(0);
    expect(b.tolerancePct).toBeLessThanOrEqual(15);
    for (const k of ['initialJsGz', 'initialCssGz', 'totalJsGz', 'totalCssGz', 'largestAsyncJsGz']) {
      expect(typeof b.metrics[k]).toBe('number');
    }
  });
});
