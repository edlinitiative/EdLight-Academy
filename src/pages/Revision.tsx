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

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [outcome, setOutcome] = useState<null | 'correct' | 'out'>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setCanAdvance(false);
    setOutcome(null);
    setAttemptsLeft(MAX_ATTEMPTS);
  }, [idx]);

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
        {t('Les questions que tu as ratées — jusqu\'à ce que tu les maîtrises.',
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
        title={t('Connecte-toi pour réviser', 'Konekte pou revize')}
        message={t('Connecte-toi pour retrouver les questions que tu as ratées.',
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
    return shell(
      <EmptyState
        icon={<span style={{ fontSize: '1.6rem' }} aria-hidden>🎉</span>}
        title={t('Rien à réviser — tu as corrigé toutes tes erreurs !',
          'Anyen pou revize — ou korije tout erè ou yo !')}
        message={t('Les questions ratées dans les exercices apparaîtront ici.',
          'Kesyon ou rate nan egzèsis yo ap parèt isit la.')}
        action={{ label: t('Faire des exercices', 'Fè egzèsis'), href: '/quizzes' }}
      />,
    );
  }

  if (finished) {
    const resolved = score;
    return shell(
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }} aria-hidden>
          {resolved === items.length ? '🎉' : '💪'}
        </div>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {t(`${resolved} question${resolved > 1 ? 's' : ''} corrigée${resolved > 1 ? 's' : ''} sur ${items.length}.`,
            `${resolved} kesyon korije sou ${items.length}.`)}
        </p>
        <p className="text-muted" style={{ margin: '0.5rem 0 1rem' }}>
          {resolved === items.length
            ? t('Tout est réglé pour aujourd\'hui.', 'Tout bagay regle pou jodi a.')
            : t('Celles que tu as ratées reviendront — c\'est comme ça qu\'on apprend.',
              'Sa ou rate yo ap tounen — se konsa nou aprann.')}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => { setItems(null); setReviewMap(null); setIdx(0); setScore(0); setFinished(false); loadReviewMap(user.uid).then((m) => setReviewMap({ ...m })); }}
          >
            {t('Nouvelle session', 'Nouvo sesyon')}
          </button>
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
