/**
 * Drafting new trivia questions, and refusing the ones that are not safe to
 * publish.
 *
 * ── The constraint this is built around ─────────────────────────────────────
 * Nothing human reviews this output. The batch it produces goes straight into
 * `trivia_questions` and straight to students, so every check that would
 * normally be a person reading the list has to be code here. When a check
 * cannot be made — a fact this file has no way to verify — the answer is to
 * generate a KIND of question where correctness is structural rather than
 * encyclopaedic.
 *
 * That is why the prompt asks for arithmetic, vocabulary and definitional
 * questions rather than dates and records. "Combien font 14 × 6" is checkable;
 * "in what year did X happen" is not, and a confidently wrong date in a
 * learning product is worse than no question at all.
 *
 * ── The cost ceiling ────────────────────────────────────────────────────────
 * One request a night, one model, a hard cap on how many questions it may
 * return. At gemini-3.6-flash pricing that is a fraction of a cent per run and
 * a few cents a month — inside the $10 budget with several orders of magnitude
 * to spare, and it cannot run away because the number of calls is fixed by the
 * cron rather than by traffic.
 */

import { chatJSON } from './llm';

/** Categories a generated question may join. */
export const GENERATABLE = ['maths_eclair', 'anglais_vocab', 'chimie_symboles', 'bio_corps'] as const;
export type GeneratableCategory = (typeof GENERATABLE)[number];

/**
 * Why only these four.
 *
 * They are the categories whose questions are *checkable without knowing
 * anything*: an arithmetic result is right or wrong by computation, a
 * French→English word pair is right or wrong by dictionary, a chemical symbol
 * and a body part are definitional. The Haitian history, geography, culture,
 * people, proverb and sport banks are exactly the ones where a plausible
 * fabrication would read as fact — they stay hand-written.
 */
const BRIEF: Record<GeneratableCategory, string> = {
  maths_eclair:
    'Mental arithmetic for Haitian secondary students: multiplication, division, '
    + 'squares and roots, percentages, fractions, simple geometry (area, perimeter, angles), '
    + 'unit conversion, one-step equations. Solvable in ten seconds without paper.',
  anglais_vocab:
    'Everyday French→English vocabulary for a beginner. The question names a French word, '
    + 'the options are four English words, exactly one correct. Concrete nouns, common verbs, '
    + 'colours, numbers, family, school, food, weather.',
  chimie_symboles:
    'Chemical element symbols and very basic chemistry taught in Haitian secondary school: '
    + 'symbol↔name, common formulas (H2O, CO2, NaCl), states of matter, acid/base basics.',
  bio_corps:
    'The human body at secondary level: organs and their function, the main systems, '
    + 'senses, bones, blood, digestion, respiration. No medical advice and no diagnosis.',
};

export interface DraftQuestion {
  q: string;
  qHt: string;
  options: string[];
  answer: number;
}

/**
 * Everything that must be true of a question before it may be published.
 *
 * Deliberately the same rules as `scripts/validate_trivia.mjs`, which guards
 * the hand-written banks: one standard, whoever or whatever wrote the
 * question. `existing` is every question already in the category, in both
 * languages, so a draft cannot restate one students already see.
 */
export function rejectionReason(
  draft: unknown,
  existing: ReadonlySet<string>
): string | null {
  const d = draft as Partial<DraftQuestion> | null;
  if (!d || typeof d !== 'object') return 'not an object';
  if (typeof d.q !== 'string' || !d.q.trim()) return 'no question text';
  if (typeof d.qHt !== 'string' || !d.qHt.trim()) return 'no Kreyòl translation';
  if (!Array.isArray(d.options) || d.options.length !== 4) return 'not exactly four options';
  if (d.options.some((o) => typeof o !== 'string' || !o.trim())) return 'an empty option';
  if (new Set(d.options).size !== 4) return 'two identical options';
  if (typeof d.answer !== 'number' || !Number.isInteger(d.answer) || d.answer < 0 || d.answer > 3) {
    return 'answer index is not 0-3';
  }
  if (normalise(d.q) === normalise(d.qHt)) return 'the two languages are identical';
  if (existing.has(normalise(d.q))) return 'already in this category';
  // A question longer than this does not fit the game's card on a phone.
  if (d.q.length > 160) return 'question too long for the card';
  if (d.options.some((o) => o.length > 60)) return 'an option too long for the card';
  return null;
}

export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Ask for a batch, keep only what passes.
 *
 * Returns the survivors rather than throwing on a bad one: a model that
 * returns nine good questions and one malformed should contribute nine, and
 * the caller decides whether the survivors are worth writing.
 */
export async function draftQuestions(
  category: GeneratableCategory,
  count: number,
  existing: ReadonlySet<string>
): Promise<{ accepted: DraftQuestion[]; rejected: string[] }> {
  const system =
    'You write multiple-choice questions for EdLight Academy, a Haitian learning app. '
    + 'Every question is in French (`q`) AND Haitian Creole (`qHt`) — a real translation, '
    + 'never the same string twice. Exactly four options, exactly one correct, and `answer` '
    + 'is its index. The three wrong options must be plausible and clearly wrong, never '
    + 'a trick. Reply with JSON only: {"questions":[{"q","qHt","options","answer"}]}.';

  const user =
    `Write ${count} questions for the category "${category}".\n\n${BRIEF[category]}\n\n`
    + 'Every one must be verifiable by computation or by dictionary — nothing that depends '
    + 'on a date, a record, a ranking or a current event. Do not repeat any of these '
    + `existing questions:\n${[...existing].slice(0, 60).join('\n')}`;

  const raw = await chatJSON({ system, user, temperature: 0.8, maxTokens: 2400 });
  const list = (raw as { questions?: unknown[] } | null)?.questions;
  if (!Array.isArray(list)) return { accepted: [], rejected: ['model did not return a questions array'] };

  const accepted: DraftQuestion[] = [];
  const rejected: string[] = [];
  const seen = new Set(existing);

  for (const item of list) {
    const why = rejectionReason(item, seen);
    if (why) { rejected.push(why); continue; }
    const d = item as DraftQuestion;
    seen.add(normalise(d.q));
    accepted.push({ q: d.q.trim(), qHt: d.qHt.trim(), options: d.options.map((o) => o.trim()), answer: d.answer });
  }
  return { accepted, rejected };
}
