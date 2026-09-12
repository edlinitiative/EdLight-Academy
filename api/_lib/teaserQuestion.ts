/**
 * The question that goes IN the notification.
 * ---------------------------------------------------------------------------
 * The morning nudge used to say "2 minutes de quiz pour bien commencer la
 * journée", which is a reminder to do homework. This asks a question instead —
 *
 *      Quelle est la capitale du Canada ?
 *
 * — and does not answer it. The pull is curiosity rather than obligation: a
 * person who reads that has already started playing, and opening the app is
 * how the sentence finishes.
 *
 * ── The one rule this module exists to enforce ─────────────────────────────
 * THE ANSWER NEVER LEAVES THIS FILE. `pickTeaser` returns the question text
 * and nothing else — no options, no answer index. A teaser that shows the
 * answer is just a fact, and nobody opens an app to be told something they
 * have already been told.
 *
 * ── Why the same question for everyone, and why it is stable all day ───────
 * Chosen by hashing the Haiti date, so every learner gets the same question on
 * the same day. That makes it shareable — "you got the Canada one too?" — and,
 * more practically, it makes the job idempotent: daily-nudge runs at BOTH
 * 10:00Z and 11:00Z because Haiti observes DST, and a random pick would let
 * the same person be asked two different questions in two hours if the
 * once-a-day stamp ever missed.
 *
 * ── Why only some questions qualify ────────────────────────────────────────
 * A push notification is roughly one line on a lock screen and a subject line
 * is not much more, so anything long is cut off mid-sentence and the hook is
 * lost. Questions also have to make sense with no options underneath them:
 * "Lequel de ces pays…" needs the list, and "Que trouve-t-on au pied du
 * palmiste ?" needs the reader to already be thinking about the coat of arms.
 * isTeasable keeps the ones that stand alone.
 */
import { TRIVIA_QUESTIONS, TRIVIA_CATEGORIES } from '../../src/data/triviaData';

export interface Teaser {
  /** The question, French. Never accompanied by its answer. */
  question: string;
  /** The question, Kreyòl. */
  questionHt: string;
  categoryId: string;
  categoryName: string;
  categoryNameHt: string;
  icon: string;
}

/** Past this, a lock screen truncates and the question stops being a hook. */
export const MAX_TEASER_CHARS = 78;

/**
 * Categories worth teasing, in the order they rotate.
 *
 * Maths and chemistry are left out on purpose: "Combien font 3/4 de 40 ?" on a
 * lock screen reads like a test, which is the feeling this is trying to avoid,
 * and a symbol question ("Quel élément a pour symbole « Hg » ?") is only a
 * hook to somebody who already knows the answer.
 *
 * `flags` is left out for a harder reason. It was in this list at first, and
 * the even-rotation test caught that it can never produce anything: every one
 * of its 196 questions is "De quel pays est ce drapeau ?", which isTeasable
 * rejects because there is no flag on a lock screen to look at. A category
 * that yields nothing does not merely waste its turn — the fallback walk hands
 * its day to the NEXT category, which then appears twice as often as the rest.
 */
export const TEASER_CATEGORIES = [
  'capitals',
  'histoire_haiti',
  'proverbes_haiti',
  'culture_haiti',
  'geo_haiti',
  'personnalites_haiti',
  'symboles_haiti',
  'sciences',
  'sport_haiti',
  'currencies',
] as const;

/** Openings that only work with the options visible underneath. */
const NEEDS_OPTIONS = /^(lequel|laquelle|lesquels|lesquelles|parmi|que trouve-t-on|combien font)\b/i;

/** Phrases that only make sense as a follow-up to another question. */
const NEEDS_CONTEXT = /\b(cette|ce dernier|celui-ci|ci-dessus|précédent)\b/i;

/**
 * Does this question stand on its own on a lock screen?
 *
 * Exported so the rule is testable directly: it is the difference between a
 * notification that intrigues and one that confuses, and it is easy to break
 * silently by adding a category later.
 */
export function isTeasable(q: { q?: string; qHt?: string }): boolean {
  const fr = (q.q || '').trim();
  const ht = (q.qHt || '').trim();
  if (!fr || !ht) return false;
  if (fr.length > MAX_TEASER_CHARS || ht.length > MAX_TEASER_CHARS) return false;
  if (NEEDS_OPTIONS.test(fr) || NEEDS_CONTEXT.test(fr)) return false;
  // A flag question shows an image in the app; on a lock screen "De quel pays
  // est ce drapeau ?" has no drapeau to look at.
  if (/ce drapeau/i.test(fr)) return false;
  return true;
}

/**
 * Days since the epoch, from a YYYY-MM-DD key.
 *
 * Used to rotate the CATEGORY, deliberately in preference to the hash. Hashing
 * the date picks a category uniformly at random, and uniformly at random means
 * clumps: the first draft put Haitian symbols in four of fourteen days and
 * skipped sport entirely. A day counter cycles the list exactly, so every
 * category comes round once every eleven days and none is ever missed.
 *
 * Returns NaN for anything unparseable, which pickTeaser treats as "fall back
 * to the hash" rather than failing.
 */
export function dayNumber(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/**
 * A small, stable hash. Not cryptographic and does not need to be — it only
 * has to spread consecutive dates ("2026-09-12", "2026-09-13") to unrelated
 * indices, which a plain character sum does not.
 *
 * Used to choose the question WITHIN the day's category.
 */
export function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

type Bank = Record<string, Array<{ q?: string; qHt?: string }>>;
type Category = { id: string; name: string; nameHt: string; icon: string };

/**
 * The teaser for a given Haiti date.
 *
 * Returns null rather than throwing if no category yields a usable question —
 * the caller falls back to the ordinary nudge copy, because a missing teaser
 * must never cost somebody their morning reminder.
 */
export function pickTeaser(
  dateKey: string,
  banks: Bank = TRIVIA_QUESTIONS as unknown as Bank,
  categories: Category[] = TRIVIA_CATEGORIES as unknown as Category[],
): Teaser | null {
  const h = hashKey(dateKey);
  const day = dayNumber(dateKey);
  const start = Number.isNaN(day) ? h : day;

  // Rotate the category by day, then walk the list from there so a category
  // that happens to have no teasable question does not cost us the day.
  for (let step = 0; step < TEASER_CATEGORIES.length; step += 1) {
    const categoryId = TEASER_CATEGORIES[(start + step) % TEASER_CATEGORIES.length];
    const pool = (banks[categoryId] || []).filter(isTeasable);
    if (pool.length === 0) continue;

    const chosen = pool[h % pool.length];
    const meta = categories.find((c) => c.id === categoryId);
    return {
      question: (chosen.q || '').trim(),
      questionHt: (chosen.qHt || '').trim(),
      categoryId,
      categoryName: meta?.name || categoryId,
      categoryNameHt: meta?.nameHt || meta?.name || categoryId,
      icon: meta?.icon || '❓',
    };
  }
  return null;
}

/**
 * Notification copy built around the question.
 *
 * The question is the TITLE, not the body: on both iOS and Android the title
 * is the bold line that survives truncation, and it is the only part some
 * lock screens show at all. The body is the invitation to answer.
 */
export function teaserCopy(teaser: Teaser, lang: 'fr' | 'ht', firstName?: string): { title: string; message: string } {
  const name = String(firstName || '').trim();
  if (lang === 'ht') {
    return {
      title: `${teaser.icon} ${teaser.questionHt}`,
      message: name
        ? `${name}, ou konn repons lan ? Louvri epi reponn — li pran 10 segond.`
        : 'Ou konn repons lan ? Louvri epi reponn — li pran 10 segond.',
    };
  }
  return {
    title: `${teaser.icon} ${teaser.question}`,
    message: name
      ? `${name}, tu connais la réponse ? Ouvre et réponds — 10 secondes.`
      : 'Tu connais la réponse ? Ouvre et réponds — 10 secondes.',
  };
}
