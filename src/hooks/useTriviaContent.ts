/**
 * useTriviaContent — merged trivia content (static floor + Firestore overlay).
 *
 * SAFETY MODEL
 * ────────────
 * State initializes to the STATIC banks so the very first render is instant and
 * NEVER empty. On mount we asynchronously load Firestore and build a MERGED
 * result:
 *   - categories: Firestore's (already ordered) if any, else static.
 *   - questions: for EACH category in the final list —
 *       • generated category (capitals/currencies/flags), OR
 *       • Firestore has no questions for it
 *     → use STATIC questions (generated decks always come from code, and any
 *       not-yet-migrated deck falls back to static). Otherwise use Firestore.
 * If the whole load fails or returns nothing, we keep static (no state change),
 * so the game can never break because of Firestore.
 */

import { useState, useEffect } from 'react';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import {
  loadTriviaCategories,
  loadTriviaQuestions,
  GENERATED_CATEGORY_IDS,
} from '../services/triviaService';

export function useTriviaContent() {
  // Static data is the floor — first paint is always populated.
  const [categories, setCategories] = useState<any[]>(TRIVIA_CATEGORIES as any[]);
  const [questions, setQuestions] = useState<Record<string, any[]>>(
    TRIVIA_QUESTIONS as Record<string, any[]>,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [fsCategories, fsQuestions] = await Promise.all([
          loadTriviaCategories(),
          loadTriviaQuestions(),
        ]);

        if (!alive) return;

        // Nothing in Firestore at all → keep the static floor untouched.
        const hasFsCats = Array.isArray(fsCategories) && fsCategories.length > 0;
        const finalCategories = hasFsCats
          ? fsCategories
          : (TRIVIA_CATEGORIES as any[]);

        // Build the merged questions map keyed off the final category list.
        const mergedQuestions: Record<string, any[]> = {};
        for (const cat of finalCategories) {
          const catId = cat.id;
          const staticQs = (TRIVIA_QUESTIONS as Record<string, any[]>)[catId] || [];
          const fsQs = Array.isArray(fsQuestions[catId]) ? fsQuestions[catId] : [];
          const canUseFs = !GENERATED_CATEGORY_IDS.includes(catId) && fsQs.length > 0;

          if (!canUseFs) {
            mergedQuestions[catId] = staticQs;
            continue;
          }

          /*
            Two kinds of Firestore question, and they mean opposite things.

            A question an admin wrote in /admin/trivia is an EDIT: the bank in
            Firestore is the one they curated, and it replaces the shipped one.
            That is the behaviour this screen has always had and staff rely on
            it to correct a question without a deploy.

            A question the nightly generator wrote is an ADDITION. Treating it
            the same way would be a data loss with no warning: fifteen
            generated questions would REPLACE the ninety-one shipped ones, and
            the category would quietly shrink to a sixth of its size the first
            night the cron ran.

            So generated docs carry `source: 'generated'` and are appended to
            the static bank, de-duplicated on the question text so a generated
            question that happens to match a shipped one cannot appear twice in
            a round.
          */
          const generated = fsQs.filter((x) => x?.source === 'generated');
          const authored = fsQs.filter((x) => x?.source !== 'generated');

          // Preserve authored answers; only reuse shipped learning copy when
          // both the question and its correct answer still match.
          const shipped = new Map(staticQs.map((q) => [q.q, q]));
          const base = authored.length > 0 ? authored.map((q) => {
            const original = shipped.get(q.q);
            if (!original || original.options[original.answer] !== q.options[q.answer]) return q;
            return { ...q, explanation: q.explanation || original.explanation,
              explanationHt: q.explanationHt || original.explanationHt };
          }) : staticQs;
          const seen = new Set(
            base.map((x) => String(x?.q ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
          );
          const extra = generated.filter((x) => {
            const key = String(x?.q ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          mergedQuestions[catId] = extra.length > 0 ? [...base, ...extra] : base;
        }

        setCategories(finalCategories);
        setQuestions(mergedQuestions);
      } catch (err) {
        // Defensive: keep static data on any unexpected error.
        console.warn('[useTriviaContent] load failed, keeping static:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { categories, questions, loading };
}

export default useTriviaContent;
