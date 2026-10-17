import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Clock, AlertCircle, ArrowRight } from './icons';
import { useKatex, renderWithKatex } from '../utils/shared';
import { loadDueReviewIds } from '../services/reviewService';
import { trackJourney } from '../utils/learningJourney';
import AnswerStatus, { type AnswerStatusKind } from './journey/practice/AnswerStatus';
import { useReviewConfirmation, type ReadReviewMap } from './journey/practice/useReviewConfirmation';
import './journey/practice/practice.css';

/** One session question as the quiz page recorded it. */
export interface QuizLogEntry {
  /** Tries used (1 = found on the first try, 0 = never checked). */
  tries: number;
  /** Found within the allowed tries. */
  solved: boolean;
  /** Every answer given, in order. */
  answers: string[];
  /** The question has no key the page can grade against. */
  ungraded?: boolean;
}

/**
 * What a log entry means, in the one status vocabulary (LJ-08/LJ-09).
 * "Unanswered" and "ungraded" are never folded into "incorrect".
 */
export function entryStatus(e?: QuizLogEntry | null): AnswerStatusKind {
  if (!e) return 'unanswered';
  if (e.ungraded) return 'ungraded';
  if (!e.tries) return 'unanswered';
  if (e.solved) return e.tries === 1 ? 'correct' : 'retry';
  return 'incorrect';
}

/** Ids DirectBankQuiz sent to Révision: a wrong FIRST attempt, real bank id. */
export function reviewIdsOf(deck: any[], log: QuizLogEntry[]): string[] {
  const ids: string[] = [];
  deck.forEach((item, i) => {
    const s = entryStatus(log[i]);
    const id = item?.id ? String(item.id) : '';
    if ((s === 'retry' || s === 'incorrect') && id && !/^q\d+$/.test(id) && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

type Tx = (fr: string, ht: string) => string;

/**
 * The end of a session (design spec S07, LJ-09).
 *
 * Quiz: one score with its definition — first-try answers, because a question
 * found after a hint is still one the student did not know. Practice: no
 * score (the mode has none), only what happened. Both list every question in
 * order with the student's answer, the expected one and the authored
 * explanation, and both keep unanswered / not-auto-corrected questions apart
 * from wrong ones.
 *
 * "These errors are in your Révision" is said only once the server copy of
 * the review map shows them (useReviewConfirmation); before that the line
 * says it is pending, and after a failed read-back it says so.
 */
export default function QuizResult({
  deck,
  log,
  title,
  context,
  tx,
  signedIn,
  uid,
  onSignIn,
  onReplay,
  onChangeUnit,
  examHref,
  mode = 'quiz',
  sessionStart = 0,
  reviewHref = '/revision',
  scopeIds,
  nextLesson,
  backHref = '/practice',
  backLabel,
  confirmRead,
  confirmDelays,
  interrupted = false,
}: {
  deck: any[];
  log: QuizLogEntry[];
  title: string;
  context: string;
  tx: Tx;
  signedIn: boolean;
  uid?: string | null;
  onSignIn: () => void;
  onReplay: () => void;
  onChangeUnit: () => void;
  examHref: string | null;
  mode?: 'quiz' | 'practice';
  /** Epoch ms the session began — a review entry older than this is not ours. */
  sessionStart?: number;
  reviewHref?: string;
  /** Bank ids of the session's scope, to say what is still due there. */
  scopeIds?: string[];
  nextLesson?: { title: string; href: string } | null;
  backHref?: string;
  backLabel?: string;
  confirmRead?: ReadReviewMap;
  confirmDelays?: number[];
  /** The student stopped the quiz early: lead with what was answered. */
  interrupted?: boolean;
}) {
  const katexReady = useKatex();
  const reviewRef = useRef<HTMLElement>(null);
  // The last question may have left the page scrolled; the summary is the top.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const statuses = useMemo(() => deck.map((_, i) => entryStatus(log[i])), [deck, log]);
  const n = (k: AnswerStatusKind) => statuses.filter((s) => s === k).length;
  const total = deck.length;
  const firstTry = n('correct');
  const afterRetry = n('retry');
  const missed = n('incorrect');
  const unanswered = n('unanswered');
  const ungraded = n('ungraded');
  const corrections = total - firstTry;
  const answered = total - unanswered;
  const earlyStop = mode === 'quiz' && interrupted;

  const reviewIds = useMemo(() => reviewIdsOf(deck, log), [deck, log]);
  const effectiveUid = signedIn ? (uid || null) : null;
  const confirm = useReviewConfirmation(effectiveUid, reviewIds, sessionStart, {
    ...(confirmRead ? { read: confirmRead } : {}),
    ...(confirmDelays ? { delays: confirmDelays } : {}),
  });

  // What is due in this scope now — the session's misses plus older ones.
  // Read from the review cache, which already holds this session's outcomes.
  const [scopeDue, setScopeDue] = useState<number | null>(null);
  const scopeKey = (scopeIds || []).join('|');
  useEffect(() => {
    let alive = true;
    if (!effectiveUid || !scopeIds) { setScopeDue(null); return undefined; }
    const inScope = new Set(scopeIds.map(String));
    loadDueReviewIds(effectiveUid)
      .then((ids) => { if (alive) setScopeDue(ids.filter((id) => inScope.has(String(id))).length); })
      .catch(() => { if (alive) setScopeDue(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUid, scopeKey]);

  const dueNow = scopeDue ?? reviewIds.length;

  // An interrupted quiz already leads with "answered X of N" — the verdict
  // line would only say the same thing again.
  const verdict = mode === 'practice' || earlyStop
    ? ''
    : unanswered > 0
      ? tx(`Quiz arrêté avant la fin : ${unanswered} question${unanswered > 1 ? 's' : ''} sans réponse.`, `Kwiz la kanpe anvan fen : ${unanswered} kesyon san repons.`)
      : firstTry === total
        ? tx('Tout juste du premier coup.', 'Tout bon premye fwa.')
        : firstTry >= Math.ceil(total * 0.7)
          ? tx('Solide. Revois les quelques questions ratées.', 'Solid. Revize kèk kesyon ou rate yo.')
          : tx('Ce chapitre mérite une révision.', 'Chapit sa a merite yon revizyon.');

  const goCorrections = () => {
    const el = reviewRef.current;
    trackJourney('correction_opened', { source: 'result', mode, count: corrections });
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  const answerOf = (item: any) => {
    if (item?.kind === 'mcq' || item?.kind === 'tf') {
      return item.correctLabel ?? (Array.isArray(item.options) ? item.options[item.correctIndex] : '');
    }
    return item?.correctText || '';
  };

  // ── One dominant next action, from real state ─────────────────────────
  const replayLabel = mode === 'practice'
    ? tx('Continuer l’entraînement', 'Kontinye pratik la')
    : tx('Un autre quiz', 'Yon lòt kwiz');
  let primary: React.ReactNode;
  let secondary: React.ReactNode = null;
  if (signedIn && dueNow > 0) {
    primary = (
      <Link className="button button--primary button--lg" to={reviewHref}>
        {tx(`Réviser ${dueNow > 1 ? `mes ${dueNow} erreurs` : 'mon erreur'}`, `Revize ${dueNow > 1 ? `${dueNow} erè m yo` : 'erè m nan'}`)}
      </Link>
    );
    secondary = <button type="button" className="button button--ghost button--lg" onClick={onReplay}>{replayLabel}</button>;
  } else if (!signedIn && corrections > 0) {
    primary = <button type="button" className="button button--primary button--lg" onClick={goCorrections}>{tx('Voir les corrections', 'Wè koreksyon yo')}</button>;
    secondary = <button type="button" className="button button--ghost button--lg" onClick={onReplay}>{replayLabel}</button>;
  } else if (nextLesson) {
    primary = (
      <Link className="button button--primary button--lg" to={nextLesson.href}>
        {tx('Leçon suivante', 'Leson swivan')} <ArrowRight size={17} aria-hidden="true" />
      </Link>
    );
    secondary = <button type="button" className="button button--ghost button--lg" onClick={onReplay}>{replayLabel}</button>;
  } else {
    primary = <button type="button" className="button button--primary button--lg" onClick={onReplay}>{replayLabel}</button>;
    if (examHref && mode === 'quiz') {
      secondary = <Link className="button button--ghost button--lg" to={examHref}>{tx('Passer un examen blanc', 'Pase yon egzamen blan')}</Link>;
    }
  }

  const savedLine = (() => {
    const scoreNote = mode === 'quiz' ? tx('Ce score n’est pas enregistré. ', 'Nòt sa a pa anrejistre. ') : '';
    if (!signedIn) {
      return (
        <p className="qr-save">
          {scoreNote}{tx('Sans compte, tes erreurs ne sont pas gardées.', 'San kont, erè ou yo pa kenbe.')}{' '}
          <button type="button" className="qr-save__link" onClick={onSignIn}>{tx('Connecte-toi', 'Konekte')}</button>{' '}
          {tx('pour les retrouver dans Révision.', 'pou jwenn yo nan Revizyon.')}
        </p>
      );
    }
    const k = reviewIds.length;
    if (k === 0) {
      return <p className="qr-save">{scoreNote}{tx('Aucune nouvelle erreur à ajouter à ta Révision.', 'Pa gen nouvo erè pou ajoute nan Revizyon ou.')}</p>;
    }
    const plural = k > 1;
    if (confirm.state === 'confirmed') {
      return (
        <p className="pq-saved pq-saved--confirmed" role="status">
          <Check size={16} aria-hidden="true" />
          <span>
            {scoreNote}
            {tx(`${plural ? `${k} questions ratées au premier essai sont` : '1 question ratée au premier essai est'} dans ta `, `${k} kesyon ou rate premye fwa nan `)}
            <Link to={reviewHref}>{tx('Révision', 'Revizyon')}</Link>
            {tx(' — aussi sur ton téléphone.', ' ou — sou telefòn ou tou.')}
          </span>
        </p>
      );
    }
    if (confirm.state === 'unconfirmed') {
      return (
        <p className="pq-saved pq-saved--unconfirmed" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            {scoreNote}
            {tx(`Pas encore confirmé : ${plural ? `tes ${k} erreurs sont gardées` : 'ton erreur est gardée'} sur cet appareil pendant cette visite, mais pas encore dans ton compte. `,
              `Poko konfime : ${plural ? `${k} erè ou yo kenbe` : 'erè ou a kenbe'} sou aparèy sa a pandan vizit sa a, men poko nan kont ou. `)}
            <button type="button" onClick={confirm.recheck}>{tx('Vérifier à nouveau', 'Verifye ankò')}</button>
          </span>
        </p>
      );
    }
    return (
      <p className="pq-saved pq-saved--pending" role="status">
        <Clock size={16} aria-hidden="true" />
        <span>{scoreNote}{tx(`Ajout de ${plural ? `${k} erreurs` : '1 erreur'} à ta Révision… pas encore confirmé.`, `N ap ajoute ${k} erè nan Revizyon ou… poko konfime.`)}</span>
      </p>
    );
  })();

  return (
    <div className="qr">
      <Link className="qz__back" to={backHref}>
        <ChevronLeft size={15} aria-hidden="true" />
        {backLabel || tx('Pratiquer', 'Pratike')}
      </Link>

      <section className="qr-score" aria-labelledby="qr-title">
        <p className="qr-score__context">{context}</p>
        <h1 id="qr-title" className="qr-score__title">{title}</h1>
        {earlyStop ? (
          // Participation first, the score second — and the score keeps its
          // meaning (first-try answers out of the deck), only smaller, so an
          // early stop is never read as a poor completed attempt (LJ audit #7).
          <p className="qr-score__lead">
            <span className="qr-score__lead-main">
              {tx(`${answered} question${answered > 1 ? 's' : ''} répondue${answered > 1 ? 's' : ''} sur ${total}`, `${answered} kesyon reponn sou ${total}`)}
            </span>
            <span className="qr-score__lead-sep" aria-hidden="true"> · </span>
            <span className="qr-score__lead-sub">
              {tx(`${firstTry} juste${firstTry > 1 ? 's' : ''} du premier coup`, `${firstTry} bon premye fwa`)}
            </span>
          </p>
        ) : mode === 'quiz' ? (
          <>
            <p className="qr-score__figure">
              <span className="qr-score__num">{firstTry}</span>
              <span className="qr-score__of">/ {total}</span>
            </p>
            <p className="qr-score__def">{tx('bonnes réponses du premier coup', 'bon repons premye fwa')}</p>
          </>
        ) : (
          <p className="qr-score__def qr-score__def--practice">
            {tx(`${total} question${total > 1 ? 's' : ''} vue${total > 1 ? 's' : ''}. L’entraînement libre n’a pas de score.`, `${total} kesyon ou wè. Pratik lib pa gen nòt.`)}
          </p>
        )}
        {verdict && <p className="qr-score__verdict">{verdict}</p>}

        <ul className="qr-tally" aria-label={tx('Détail', 'Detay')}>
          {mode === 'practice' && (
            <li className="qr-tally__item"><strong>{firstTry}</strong> {tx('du premier coup', 'premye fwa')}</li>
          )}
          <li className="qr-tally__item"><strong>{afterRetry}</strong> {tx('après un indice', 'apre yon endis')}</li>
          <li className="qr-tally__item"><strong>{missed}</strong> {tx(missed === 1 ? 'ratée' : 'ratées', 'rate')}</li>
          {unanswered > 0 && (
            <li className="qr-tally__item"><strong>{unanswered}</strong> {tx('sans réponse', 'san repons')}</li>
          )}
          {ungraded > 0 && (
            <li className="qr-tally__item"><strong>{ungraded}</strong> {tx('non corrigée' + (ungraded > 1 ? 's' : '') + ' automatiquement', 'pa korije otomatikman')}</li>
          )}
        </ul>
        {(unanswered > 0 || ungraded > 0) && (
          <p className="qr-score__note">
            {tx('Les questions sans réponse ou non corrigées ne comptent ni comme justes ni comme fausses, et ne vont pas dans Révision.',
              'Kesyon san repons oswa ki pa korije pa konte ni bon ni move, epi yo pa ale nan Revizyon.')}
          </p>
        )}

        <div className="qr-actions">
          {primary}
          {secondary}
          {corrections > 0 && signedIn && (
            <button type="button" className="qr-actions__text" onClick={goCorrections}>
              {tx('Voir les corrections', 'Wè koreksyon yo')}
            </button>
          )}
          <button type="button" className="qr-actions__text" onClick={onChangeUnit}>
            {tx('Changer de chapitre', 'Chanje chapit')}
          </button>
        </div>

        {signedIn && reviewIds.length === 0 && scopeDue === 0 && (
          <p className="pq-saved pq-saved--confirmed">
            <Check size={16} aria-hidden="true" />
            <span>{tx('Rien à revoir dans ce chapitre : tout est à jour.', 'Anyen pou revize nan chapit sa a : tout bagay ajou.')}</span>
          </p>
        )}
        {savedLine}
      </section>

      {total > 0 && (
        <section className="qr-review" ref={reviewRef} tabIndex={-1} aria-labelledby="qr-review-title">
          <h2 id="qr-review-title" className="qr-review__title">{tx('Question par question', 'Kesyon pa kesyon')}</h2>
          <ol className="qr-list">
            {deck.map((item, i) => {
              const entry = log[i];
              const status = statuses[i];
              const answers = (entry?.answers || []).filter(Boolean);
              // Wrong tries are struck through; the final right answer is not
              // repeated (it is the expected answer below).
              const given = status === 'correct' || status === 'retry' ? answers.slice(0, -1) : answers;
              const explanation = item?.good || item?.wrong || '';
              const goesToReview = signedIn && reviewIds.includes(String(item?.id || ''));
              const expected = answerOf(item);
              return (
                <li key={`${item?.id || 'q'}-${i}`} className={`qr-item qr-item--${status}`}>
                  <div className="qr-item__head">
                    <span className="qr-item__num">{i + 1}</span>
                    <AnswerStatus kind={status} tx={tx} tries={entry?.tries} />
                    {goesToReview && <span className="qr-item__tag">{tx('Va dans Révision', 'Ale nan Revizyon')}</span>}
                  </div>
                  <div className="qr-item__stem" dangerouslySetInnerHTML={renderWithKatex(item?.stem || '', katexReady)} />
                  <dl className="qr-item__answers">
                    {given.length > 0 && (
                      <div className={`qr-item__row qr-item__row--yours${status === 'ungraded' ? ' is-plain' : ''}`}>
                        <dt>{tx(given.length > 1 ? 'Tes réponses' : 'Ta réponse', given.length > 1 ? 'Repons ou yo' : 'Repons ou')}</dt>
                        <dd>
                          {given.map((a, k) => (
                            <span key={k} className="qr-item__given" dangerouslySetInnerHTML={renderWithKatex(a, katexReady)} />
                          ))}
                        </dd>
                      </div>
                    )}
                    <div className="qr-item__row qr-item__row--right">
                      <dt>{tx('Bonne réponse', 'Bon repons')}</dt>
                      {status === 'ungraded' || !expected
                        ? <dd className="is-none">{tx('Aucun corrigé enregistré', 'Pa gen koreksyon anrejistre')}</dd>
                        : <dd dangerouslySetInnerHTML={renderWithKatex(expected, katexReady)} />}
                    </div>
                  </dl>
                  {status !== 'correct' && (explanation
                    ? <p className="qr-item__why" dangerouslySetInnerHTML={renderWithKatex(explanation, katexReady)} />
                    : <p className="qr-item__why qr-item__why--none">{tx('Pas encore d’explication rédigée pour cette question.', 'Poko gen eksplikasyon ekri pou kesyon sa a.')}</p>)}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
