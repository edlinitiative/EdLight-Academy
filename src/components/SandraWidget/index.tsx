import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import useStore from '../../contexts/store';
import './SandraWidget.css';

// The chat panel (message list, composer, network logic) is only needed once
// the student actually opens Sandra — keep it out of the initial shell bundle.
const SandraPanel = lazyWithRetry(() => import('./SandraPanel'));

/* ── Where Sandra is NOT allowed ───────────────────────────────────────────
   Redesign plan §6.9: "Do not introduce assistant access into protected
   competition simply to maintain global UI consistency." Help with
   UNDERSTANDING (a lesson, an explanation, a review of past mistakes) is the
   point of Sandra; help during a graded, timed or prize-bearing attempt is
   cheating. Those are different situations, so they get different rules —
   and the rule lives here, in the widget, rather than only in the Layout that
   mounts it, so a screen can never re-introduce assistant access by mounting
   the widget itself. */

/** A live exam paper: `/exams/:level/:examId/take`. The overview page (same
 *  URL without `/take`) and the results page are not attempts. */
const EXAM_PAPER = /^\/exams\/[^/]+\/[^/]+\/take\/?$/;

/** Arena (inter-school championship) play. The web surface is registration
 *  only today — play happens in the app — but the guard is written for the
 *  routes a play surface would use so it can never ship unprotected. */
const ARENA_PLAY = /^\/arena\/(match|matche|duel|play|jwe|tournoi)(\/|$)/;

/** Game / trivia routes. Ordinary games are not prize competition, so they are
 *  only restricted while a round is actually live (`focusMode`). */
const GAME_ROUND = /^\/(jeux|trivia)(\/|$)/;

export type SandraRestrictionKind = 'exam' | 'competition';

/** Why Sandra is unavailable, in French and Haitian Creole. Students are told
 *  the reason — §8 wants plain language, and a helper that silently does
 *  nothing is worse than one that explains itself. */
const RESTRICTION_COPY: Record<SandraRestrictionKind, { fr: string; ht: string }> = {
  exam: {
    fr: 'Sandra est indisponible pendant une épreuve chronométrée. Elle pourra tout réexpliquer dès que votre copie est remise.',
    ht: 'Sandra pa disponib pandan yon egzamen ak chronomèt. Li ka reesplike tout bagay lè ou fin remèt kopi ou.',
  },
  competition: {
    fr: 'Sandra est indisponible pendant une manche de compétition. Revenez lui poser la question après la partie.',
    ht: 'Sandra pa disponib pandan yon match konpetisyon. Tounen poze l kesyon an apre pati a.',
  },
};

/** The restriction that applies to a location, or `null` when Sandra is free
 *  to help. Exported so a screen can show the same honest reason next to its
 *  own affordance. */
export function sandraRestrictionFor(
  pathname: string,
  focusMode: boolean,
): SandraRestrictionKind | null {
  if (EXAM_PAPER.test(pathname)) return 'exam';
  if (ARENA_PLAY.test(pathname)) return 'competition';
  if (focusMode && GAME_ROUND.test(pathname)) return 'competition';
  return null;
}

export interface SandraAvailability {
  /** False on a protected screen — do not offer an "Ask Sandra" action. */
  available: boolean;
  /** Which protection applies, or null when Sandra is available. */
  restriction: SandraRestrictionKind | null;
  /** Ready-to-display reason in the active language ('' when available). */
  reason: string;
}

/**
 * Is Sandra allowed to help on the current screen, and if not, why?
 *
 * @example
 * const { available, reason } = useSandraAvailability();
 * if (!available) return <p className="hint">{reason}</p>;
 */
export function useSandraAvailability(): SandraAvailability {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const focusMode = useStore((s) => s.focusMode);

  const restriction = sandraRestrictionFor(pathname, focusMode);
  const isCreole = i18n.language === 'ht';

  return useMemo(
    () => ({
      available: restriction === null,
      restriction,
      reason: restriction ? RESTRICTION_COPY[restriction][isCreole ? 'ht' : 'fr'] : '',
    }),
    [restriction, isCreole],
  );
}

/** What the student is stuck on. Everything but `question` is optional
 *  grounding that gets folded into the message Sandra receives. */
export interface AskSandraContext {
  /** The question, already phrased for the student ("Explique-moi…"). */
  question: string;
  /** Lesson title, unit title, or the name of what is on screen. */
  topic?: string;
  /** Course name, e.g. "Mathématiques NS III". */
  course?: string;
  /** A statement / passage the student wants explained, quoted verbatim. */
  quote?: string;
}

/** Compose the single message string the panel sends. Grounding goes after the
 *  question so the first line still reads as the student's own words. */
function composeAsk(ctx: AskSandraContext, isCreole: boolean): string {
  const parts = [ctx.question.trim()];
  if (ctx.topic) parts.push(isCreole ? `Leson: ${ctx.topic}` : `Leçon : ${ctx.topic}`);
  if (ctx.course) parts.push(isCreole ? `Kou: ${ctx.course}` : `Cours : ${ctx.course}`);
  if (ctx.quote) parts.push(isCreole ? `Men sa ki ekri: « ${ctx.quote} »` : `Énoncé : « ${ctx.quote} »`);
  return parts.filter(Boolean).join('\n');
}

/**
 * Contextual "Ask Sandra" — the entry point a lesson, an explanation or a
 * review screen should use instead of sending the student to a general chat.
 *
 * `ask()` opens Sandra with the question already asked, so the student never
 * retypes what they are looking at. It returns `false` (and sends nothing)
 * when Sandra is restricted on this screen; render `reason` in that case
 * rather than hiding the control silently.
 *
 * @example
 * const { available, reason, ask } = useAskSandra();
 * <button
 *   disabled={!available}
 *   title={reason || undefined}
 *   onClick={() => ask({
 *     question: isCreole ? 'Ede m konprann leson sa a' : 'Aide-moi à comprendre cette leçon',
 *     topic: lesson.title,
 *     course: course.name,
 *   })}
 * />
 */
export function useAskSandra() {
  const availability = useSandraAvailability();
  const { i18n } = useTranslation();
  const setSandraAsk = useStore((s) => s.setSandraAsk);
  const isCreole = i18n.language === 'ht';

  const ask = useCallback(
    (ctx: AskSandraContext | string): boolean => {
      if (!availability.available) return false;
      const context = typeof ctx === 'string' ? { question: ctx } : ctx;
      const message = composeAsk(context, isCreole);
      if (!message) return false;
      setSandraAsk(message);
      return true;
    },
    [availability.available, isCreole, setSandraAsk],
  );

  return { ...availability, ask };
}

/**
 * Sandra — the student assistant, mounted once in `Layout`.
 *
 * Renders the launcher pill (bottom-right, lifted above the mobile bottom tab
 * bar) and lazily mounts the chat panel on first open. The panel stays mounted
 * after that so the conversation survives open/close toggles while navigating.
 *
 * Two placement rules, both §6.9:
 *
 *  • On a protected screen (`sandraRestrictionFor`) the widget renders nothing
 *    at all — no launcher, no panel, and a pending contextual question is not
 *    picked up.
 *  • While a focused task is on screen (`focusMode`: a lesson, a live practice
 *    question, a game round) the floating launcher is not rendered, because a
 *    fixed bubble at the bottom-right covers answer controls on a phone. The
 *    panel still opens on an explicit contextual "Ask Sandra" from that task,
 *    which is the behaviour §6.9 asks for in lessons.
 */
export function SandraWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const { available } = useSandraAvailability();
  const focusMode = useStore((s) => s.focusMode);

  // "Ask Sandra" handoff from a lesson, the search overlay or any caller of
  // `useAskSandra()`: a pending query opens the panel; SandraPanel consumes
  // (and clears) it once mounted.
  const sandraAsk = useStore((s) => s.sandraAsk);
  useEffect(() => {
    if (sandraAsk && available) {
      setOpen(true);
      setEverOpened(true);
    }
  }, [sandraAsk, available]);

  // Entering a protected screen closes an open conversation immediately.
  useEffect(() => {
    if (!available) setOpen(false);
  }, [available]);

  const toggle = () => {
    setOpen((v) => !v);
    setEverOpened(true);
  };

  if (!available) return null;

  return (
    <>
      {everOpened && (
        <Suspense fallback={null}>
          <SandraPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
      {!focusMode && (
        <button
          type="button"
          className={`sandra-launcher ${open ? 'is-open' : ''}`}
          aria-label={open ? t('common.close') : t('sandra.open')}
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? (
            <X size={22} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <MessageCircle size={22} strokeWidth={2.4} aria-hidden="true" />
          )}
          <span className="sandra-launcher__label">Sandra</span>
        </button>
      )}
    </>
  );
}

export default SandraWidget;
