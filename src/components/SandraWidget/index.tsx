import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from '../icons';
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

/** What `ask()` would send, for showing the student before they send it. */
export interface AskSandraPreview {
  /** The exact message text Sandra receives (also the student's own bubble). */
  message: string;
  /** One plain-language line per piece of information that leaves the screen. */
  shared: string[];
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
 * `preview()` returns the same message plus a plain-language list of
 * everything that leaves the screen, so a caller can show the student what is
 * shared instead of asking them to trust an opaque button. `<AskSandra>` below
 * already renders both; reach for the hook only when you need your own layout.
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
  const { pathname } = useLocation();
  const setSandraAsk = useStore((s) => s.setSandraAsk);
  const grade = useStore((s) => s.grade);
  const track = useStore((s) => s.track);
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

  /* The list is written from what SandraPanel actually puts on the wire:
     `message`, `page` (the path plus the course/lesson it encodes) and
     `studentContext` (grade, filière, XP level). If that payload changes,
     this list changes with it — an inaccurate disclosure is worse than none. */
  const preview = useCallback(
    (ctx: AskSandraContext | string): AskSandraPreview => {
      const context = typeof ctx === 'string' ? { question: ctx } : ctx;
      const message = composeAsk(context, isCreole);
      const shared: string[] = [];

      if (context.question.trim()) {
        shared.push(
          isCreole
            ? `Kesyon an: « ${context.question.trim()} »`
            : `Votre question : « ${context.question.trim()} »`,
        );
      }
      if (context.topic) {
        shared.push(isCreole ? `Tit leson an: ${context.topic}` : `Le titre de la leçon : ${context.topic}`);
      }
      if (context.course) {
        shared.push(isCreole ? `Non kou a: ${context.course}` : `Le nom du cours : ${context.course}`);
      }
      if (context.quote) {
        shared.push(
          isCreole
            ? `Pasaj ou site a: « ${context.quote} »`
            : `Le passage cité : « ${context.quote} »`,
        );
      }
      shared.push(
        isCreole
          ? `Adrès paj sa a (${pathname})`
          : `L’adresse de cette page (${pathname})`,
      );
      if (grade || track) {
        shared.push(
          isCreole
            ? 'Klas ou, filyè ou ak nivo XP ou'
            : 'Votre classe, votre filière et votre niveau XP',
        );
      }

      return { message, shared };
    },
    [isCreole, pathname, grade, track],
  );

  return { ...availability, ask, preview };
}

export interface AskSandraProps {
  /** The question and its grounding. */
  context: AskSandraContext;
  /** Button label. Defaults to a bilingual "Demander à Sandra". */
  label?: string;
  /** Extra class on the wrapper, for the host screen's own spacing. */
  className?: string;
  /** Set false to drop the "what Sandra receives" disclosure. Default true. */
  showSharedContext?: boolean;
}

/**
 * Drop-in contextual "Ask Sandra" control for a lesson, an explanation or a
 * review screen (§6.9: "prefer contextual Ask Sandra actions from lessons,
 * explanations and review").
 *
 * Renders one of two things, never nothing:
 *  • where Sandra may help — the button, plus a collapsed disclosure listing
 *    exactly what leaves the screen if the student taps it;
 *  • on a protected screen (a timed exam, a competition round) — the reason
 *    she is unavailable, in the student's language.
 *
 * @example
 * <AskSandra
 *   context={{
 *     question: isCreole ? 'Ede m konprann leson sa a' : 'Aide-moi à comprendre cette leçon',
 *     topic: lesson.title,
 *     course: course.title,
 *   }}
 * />
 */
export function AskSandra({
  context,
  label,
  className,
  showSharedContext = true,
}: AskSandraProps) {
  const { i18n } = useTranslation();
  const { available, reason, ask, preview } = useAskSandra();
  const isCreole = i18n.language === 'ht';

  if (!available) {
    return (
      <p className={`sandra-ask__blocked${className ? ` ${className}` : ''}`}>
        {reason}
      </p>
    );
  }

  const { shared } = preview(context);

  return (
    <div className={`sandra-ask${className ? ` ${className}` : ''}`}>
      <button type="button" className="sandra-ask__btn" onClick={() => ask(context)}>
        <MessageCircle size={16} strokeWidth={2.4} aria-hidden="true" />
        <span>{label ?? (isCreole ? 'Mande Sandra' : 'Demander à Sandra')}</span>
      </button>

      {showSharedContext && shared.length > 0 && (
        <details className="sandra-ask__shared">
          <summary>{isCreole ? 'Sa Sandra ap resevwa' : 'Ce que Sandra recevra'}</summary>
          <ul>
            {shared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Open/close state shared by the two panel hosts below: a pending contextual
 *  question opens the panel, and entering a protected screen closes it. */
function useSandraPanelState(available: boolean) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

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

  const openPanel = useCallback(() => {
    setOpen(true);
    setEverOpened(true);
  }, []);
  const toggle = useCallback(() => {
    setOpen((v) => !v);
    setEverOpened(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return { open, everOpened, openPanel, toggle, close };
}

/**
 * Panel host for a focused screen — mount once in a lesson (or any screen that
 * calls `useFocusMode`) so a contextual `<AskSandra>` can actually open Sandra.
 *
 * Why it exists: `Layout` mounts `<SandraWidget>` only while focus mode is OFF
 * (`{isAuthenticated && !isFocused && <SandraWidget />}`), so inside a lesson
 * there is no panel in the tree for an ask to open. This host fills that gap
 * and renders nothing whenever the global widget IS mounted (`!focusMode`), so
 * the two can never stack. It becomes unnecessary — and should be deleted
 * along with its `focusMode` guard — the day `Layout` mounts `<SandraWidget>`
 * unconditionally, which is the better fix: the widget already withholds the
 * floating launcher in focus mode by itself.
 *
 * It renders no visible control of its own: only an explicit contextual ask
 * brings it up, so nothing ever floats over the lesson's own controls.
 *
 * @example
 * // inside the lesson view
 * <SandraFocusPanel />
 */
export function SandraFocusPanel() {
  const { available } = useSandraAvailability();
  const focusMode = useStore((s) => s.focusMode);
  const { open, everOpened, close } = useSandraPanelState(available);

  if (!available || !focusMode || !everOpened) return null;

  return (
    <Suspense fallback={null}>
      <SandraPanel open={open} onClose={close} />
    </Suspense>
  );
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
 *    fixed bubble at the bottom-right covers answer controls on a phone. Only
 *    an explicit contextual "Ask Sandra" from the task itself brings the panel
 *    up, which is the behaviour §6.9 asks for in lessons. Note that `Layout`
 *    currently unmounts this component entirely in focus mode, so that ask is
 *    served by `<SandraFocusPanel>` until it does not.
 */
export function SandraWidget() {
  const { t } = useTranslation();
  const { available } = useSandraAvailability();
  const focusMode = useStore((s) => s.focusMode);
  const { open, everOpened, toggle, close } = useSandraPanelState(available);

  if (!available) return null;

  return (
    <>
      {everOpened && (
        <Suspense fallback={null}>
          <SandraPanel open={open} onClose={close} />
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
