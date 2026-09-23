/**
 * tournois/questions — drawing a tournament's questions, and the one function
 * allowed to turn a stored question into something a client may see.
 *
 * SOURCE: the shipped trivia banks (src/data/triviaData.ts TRIVIA_QUESTIONS,
 * 15 categories, ~2 800 questions, French + Kreyòl, most with explanations).
 * Four of those categories are curriculum decks (maths_eclair, chimie_symboles,
 * bio_corps, anglais_vocab); the rest are Haiti, the world and general science.
 * The creator picks categories, never questions, and never sees a key: the
 * draw runs on the server and the stored questions are server-only.
 *
 * Pure: randomness is injected so a draw is reproducible in tests.
 */

export interface BankQuestion {
  q: string;
  qHt?: string;
  options: string[];
  optionsHt?: string[];
  answer: number;
  explanation?: string;
  explanationHt?: string;
  flag?: string;
  flagIso?: string | null;
}

export interface StoredQuestion {
  q: string;
  qHt: string;
  options: string[];
  optionsHt: string[] | null;
  answer: number;
  explanation: string;
  explanationHt: string;
  flagIso: string | null;
  category: string;
}

/** What a player sees before the reveal: no key, no explanation. */
export interface PublicQuestion {
  q: string;
  qHt: string;
  options: string[];
  optionsHt: string[] | null;
  flagIso: string | null;
  category: string;
}

export function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle a question's options and move the key with them (and the Kreyòl options). */
export function shuffleOptions(q: BankQuestion, category: string, rand: () => number): StoredQuestion {
  const order = shuffle(q.options.map((_, i) => i), rand);
  const ht = Array.isArray(q.optionsHt) && q.optionsHt.length === q.options.length ? q.optionsHt : null;
  return {
    q: q.q,
    qHt: q.qHt || q.q,
    options: order.map((i) => q.options[i]),
    optionsHt: ht ? order.map((i) => ht[i]) : null,
    answer: order.indexOf(q.answer),
    explanation: q.explanation || '',
    explanationHt: q.explanationHt || q.explanation || '',
    flagIso: q.flagIso || null,
    category,
  };
}

const valid = (q: BankQuestion | undefined): q is BankQuestion =>
  !!q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length >= 2
  && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;

/**
 * Draw `n` questions spread evenly across `categories` (round-robin over each
 * category's shuffled bank), no question twice. Returns fewer than `n` only
 * when the chosen categories do not hold that many.
 */
export function drawQuestions(
  bank: Record<string, BankQuestion[] | undefined>,
  categories: string[],
  n: number,
  rand: () => number,
): StoredQuestion[] {
  const decks = categories
    .map((c) => ({ c, qs: shuffle((bank[c] || []).filter(valid), rand) }))
    .filter((d) => d.qs.length > 0);
  const out: StoredQuestion[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (out.length < n && progressed) {
    progressed = false;
    for (const d of shuffle(decks, rand)) {
      if (out.length >= n) break;
      while (d.qs.length) {
        const q = d.qs.shift()!;
        const key = q.q.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(shuffleOptions(q, d.c, rand));
        progressed = true;
        break;
      }
    }
  }
  return out;
}

export function toPublicQuestion(q: StoredQuestion): PublicQuestion {
  return {
    q: q.q,
    qHt: q.qHt,
    options: q.options,
    optionsHt: q.optionsHt,
    flagIso: q.flagIso,
    category: q.category,
  };
}

/**
 * A round's pool is larger than one attempt, and each player gets their own
 * random subset in their own order — so a friend who played first cannot hand
 * over "the answers are B, D, A…". Three times the count, capped by the bank.
 */
export const POOL_FACTOR = 3;

export function attemptOrder(poolSize: number, count: number, rand: () => number): number[] {
  return shuffle(Array.from({ length: poolSize }, (_, i) => i), rand).slice(0, Math.min(count, poolSize));
}

/** Deterministic PRNG (mulberry32) for tests and reproducible draws. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
