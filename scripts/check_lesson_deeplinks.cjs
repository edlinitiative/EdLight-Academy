#!/usr/bin/env node
/**
 * Browser regression for `/courses/:id?lesson=<lessonId>` deep links
 * (learning-journey audit 2026-10-17, finding #1).
 *
 * For every visible course in public/catalog.json it opens the first lesson,
 * the last lesson and one lesson of a later unit — once as a fresh load and
 * once by in-app navigation with the course already cached (Home's
 * « Reprendre la leçon » path, which is where it broke) — and requires the
 * lesson's own title as the page <h1> with `?lesson=` kept in the URL. A stale
 * id must show the "plus disponible" notice and drop the param.
 *
 * Needs the dev server (npm run dev) and Playwright with Chrome:
 *   PLAYWRIGHT_PATH=/path/to/node_modules/playwright node scripts/check_lesson_deeplinks.cjs
 *   BASE_URL defaults to http://localhost:3000.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'catalog.json'), 'utf8'));
const cases = [];
for (const c of cat.courses) {
  if (c.hidden) continue;
  const all = (c.units || []).flatMap((u) => (u.lessons || []).map((l) => ({ ...l, unit: u.order })));
  if (!all.length) continue;
  const pick = [all[0], all[all.length - 1]];
  const mid = all.find((l) => l.unit >= 2 && l.order >= 2);
  if (mid) pick.push(mid);
  for (const l of pick) cases.push({ course: c.id, id: l.lessonId, title: l.title });
}
const BASE = process.env.BASE_URL || 'http://localhost:3000';
async function h1(p) { return p.evaluate(() => document.querySelector('h1')?.textContent?.trim() || ''); }
async function waitTitle(p, title) {
  for (let i = 0; i < 40; i++) { if ((await h1(p)) === title.trim()) return true; await p.waitForTimeout(250); }
  return false;
}
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  let fail = 0;
  // Cold: fresh load per link.
  for (const k of cases) {
    await p.goto(`${BASE}/courses/${k.course}?lesson=${encodeURIComponent(k.id)}`);
    const ok = await waitTitle(p, k.title);
    const url = p.url();
    const kept = url.includes(`lesson=${encodeURIComponent(k.id)}`);
    if (!ok || !kept) { fail++; console.log('FAIL cold', k.course, k.id, JSON.stringify(k.title), '->', JSON.stringify(await h1(p)), url); }
  }
  // Warm: in-app navigation with data already cached (the Home "Reprendre" path).
  await p.goto(`${BASE}/courses`);
  await p.waitForTimeout(4000);
  for (const k of cases) {
    await p.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, '/dashboard');
    await p.waitForTimeout(300);
    await p.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, `/courses/${k.course}?lesson=${encodeURIComponent(k.id)}`);
    const ok = await waitTitle(p, k.title);
    const kept = p.url().includes(`lesson=${encodeURIComponent(k.id)}`);
    if (!ok || !kept) { fail++; console.log('FAIL warm', k.course, k.id, JSON.stringify(k.title), '->', JSON.stringify(await h1(p)), p.url()); }
  }
  // Stale id: honest notice, overview, param dropped.
  await p.goto(`${BASE}/courses/chem-ns1?lesson=CHEM-NSI-U9-L99`);
  await p.waitForTimeout(3000);
  const stale = await p.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 3000) }));
  const staleOk = !stale.url.includes('lesson=') && /n.?existe plus|introuvable|plus disponible|n.?est plus/i.test(stale.text);
  if (!staleOk) { fail++; console.log('FAIL stale', stale.url); }
  console.log(`${cases.length} links x2 (cold+warm) + stale: ${fail ? fail + ' FAILED' : 'all passed'}`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
