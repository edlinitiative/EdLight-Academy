const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * Course documents are named "Chimie NS1"; the catalogue and the level chips
 * say "NS I". One name for one course: show the roman form everywhere the
 * student reads it. Ported from web src/utils/courseName.ts — keep in sync.
 *
 *   displayCourseName('Chimie NS1')  → 'Chimie NS I'
 *   displayLevel('NS4') / ('ns4')    → 'NS IV'
 */
export function displayCourseName(name?: string | null): string {
  return String(name || '').replace(/\bNS\s?([1-4])\b/gi, (_, d) => `NS ${ROMAN[Number(d) - 1]}`);
}

/** A bare level code ("NS1", "ns 2", "NSIII") → its badge label ("NS I"). */
export function displayLevel(level?: string | null): string {
  const raw = String(level || '').trim();
  const m = raw.match(/^ns\s?([1-4]|i{1,3}|iv)$/i);
  if (!m) return raw;
  const v = m[1].toUpperCase();
  const roman = /^\d$/.test(v) ? ROMAN[Number(v) - 1] : v;
  return `NS ${roman}`;
}
