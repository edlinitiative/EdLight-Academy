import { shuffleAligned } from '../shuffleAligned';

/** Deterministic rng from a fixed sequence (cycled). */
const seqRng = (seq: number[]) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe('shuffleAligned', () => {
  it('applies the SAME permutation to both arrays', () => {
    const fr = ['Un', 'Deux', 'Trois', 'Quatre'];
    const ht = ['En', 'De', 'Twa', 'Kat'];
    const { primary, aligned } = shuffleAligned(fr, ht, seqRng([0.9, 0.1, 0.5]));
    expect(aligned).not.toBeNull();
    // Pairing must survive the shuffle: fr[i] and ht[i] were partners before,
    // so wherever a French word landed, its Kreyòl partner sits at that index.
    for (let i = 0; i < primary.length; i++) {
      expect(ht[fr.indexOf(primary[i])]).toBe(aligned![i]);
    }
    // And it actually shuffled with this rng sequence.
    expect(primary).not.toEqual(fr);
  });

  it('returns null aligned when absent or misaligned', () => {
    expect(shuffleAligned(['a', 'b'], null).aligned).toBeNull();
    expect(shuffleAligned(['a', 'b'], undefined).aligned).toBeNull();
    expect(shuffleAligned(['a', 'b'], ['x']).aligned).toBeNull(); // length mismatch
  });

  it('does not mutate its inputs and preserves the element sets', () => {
    const fr = ['A', 'B', 'C'];
    const ht = ['a', 'b', 'c'];
    const out = shuffleAligned(fr, ht, seqRng([0.99, 0.01]));
    expect(fr).toEqual(['A', 'B', 'C']);
    expect(ht).toEqual(['a', 'b', 'c']);
    expect([...out.primary].sort()).toEqual(['A', 'B', 'C']);
    expect([...(out.aligned as string[])].sort()).toEqual(['a', 'b', 'c']);
  });
});
