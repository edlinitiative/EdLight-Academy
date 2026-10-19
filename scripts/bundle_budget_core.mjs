/**
 * Bundle budget — pure measurement + comparison (no fs, no process), so the
 * rules are unit-tested (src/__tests__/bundleBudget.test.ts) and the CLI
 * (scripts/bundle_budget.mjs) only does I/O.
 *
 * What is measured, from the production build output (dist/):
 *   initialJsGz   gzip bytes of every script the landing HTML loads or preloads
 *                 (runtime, react, i18n, the shared vendor chunk, main)
 *   initialCssGz  gzip bytes of the stylesheets linked by the landing HTML
 *   totalJsGz     every emitted .js file
 *   totalCssGz    every emitted .css file
 *   largestAsyncJsGz   the biggest single non-initial .js chunk
 *   named:<name>  each NAMED chunk (webpack names: firebase, markdown, home…)
 *
 * A metric fails when it exceeds its baseline by more than `tolerancePct`
 * (default 10%). Shrinking never fails; refresh the baseline with --update so
 * the gain is locked in.
 */

/** "js/main.a1bf21b4f75e25cb4e60.js" → "main"; numeric ids → null (unstable names). */
export function chunkName(file) {
  const base = String(file).split('/').pop() || '';
  const m = /^(.+?)\.[0-9a-f]{8,}\.(js|css)$/.exec(base);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? null : `${m[1]}.${m[2]}`;
}

/** Assets the landing HTML pulls in before the app is usable. */
export function initialAssetsFromHtml(html) {
  const js = new Set();
  const css = new Set();
  const attr = (tag, name) => {
    const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i').exec(tag);
    return m ? m[1] : null;
  };
  for (const tag of String(html).match(/<script\b[^>]*>/gi) || []) {
    const src = attr(tag, 'src');
    if (src && /\.js(\?|$)/.test(src)) js.add(src.replace(/^\//, ''));
  }
  for (const tag of String(html).match(/<link\b[^>]*>/gi) || []) {
    const href = attr(tag, 'href');
    if (!href) continue;
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const as = (attr(tag, 'as') || '').toLowerCase();
    if (rel === 'stylesheet' && /\.css(\?|$)/.test(href)) css.add(href.replace(/^\//, ''));
    if ((rel === 'preload' || rel === 'modulepreload') && as === 'script' && /\.js(\?|$)/.test(href)) js.add(href.replace(/^\//, ''));
  }
  return { js: [...js], css: [...css] };
}

/**
 * @param files  [{ path: 'js/main.x.js', gz: number, raw: number }]
 * @param html   the landing page HTML
 */
export function measure(files, html) {
  const initial = initialAssetsFromHtml(html);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const sum = (paths) => paths.reduce((n, p) => n + (byPath.get(p)?.gz || 0), 0);
  const js = files.filter((f) => f.path.endsWith('.js'));
  const css = files.filter((f) => f.path.endsWith('.css'));
  const initialJs = new Set(initial.js);
  const asyncJs = js.filter((f) => !initialJs.has(f.path));
  const metrics = {
    initialJsGz: sum(initial.js),
    initialCssGz: sum(initial.css),
    totalJsGz: js.reduce((n, f) => n + f.gz, 0),
    totalCssGz: css.reduce((n, f) => n + f.gz, 0),
    largestAsyncJsGz: asyncJs.reduce((n, f) => Math.max(n, f.gz), 0),
  };
  for (const f of files) {
    const name = chunkName(f.path);
    if (name) metrics[`named:${name}`] = (metrics[`named:${name}`] || 0) + f.gz;
  }
  const missing = [...initial.js, ...initial.css].filter((p) => !byPath.has(p));
  return { metrics, initial, missing };
}

/**
 * Compare against the baseline. Returns rows and `ok`. A metric absent from
 * the baseline is reported as `new` (not a failure); a baseline metric absent
 * now is `gone` (not a failure — e.g. a chunk merged away).
 */
export function compare(current, baseline, tolerancePct = 10) {
  const rows = [];
  const names = new Set([...Object.keys(baseline || {}), ...Object.keys(current || {})]);
  for (const name of [...names].sort()) {
    const was = baseline?.[name];
    const now = current?.[name];
    if (was == null) { rows.push({ name, was: null, now, deltaPct: null, status: 'new' }); continue; }
    if (now == null) { rows.push({ name, was, now: null, deltaPct: null, status: 'gone' }); continue; }
    const deltaPct = was > 0 ? ((now - was) / was) * 100 : (now > 0 ? Infinity : 0);
    const status = deltaPct > tolerancePct ? 'over' : 'ok';
    rows.push({ name, was, now, deltaPct, status });
  }
  return { ok: rows.every((r) => r.status !== 'over'), rows };
}

export const kb = (n) => (n == null ? '—' : `${(n / 1024).toFixed(1)} KB`);
