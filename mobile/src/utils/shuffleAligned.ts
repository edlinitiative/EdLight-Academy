/**
 * Fisher–Yates shuffle that applies ONE permutation to two parallel arrays,
 * so translated answer options (optionsHt) stay index-aligned with their
 * French originals after the per-play reshuffle. `rng` is injectable for
 * deterministic tests.
 */
export function shuffleAligned<T>(
  primary: T[],
  aligned?: T[] | null,
  rng: () => number = Math.random,
): { primary: T[]; aligned: T[] | null } {
  const hasAligned = Array.isArray(aligned) && aligned.length === primary.length;
  const a = [...primary];
  const b = hasAligned ? [...(aligned as T[])] : null;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
    if (b) [b[i], b[j]] = [b[j], b[i]];
  }
  return { primary: a, aligned: b };
}
