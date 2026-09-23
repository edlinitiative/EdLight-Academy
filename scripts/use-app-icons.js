#!/usr/bin/env node
/**
 * Point every `from 'lucide-react'` import at src/components/icons (the
 * Phosphor-backed app icon set). Idempotent — re-run after merging a branch
 * that still imports lucide-react.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src');
const TARGET = path.join(ROOT, 'components', 'icons');
let changed = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(t|j)sx?$/.test(f) || p.startsWith(TARGET)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (!s.includes("'lucide-react'") && !s.includes('"lucide-react"')) continue;
    let rel = path.relative(path.dirname(p), TARGET).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    fs.writeFileSync(p, s.replace(/(['"])lucide-react\1/g, `'${rel}'`));
    changed++;
  }
})(ROOT);
console.log(`icons: ${changed} file(s) rewritten`);
