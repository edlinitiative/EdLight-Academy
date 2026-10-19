/**
 * shared/explanationFeedback.ts — the "Utile / Pas utile" control under a
 * reviewed Explique-moi explanation, for web and mobile.
 *
 * /api/chat answers the first Explique-moi turn from an admin-approved
 * explanation when one exists, and then says so: `explanation: { id,
 * reviewed: true }`. Only those replies get the control; a fresh LLM reply
 * has nothing reviewed to rate. The vote goes to POST /api/explanations
 * { action: 'vote', id, helpful }, deduped server-side once per day without
 * storing who voted (api/_lib/explanationCache.ts).
 */

const ID_RE = /^(exam|bank)_[A-Za-z0-9_-]{1,300}_(fr|ht)$/;

/** The reviewed explanation id on a /api/chat response, or undefined. */
export function reviewedExplanationId(data: unknown): string | undefined {
  const e = (data as { explanation?: { id?: unknown; reviewed?: unknown } } | null)?.explanation;
  return e && e.reviewed === true && typeof e.id === 'string' && ID_RE.test(e.id) ? e.id : undefined;
}

export function explanationVoteBody(id: string, helpful: boolean) {
  return { action: 'vote' as const, id, helpful };
}

export const EXPLANATION_FEEDBACK = {
  reviewed: { fr: 'Explication relue par l’équipe EdLight', ht: 'Ekip EdLight te reli eksplikasyon sa a' },
  question: { fr: 'Cette explication t’a aidé ?', ht: 'Eksplikasyon sa a ede w ?' },
  helpful: { fr: 'Utile', ht: 'Itil' },
  notHelpful: { fr: 'Pas utile', ht: 'Pa itil' },
  thanks: { fr: 'Merci pour ton avis.', ht: 'Mèsi pou avi ou.' },
};
