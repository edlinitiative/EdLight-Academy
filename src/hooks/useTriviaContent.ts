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
          const fsQs = fsQuestions[catId];
          const useFs =
            !GENERATED_CATEGORY_IDS.includes(catId) &&
            Array.isArray(fsQs) &&
            fsQs.length > 0;
          mergedQuestions[catId] = useFs ? fsQs : staticQs;
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
