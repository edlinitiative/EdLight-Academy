/**
 * Content generators for the arcade games (ported from web src/utils/gameGen.ts).
 * Vrai/Faux and Mémoire derive their rounds from the existing trivia bank
 * (so new admin-added questions feed the games for free); Calcul éclair and
 * Suites logiques generate their own arithmetic — no authoring needed.
 */

export function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── Vrai ou Faux ───────────────────────────────────────────────────────────
 * Each item shows a trivia question with ONE proposed answer; the player says
 * whether that answer is the right one. 50/50 true/false split.
 */
export interface VraiFauxItem {
  q: string;
  qHt: string;
  proposed: string;
  truth: boolean;
  correctAnswer: string;
  flag: string | null;
  flagIso: string | null;
}

export function buildVraiFauxItems(
  questionsMap: Record<string, any[]>,
  count = 60,
): VraiFauxItem[] {
  const all = Object.values(questionsMap || {}).flat().filter(
    (q: any) => q && q.q && Array.isArray(q.options) && q.options.length >= 2,
  );
  return shuffleArr(all).slice(0, count).map((q: any) => {
    // Normalize the answer index: bad/missing data must never make
    // correctAnswer undefined (that would blank the card and break grading).
    const answerIdx =
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length
        ? q.answer
        : 0;
    const correctAnswer = q.options[answerIdx];
    // Distractors are options whose VALUE differs from the correct one — dedupe
    // by value so a "false" proposal can never actually be the right answer
    // (duplicate option texts, or an invalid index, previously slipped through).
    const distractors = q.options.filter((o: any) => o !== correctAnswer);
    // If every option equals the correct answer, we can only pose it as true.
    const truth = distractors.length === 0 ? true : Math.random() < 0.5;
    const proposed = truth ? correctAnswer : shuffleArr(distractors)[0];
    return {
      q: q.q,
      qHt: q.qHt || q.q,
      proposed,
      truth,
      correctAnswer,
      // Flag questions ("De quel pays est ce drapeau ?") are meaningless
      // without their flag — carry it through so the game can render it.
      flag: q.flag || null,
      flagIso: q.flagIso || null,
    };
  });
}

/* ─── Mémoire (concentration) ──────────────────────────────────────────────
 * pairSource items: { a, aHt, b } (e.g. country ↔ capital). Returns a
 * shuffled deck of 2×pairCount cards; a match = same pairId, different side.
 */
export interface MemoryCard {
  id: string;
  pairId: number;
  side: 'a' | 'b';
  label: string;
}

export function buildMemoryDeck(
  pairSource: Array<{ a: string; aHt?: string; b: string }>,
  pairCount = 6,
  isCreole = false,
): MemoryCard[] {
  const pairs = shuffleArr(pairSource).slice(0, pairCount);
  const cards: MemoryCard[] = pairs.flatMap((p, i) => [
    { id: `a${i}`, pairId: i, side: 'a' as const, label: isCreole ? p.aHt || p.a : p.a },
    { id: `b${i}`, pairId: i, side: 'b' as const, label: p.b },
  ]);
  return shuffleArr(cards);
}

/* ─── Calcul éclair ─────────────────────────────────────────────────────────
 * Difficulty ramps with the number of correct answers so far.
 */
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export interface CalcProblem {
  text: string;
  answer: number;
}

export function nextCalcProblem(solvedCount: number): CalcProblem {
  const tier = Math.min(4, Math.floor(solvedCount / 5)); // ramp every 5 solved
  let text: string, answer: number;
  if (tier === 0) {
    const a = rand(3, 30), b = rand(2, 20);
    text = `${a} + ${b}`; answer = a + b;
  } else if (tier === 1) {
    const a = rand(10, 60), b = rand(2, a - 1);
    text = `${a} − ${b}`; answer = a - b;
  } else if (tier === 2) {
    const a = rand(3, 12), b = rand(3, 12);
    text = `${a} × ${b}`; answer = a * b;
  } else if (tier === 3) {
    const b = rand(3, 12), q = rand(3, 12);
    text = `${b * q} ÷ ${b}`; answer = q;
  } else {
    const a = rand(2, 9), b = rand(2, 9), c = rand(2, 15);
    text = `${a} × ${b} + ${c}`; answer = a * b + c;
  }
  return { text, answer };
}

/* ─── Suites logiques ───────────────────────────────────────────────────────
 * 10 rounds; the pattern pool widens as the round index climbs.
 */
export interface SequenceRound {
  shown: number[];
  answer: number;
  options: number[];
}

function makeSequence(round: number): SequenceRound {
  const kind = round < 3
    ? ['arith', 'arith', 'skip'][rand(0, 2)]
    : ['arith', 'skip', 'geo', 'square', 'alt', 'fib'][rand(0, 5)];

  let terms: number[] = [];
  if (kind === 'arith') {
    const start = rand(1, 20), d = rand(2, 9);
    terms = [0, 1, 2, 3, 4].map((i) => start + i * d);
  } else if (kind === 'skip') {
    // counts by a "table" step — reinforces multiplication tables
    const step = rand(3, 12);
    const from = rand(1, 4);
    terms = [0, 1, 2, 3, 4].map((i) => (from + i) * step);
  } else if (kind === 'geo') {
    const start = rand(1, 5), r = rand(2, 3);
    terms = [0, 1, 2, 3, 4].map((i) => start * r ** i);
  } else if (kind === 'square') {
    const from = rand(1, 5);
    terms = [0, 1, 2, 3, 4].map((i) => (from + i) ** 2);
  } else if (kind === 'alt') {
    const start = rand(1, 15), a = rand(2, 8), b = rand(2, 8);
    terms = [start];
    for (let i = 0; i < 4; i++) terms.push(terms[terms.length - 1] + (i % 2 === 0 ? a : b));
  } else {
    // fibonacci-like: each term = sum of the two before
    let x = rand(1, 4), y = rand(2, 6);
    terms = [x, y];
    while (terms.length < 5) { const z = x + y; terms.push(z); x = y; y = z; }
  }

  const answer = terms[terms.length - 1];
  const shown = terms.slice(0, -1);
  // Plausible distractors: near-misses around the right answer.
  const wrongs = new Set<number>();
  const last = shown[shown.length - 1];
  const step = Math.max(1, answer - last);
  [answer + step, answer - step, answer + 1, answer - 1, answer + 2, last + 1].forEach((w) => {
    if (w !== answer && w > 0) wrongs.add(w);
  });
  const options = shuffleArr([answer, ...shuffleArr([...wrongs]).slice(0, 3)]);
  return { shown, answer, options };
}

export function buildSequenceRounds(count = 10): SequenceRound[] {
  return Array.from({ length: count }, (_, i) => makeSequence(i));
}
