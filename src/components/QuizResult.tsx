import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft } from './icons';
import { useKatex, renderWithKatex } from '../utils/shared';

/** One deck question as the quiz page recorded it. */
export interface QuizLogEntry {
  /** Tries used (1 = found on the first try). */
  tries: number;
  /** Found within the allowed tries. */
  solved: boolean;
  /** Every answer given, in order. */
  answers: string[];
}

/**
 * The end of a fixed-length quiz (design spec S07).
 *
 * One score with its definition — first-try answers, because a question found
 * after a hint is still one the student did not know. Retry-assisted and
 * missed questions are counted separately, and the review list underneath
 * shows each question in deck order with the student's answer, the expected
 * one and the explanation. Nothing here is saved: the page says so.
 */
export default function QuizResult({
  deck,
  log,
  title,
  context,
  tx,
  signedIn,
  onSignIn,
  onReplay,
  onChangeUnit,
  examHref,
}: {
  deck: any[];
  log: QuizLogEntry[];
  title: string;
  context: string;
  tx: (fr: string, ht: string) => string;
  signedIn: boolean;
  onSignIn: () => void;
  onReplay: () => void;
  onChangeUnit: () => void;
  examHref: string | null;
}) {
  const katexReady = useKatex();
  const reviewRef = useRef<HTMLElement>(null);
  // The last question may have left the page scrolled; the score is the top.
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const total = deck.length;
  const firstTry = log.filter((e) => e?.solved && e.tries === 1).length;
  const afterRetry = log.filter((e) => e?.solved && e.tries > 1).length;
  const missed = total - firstTry - afterRetry;
  const toReview = afterRetry + missed;

  const verdict = firstTry === total
    ? tx('Tout juste du premier coup.', 'Tout bon premye fwa.')
    : firstTry >= Math.ceil(total * 0.7)
      ? tx('Solide. Revois les quelques questions ratées.', 'Solid. Revize kèk kesyon ou rate yo.')
      : tx('Cette unité mérite une révision.', 'Inite sa a merite yon revizyon.');

  const goReview = () => {
    const el = reviewRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  const answerOf = (item: any) => {
    if (item?.kind === 'mcq' || item?.kind === 'tf') {
      return item.correctLabel ?? (Array.isArray(item.options) ? item.options[item.correctIndex] : '');
    }
    return item?.correctText || '';
  };

  return (
    <div className="qr">
      <Link className="qz__back" to="/practice">
        <ChevronLeft size={15} aria-hidden="true" />
        {tx('Pratiquer', 'Pratike')}
      </Link>

      <section className="qr-score" aria-labelledby="qr-title">
        <p className="qr-score__context">{context}</p>
        <h1 id="qr-title" className="qr-score__title">{title}</h1>
        <p className="qr-score__figure">
          <span className="qr-score__num">{firstTry}</span>
          <span className="qr-score__of">/ {total}</span>
        </p>
        <p className="qr-score__def">
          {tx('bonnes réponses du premier coup', 'bon repons premye fwa')}
        </p>
        <p className="qr-score__verdict">{verdict}</p>

        <ul className="qr-tally" aria-label={tx('Détail', 'Detay')}>
          <li className="qr-tally__item qr-tally__item--retry">
            <strong>{afterRetry}</strong> {tx('après un indice', 'apre yon endis')}
          </li>
          <li className="qr-tally__item qr-tally__item--missed">
            <strong>{missed}</strong> {tx(missed === 1 ? 'manquée' : 'manquées', 'rate')}
          </li>
        </ul>

        <div className="qr-actions">
          {toReview > 0 ? (
            <>
              <button type="button" className="button button--primary button--lg" onClick={goReview}>
                {tx('Revoir mes erreurs', 'Revize erè m yo')}
              </button>
              <button type="button" className="button button--ghost button--lg" onClick={onReplay}>
                {tx('Refaire un quiz', 'Refè yon kwiz')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button button--primary button--lg" onClick={onReplay}>
                {tx('Un autre quiz', 'Yon lòt kwiz')}
              </button>
              {examHref && (
                <Link className="button button--ghost button--lg" to={examHref}>
                  {tx('Passer un examen blanc', 'Pase yon egzamen blan')}
                </Link>
              )}
            </>
          )}
          <button type="button" className="qr-actions__text" onClick={onChangeUnit}>
            {tx('Changer d’unité', 'Chanje inite')}
          </button>
        </div>

        <p className="qr-save">
          {signedIn ? (
            toReview > 0
              ? <>{tx('Ce score n’est pas enregistré. Les questions ratées du premier coup vont dans', 'Nòt sa a pa anrejistre. Kesyon ou pa jwenn premye fwa yo ale nan')} <Link to="/revision">{tx('Révision', 'Revizyon')}</Link>.</>
              : tx('Ce score n’est pas enregistré.', 'Nòt sa a pa anrejistre.')
          ) : (
            <>
              {tx('Ce score n’est pas enregistré.', 'Nòt sa a pa anrejistre.')}{' '}
              <button type="button" className="qr-save__link" onClick={onSignIn}>
                {tx('Connecte-toi', 'Konekte')}
              </button>{' '}
              {tx('pour retrouver tes erreurs plus tard.', 'pou jwenn erè ou yo pita.')}
            </>
          )}
        </p>
      </section>

      <section className="qr-review" ref={reviewRef} tabIndex={-1} aria-labelledby="qr-review-title">
        <h2 id="qr-review-title" className="qr-review__title">{tx('Question par question', 'Kesyon pa kesyon')}</h2>
        <ol className="qr-list">
          {deck.map((item, i) => {
            const entry = log[i];
            const status = !entry || !entry.solved ? 'missed' : entry.tries === 1 ? 'first' : 'retry';
            const wrongAnswers = (entry?.answers || []).slice(0, status === 'missed' ? undefined : -1).filter(Boolean);
            const explanation = item?.good || item?.wrong || '';
            return (
              <li key={item?.id || i} className={`qr-item qr-item--${status}`}>
                <div className="qr-item__head">
                  <span className="qr-item__num">{i + 1}</span>
                  <span className={`qr-badge qr-badge--${status}`}>
                    {status === 'first' && <Check size={14} aria-hidden="true" />}
                    {status === 'first'
                      ? tx('Du premier coup', 'Premye fwa')
                      : status === 'retry'
                        ? tx(`Trouvée au ${entry.tries}e essai`, `Jwenn nan ${entry.tries}yèm esè`)
                        : tx('Manquée', 'Rate')}
                  </span>
                </div>
                <div className="qr-item__stem" dangerouslySetInnerHTML={renderWithKatex(item?.stem || '', katexReady)} />
                <dl className="qr-item__answers">
                  {wrongAnswers.length > 0 && (
                    <div className="qr-item__row qr-item__row--yours">
                      <dt>{tx(wrongAnswers.length > 1 ? 'Tes réponses' : 'Ta réponse', wrongAnswers.length > 1 ? 'Repons ou yo' : 'Repons ou')}</dt>
                      <dd>
                        {wrongAnswers.map((a, k) => (
                          <span key={k} className="qr-item__given" dangerouslySetInnerHTML={renderWithKatex(a, katexReady)} />
                        ))}
                      </dd>
                    </div>
                  )}
                  <div className="qr-item__row qr-item__row--right">
                    <dt>{tx('Bonne réponse', 'Bon repons')}</dt>
                    <dd dangerouslySetInnerHTML={renderWithKatex(answerOf(item), katexReady)} />
                  </div>
                </dl>
                {explanation && status !== 'first' && (
                  <p className="qr-item__why" dangerouslySetInnerHTML={renderWithKatex(explanation, katexReady)} />
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
