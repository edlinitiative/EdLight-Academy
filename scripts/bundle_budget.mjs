#!/usr/bin/env node
/**
 * Web bundle budget (roadmap §6 Performance, release PRE-11 / §8 profile).
 *
 *   npm run build && npm run perf:budget            check dist/ against the baseline
 *   npm run perf:budget -- --update                 accept the current sizes as the baseline
 *   npm run perf:budget -- --dir dist --json        machine-readable output
 *
 * Baseline: perf/bundle-budget.json. Exits 1 when any metric grew by more than
 * the baseline's `tolerancePct` (10%). Sizes are gzip -9 of the emitted files —
 * a lab measurement of transfer weight, not a device timing.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { compare, kb, measure } from './bundle_budget_core.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const root = process.cwd();
const dir = path.resolve(root, opt('--dir', 'dist'));
const budgetPath = path.resolve(root, opt('--budget', 'perf/bundle-budget.json'));

if (!fs.existsSync(path.join(dir, 'index.html'))) {
  console.error(`bundle budget: no build at ${dir} (run npm run build first)`);
  process.exit(2);
}

const files = [];
for (const sub of ['js', 'css']) {
  const d = path.join(dir, sub);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!/\.(js|css)$/.test(f)) continue;
    const buf = fs.readFileSync(path.join(d, f));
    files.push({ path: `${sub}/${f}`, raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length });
  }
}
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const { metrics, initial, missing } = measure(files, html);

const budget = fs.existsSync(budgetPath) ? JSON.parse(fs.readFileSync(budgetPath, 'utf8')) : null;
const tolerancePct = budget?.tolerancePct ?? 10;

if (flag('--update')) {
  const next = {
    $comment: 'Gzip bytes of dist/ assets. Regenerate with `npm run perf:budget -- --update` only after an intended change; see docs/design/release-readiness/performance-budget.md.',
    tolerancePct,
    measuredAt: new Date().toISOString().slice(0, 10),
    metrics,
  };
  fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
  fs.writeFileSync(budgetPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`bundle budget: baseline written to ${path.relative(root, budgetPath)}`);
  process.exit(0);
}

if (!budget) {
  console.error(`bundle budget: no baseline at ${budgetPath} (run with --update)`);
  process.exit(2);
}

const result = compare(metrics, budget.metrics, tolerancePct);
if (flag('--json')) {
  console.log(JSON.stringify({ ...result, tolerancePct, initial, missing }, null, 2));
} else {
  console.log(`bundle budget (gzip, tolerance +${tolerancePct}%)`);
  for (const r of result.rows) {
    if (!flag('--all') && r.status === 'ok' && r.name.startsWith('named:')) continue;
    const d = r.deltaPct == null ? '' : `${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%`;
    console.log(`  ${r.status === 'over' ? 'OVER' : r.status.padEnd(4)}  ${r.name.padEnd(28)} ${kb(r.was).padStart(10)} → ${kb(r.now).padStart(10)}  ${d}`);
  }
  if (missing.length) console.log(`  note: HTML references missing files: ${missing.join(', ')}`);
}
process.exit(result.ok ? 0 : 1);
