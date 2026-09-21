/**
 * /revision — Revizyon: a quiz built ONLY from the student's own missed
 * questions.
 *
 * This is the page the reminder email's "revize kesyon ou rate yo" link lands
 * on. The queue is the shared review map (users/{uid}/mastery/review — the
 * same doc mobile writes), rebuilt against the quiz bank. Answering a question
 * correctly here resolves it everywhere (DirectBankQuiz records first-attempt
 * outcomes), so the pile shrinks by being learned, not dismissed.
 *
 * The deck is FROZEN when the session starts: answering mutates the review
 * map, and a live-recomputed deck would reshuffle under the student.
 *
 * EVERY NUMBER THIS PAGE SHOWS (redesign plan §6.6):
 *
 *   items.length   Questions in THIS session's frozen deck. Due ids from the
 *                  review map, intersected with the quiz bank (an id whose
 *                  question has left the bank is skipped), essays dropped
 *                  because they cannot be auto-resolved, capped at
 *                  SESSION_LIMIT. So it is "how many you will see now", not
 *                  "how many you have missed".
 *   idx + 1        Position in that deck.
 *   score          Questions answered correctly in this session — counted
 *                  once per question, on the first correct answer
 *                  (`handleScore` guards with canAdvance). Each one is also
 *                  resolved in the shared review map by DirectBankQuiz, so it
 *                  leaves the pile everywhere, phone included.
 *   attemptsLeft   MAX_ATTEMPTS from DirectBankQuiz, which owns the rule.
 *   remainingDue   Re-read from the review map AFTER the session, so the
 *                  completion screen states what is actually left rather than
 *                  subtracting an assumption. Null while unknown, and the copy
 *                  then says nothing about a remainder.
 *
 * No mastery, streak or readiness figure appears here: nothing on this page
 * establishes one. The review map records "missed / resolved", not mastery —
 * that lives in users/{uid}/mastery/lessons, keyed by lesson.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Check } from 'lucide-react';
import DirectBankQuiz, { MAX_ATTEMPTS } from '../components/DirectBankQuiz';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { EmptyState } from '../components/StateViews';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { toDirectItemFromRow } from '../services/quizBank';
import { loadReviewMap } from '../services/reviewService';
import { dueQuestionIds, type ReviewMap } from '../utils/review';

const SESSION_LIMIT = 10;

export default function Revision() {
  const { data: appData, isLoading: dataLoading } = useAppData();
  const user = useStore((s) => s.user);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [reviewMap, setReviewMap] = useState<ReviewMap | null>(null);
  useEffect(() => {
    let alive = true;
    if (!user?.uid) { setReviewMap(null); return undefined; }
    loadReviewMap(user.uid).then((map) => { if (alive) setReviewMap({ ...map }); });
    return () => { alive = false; };
  }, [user?.uid]);

  // Frozen deck: built once when both the review map and the quiz bank are in.
  const [items, setItems] = useState<any[] | null>(null);
  const rows: any[] = appData?.quizBank?.rows ?? [];
  useEffect(() => {
    if (items !== null || reviewMap === null || rows.length === 0) return;
    const byId = new Map<string, any>();
    for (const row of rows) if (row?.id) byId.set(String(row.id), row);
    const deck: any[] = [];
    for (const id of dueQuestionIds(reviewMap)) {
      const row = byId.get(id);
      if (!row) continue; // question no longer in the bank — let it age out
      const item = toDirectItemFromRow(row);
      // Essays can't be auto-graded into "resolved"; keep the session crisp.
      if (item && item.kind !== 'essay') deck.push(item);
      if (deck.length >= SESSION_LIMIT) break;
    }
    setItems(deck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewMap, rows, items]);

  /**
   * Reviewable questions left, counted the same way the deck is built: due in
   * the review map AND still present in the bank AND auto-gradable. Anything
   * else would be a number the student cannot act on.
   */
  const countReviewable = (map: ReviewMap, bankRows: any[]): number => {
    const byId = new Map<string, any>();
    for (const row of bankRows) if (row?.id) byId.set(String(row.id), row);
    let n = 0;
    for (const id of dueQuestionIds(map)) {
      const row = byId.get(id);
      if (!row) continue;
      const item = toDirectItemFromRow(row);
      if (item && item.kind !== 'essay') n += 1;
    }
    return n;
  };

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [outcome, setOutcome] = useState<null | 'correct' | 'out'>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [finished, setFinished] = useState(false);
  // What is still due once the session ends — re-read, never inferred.
  // `null` = not known yet, and the copy then makes no claim about it.
  const [remainingDue, setRemainingDue] = useState<number | null>(null);

  useEffect(() => {
    setCanAdvance(false);
    setOutcome(null);
    setAttemptsLeft(MAX_ATTEMPTS);
  }, [idx]);

  /*
   * A finished session must lead somewhere (§8: "meaningful completion and
   * next action, not an unexplained dead end"), and what it should lead to
   * depends on whether anything is still due. DirectBankQuiz has already
   * resolved each correct answer into the shared review map, so re-reading it
   * here is both cheap (module cache) and the only truthful source.
   */
  useEffect(() => {
    if (!finished || !user?.uid) return undefined;
    let alive = true;
    loadReviewMap(user.uid)
      .then((map) => { if (alive) setRemainingDue(countReviewable(map, rows)); })
      .catch(() => { if (alive) setRemainingDue(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, user?.uid, rows]);

  const handleScore = (evt: any) => {
    if (!evt) return;
    if (evt.message === 'correct') {
      if (!canAdvance) setScore((s) => s + 1);
      setCanAdvance(true);
      setOutcome('correct');
    } else if (evt.message === 'exhausted_attempts') {
      setCanAdvance(true);
      setOutcome('out');
      setAttemptsLeft(0);
    } else if (typeof evt.attemptsLeft === 'number') {
      setAttemptsLeft(evt.attemptsLeft);
    }
  };

  const goNext = () => {
    if (!canAdvance) return;
    const next = idx + 1;
    if (next >= (items?.length ?? 0)) setFinished(true);
    else setIdx(next);
  };

  const header = (
    <div className="page-header">
      <h1 className="page-header__title">
        <Brain size={26} style={{ verticalAlign: '-4px', marginRight: '0.5rem' }} aria-hidden />
        {t('Révision', 'Revizyon')}
      </h1>
      <p className="page-header__subtitle text-muted">
        {t('Les questions que vous avez ratées — jusqu\'à ce que vous les maîtrisiez.',
          'Kesyon ou te rate yo — jiskaske ou metrize yo.')}
      </p>
    </div>
  );

  const shell = (body: React.ReactNode) => (
    <section className="section revision-page">
      <div className="container">
        {header}
        {body}
      </div>
    </section>
  );

  if (!user?.uid) {
    return shell(
      <EmptyState
        title={t('Connectez-vous pour réviser', 'Konekte pou revize')}
        message={t('Connectez-vous pour retrouver les questions que vous avez ratées.',
          'Konekte pou w jwenn kesyon ou te rate yo.')}
        action={{
          label: t('Se connecter', 'Konekte'),
          onClick: () => useStore.getState().toggleAuthModal(),
        }}
      />,
    );
  }

  if (dataLoading || items === null) {
    // Question-card-shaped skeleton (label + heading + question + options) so
    // the layout doesn't jump when the deck arrives.
    return shell(
      <div className="card unit-quiz" aria-busy="true">
        <div className="unit-quiz__header">
          <div className="unit-quiz__heading" style={{ display: 'grid', gap: '0.4rem' }}>
            <Skeleton variant="text" width={90} />
            <Skeleton variant="text" width={150} height="1.2rem" />
          </div>
          <Skeleton width={64} height={26} radius={999} />
        </div>
        <SkeletonText lines={2} lastWidth="45%" />
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1.1rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={48} radius={12} />
          ))}
        </div>
      </div>,
    );
  }

  if (items.length === 0) {
    /*
     * An empty deck is NOT proof that nothing is due. `loadReviewMap` swallows
     * a failed Firestore read and returns {} (services/reviewService.ts), and a
     * due id whose question has left the quiz bank is skipped here, so this
     * branch covers "nothing due", "we could not read your review list" and
     * "your due questions are no longer in the bank" alike.
     *
     * The old copy picked the flattering one — "tu as corrigé toutes tes
     * erreurs !" — which §13 lists as a generic success message before
     * confirmation. "Nothing to review right now" is true in all three cases,
     * and the next action works in all three too.
     */
    return shell(
      <EmptyState
        icon={<span style={{ fontSize: '1.6rem' }} aria-hidden>✓</span>}
        title={t('Rien à réviser pour le moment',
          'Anyen pou revize kounye a')}
        message={t('Les questions que vous ratez dans les exercices arrivent ici, jusqu\'à ce que vous les réussissiez.',
          'Kesyon ou rate nan egzèsis yo ap vini isit la, jiskaske ou reyisi yo.')}
        action={{ label: t('Faire des exercices', 'Fè egzèsis'), href: '/quizzes' }}
        secondaryAction={{ label: t('Retour au tableau de bord', 'Tounen sou tablo a'), href: '/dashboard' }}
      />,
    );
  }

  if (finished) {
    const resolved = score;
    const missed = items.length - resolved;
    // Only offer another session when there is something to put in it. The
    // button used to appear unconditionally and could open an empty deck.
    const canContinue = remainingDue == null || remainingDue > 0;
    const startNewSession = () => {
      setItems(null);
      setReviewMap(null);
      setIdx(0);
      setScore(0);
      setFinished(false);
      setRemainingDue(null);
      loadReviewMap(user.uid).then((m) => setReviewMap({ ...m }));
    };

    return shell(
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }} aria-hidden>
          {resolved === items.length ? '🎉' : '💪'}
        </div>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {t(`${resolved} question${resolved > 1 ? 's' : ''} réussie${resolved > 1 ? 's' : ''} sur ${items.length}.`,
            `${resolved} kesyon reyisi sou ${items.length}.`)}
        </p>
        <p className="text-muted" style={{ margin: '0.5rem 0 0' }}>
          {missed > 0
            ? t(
              // "Les 1 autre reviendront" was the singular before this.
              missed > 1
                ? `Les ${missed} autres reviendront — c'est comme ça qu'on apprend.`
                : 'L\'autre reviendra — c\'est comme ça qu\'on apprend.',
              missed > 1
                ? `${missed} lòt yo ap tounen — se konsa nou aprann.`
                : 'Lòt la ap tounen — se konsa nou aprann.')
            : t('Chacune de ces questions quitte votre liste de révision, sur le web comme sur le téléphone.',
              'Chak kesyon sa yo soti nan lis revizyon ou, sou web la tankou sou telefòn lan.')}
        </p>
        {/* What is left — stated only once it has actually been re-read. */}
        {remainingDue != null && (
          <p className="text-muted" style={{ margin: '0.35rem 0 1rem', fontWeight: 600 }}>
            {remainingDue > 0
              ? t(`Il vous reste ${remainingDue} question${remainingDue > 1 ? 's' : ''} à revoir.`,
                `Ou gen ${remainingDue} kesyon ki rete pou revize.`)
              : t('Votre liste de révision est vide pour le moment.', 'Lis revizyon ou vid kounye a.')}
          </p>
        )}
        {remainingDue == null && <div style={{ height: '1rem' }} />}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {canContinue ? (
            <button type="button" className="button button--primary button--sm" onClick={startNewSession}>
              {t('Continuer la révision', 'Kontinye revizyon an')}
            </button>
          ) : (
            <Link className="button button--primary button--sm" to="/quizzes">
              {t('Faire des exercices', 'Fè egzèsis')}
            </Link>
          )}
          <Link className="button button--ghost button--sm" to="/dashboard">
            {t('Retour au tableau de bord', 'Tounen sou tablo a')}
          </Link>
        </div>
      </div>,
    );
  }

  const progress = `${idx + 1} / ${items.length}`;
  return shell(
    <div className="card unit-quiz">
      <div className="unit-quiz__header">
        <div className="unit-quiz__heading">
          <span className="quiz-card__label">{t('Révision', 'Revizyon')}</span>
          <h3 className="quiz-card__heading">{t(`Question ${idx + 1}`, `Kesyon ${idx + 1}`)}</h3>
        </div>
        <div className="unit-quiz__meta">
          <span className="chip chip--ghost">{progress}</span>
          {outcome === 'correct' ? (
            <span className="chip chip--success"><Check size={14} /> {t('Correct', 'Kòrèk')}</span>
          ) : outcome === 'out' ? (
            <span className="chip chip--danger">{t('Plus d\'essais', 'Pa gen esè ankò')}</span>
          ) : (
            <span className="chip chip--ghost">
              {t(`${attemptsLeft} essai${attemptsLeft > 1 ? 's' : ''} restant${attemptsLeft > 1 ? 's' : ''}`, `${attemptsLeft} esè ki rete`)}
            </span>
          )}
        </div>
      </div>

      <DirectBankQuiz
        item={items[idx]}
        onScore={handleScore}
        hideHeader
        onNext={goNext}
        canAdvance={canAdvance}
        isLast={idx + 1 >= items.length}
        onClose={undefined}
      />
    </div>,
  );
}
