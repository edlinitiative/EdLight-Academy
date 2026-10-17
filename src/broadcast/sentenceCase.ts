/**
 * Sentence case for the broadcast's strings (founder rule: sentence case
 * everywhere, no shouting caps).
 *
 * The scenes were authored with caps literals ("NOUVEAU LEADER") for a
 * letter-spaced caps look the stage no longer uses. Rather than rewrite fifty
 * literals in twenty files (and every test that reads them), the page hands
 * the stage a `t` that sentence-cases a string that is ALL caps, and leaves
 * any mixed-case string — names, sentences — exactly as written. The demo
 * (`/arena/demo`) applies the same rule.
 */
export function sentenceCase(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || letters !== letters.toUpperCase()) return s;
  const low = s.toLocaleLowerCase('fr');
  return low.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('fr'));
}

export function stageTranslator(isCreole: boolean) {
  return (fr: string, ht: string) => sentenceCase(isCreole ? ht : fr);
}
