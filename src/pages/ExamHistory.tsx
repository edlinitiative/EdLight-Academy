import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronRight, PlayCircle, Target, ArrowRight, Lightbulb } from 'lucide-react';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { loadDueReviewIds } from '../services/reviewService';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { subjectColor, examDisplayTitle } from '../utils/examUtils';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import { EmptyState } from '../components/StateViews';
import { Skeleton } from '../components/Skeleton';
import './ExamOverview.css'; // shared .exam-overview__crumbs
import './ExamHistory.css';

/**
 * ExamHistory — /exams/resultats ("Mes résultats")
 *
 * The page answers, in this order (redesign plan §6.6 applied to a history
 * screen): what is still unfinished, how did the finished ones go, and what
 * should I do next.
 *
 *   1. "Examens commencés" — unfinished drafts first, because an abandoned
 *      attempt is more actionable than a score already earned. Source is the
 *      SAME synchronous localStorage mirror ExamTake writes and ExamOverview
 *      reads (`edlight-exam-draft-<examId>`), with ExamOverview's exact
 *      "has progress" predicate — no second progress model. It is device-local
 *      by construction (there is no bulk reader for the Firestore drafts), so
 *      the section says so rather than implying cross-device coverage.
 *   2. "Examens corrigés" — the most recent result gets a featured surface
 *      with its review action; older ones stay compact rows.
 *   3. "Et maintenant ?" — the same next-step logic ExamResults ends on, fed
 *      by the real due-review count from reviewService (never a fabricated
 *      trend, streak or readiness claim).
 *
 * Anonymous visitors see their session results (sessionStorage); signing in
 * adds the cross-device history.
 */

const DRAFT_PREFIX = 'edlight-exam-draft-';

/** Same predicate ExamOverview uses to decide an attempt is resumable. */
const draftHasProgress = (d: any): boolean =>
  !!d && ((d.answers && Object.keys(d.answers).length > 0) || (d.currentQ ?? 0) > 0);

/**
 * All resumable drafts this device has mirrored, newest first. Read once on
 * mount (localStorage is synchronous and does not change under us here).
 */
function readLocalDrafts(): Array<{ examKey: string; answered: number; updatedAtMs: number | null }> {
  const out: Array<{ examKey: string; answered: number; updatedAtMs: number | null }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const draft = JSON.parse(raw);
      if (!draft || draft.status === 'submitted' || !draftHasProgress(draft)) continue;
      out.push({
        examKey: key.slice(DRAFT_PREFIX.length),
        answered: draft.answers ? Object.keys(draft.answers).length : 0,
        updatedAtMs: typeof draft.updated_at_ms === 'number' ? draft.updated_at_ms : null,
      });
    }
  } catch {
    /* localStorage may be unavailable (private mode, blocked storage) */
  }
  return out.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
}

function useExamCatalogIndex() {
  return useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
  });
}

export default function ExamHistory() {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const userId = useStore((s) => s.user?.uid);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const { data: catalog, isPending } = useExamCatalogIndex();
  const attempts = useExamAttempts();
  // Same query key as the Practice hub, so the two share one cached answer.
  const { data: dueIds = [] } = useQuery({
    queryKey: ['due-review-ids', userId],
    queryFn: () => loadDueReviewIds(userId!),
    enabled: !!userId,
  });
  const [localDrafts] = useState(readLocalDrafts);

  const formatDate = (ms: number | null | undefined) =>
    ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  /** examId -> catalog entry, built once and shared by both lists. */
  const byKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of catalog || []) map.set(String(e.exam_id ?? e._idx), e);
    return map;
  }, [catalog]);

  const describe = (examKey: string) => {
    const exam = byKey.get(examKey);
    if (!exam) return null;
    const slug = levelToSlug(exam.level);
    return {
      examKey,
      slug,
      title: examDisplayTitle(exam, L('Examen', 'Egzamen')),
      subject: exam._subject || exam.subject || '',
      year: exam.year || '',
      levelLabel: LEVEL_SLUG_LABELS[slug]?.[ht ? 'ht' : 'fr'] || slug,
      color: subjectColor(exam._subject),
    };
  };

  const drafts = useMemo(() => {
    if (!catalog) return [];
    return localDrafts
      .map((d) => {
        const meta = describe(d.examKey);
        return meta ? { ...meta, answered: d.answered, updatedAtMs: d.updatedAtMs } : null;
      })
      .filter(Boolean) as any[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, byKey, localDrafts, ht]);

  const rows = useMemo(() => {
    if (!catalog) return [];
    return Object.entries(attempts)
      .map(([examKey, info]) => {
        const meta = describe(examKey);
        return meta ? { ...meta, percentage: info.percentage, submittedAtMs: info.submittedAtMs } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0)) as any[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, byKey, attempts, ht]);

  const scoreTone = (pct: number | null) =>
    pct == null ? '' : pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'low';

  const [latest, ...older] = rows;
  const dueCount = dueIds.length;
  const hasAnything = drafts.length > 0 || rows.length > 0;

  /** French plural mark; Kreyòl nouns do not take one. */
  const frS = (n: number) => (n > 1 ? 's' : '');

  return (
    <div className="section exam-history">
      <div className="container exam-history__container">
        <nav className="exam-overview__crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <span>{L('Mes résultats', 'Rezilta mwen')}</span>
        </nav>

        <header className="exam-history__head">
          <h1>{L('Mes résultats', 'Rezilta mwen')}</h1>
          <p className="exam-history__lede">
            {L(
              'Ce que vous avez commencé, ce que vous avez terminé, et par quoi continuer.',
              'Sa ou kòmanse, sa ou fini, ak sa pou kontinye.',
            )}
          </p>
          {rows.length > 0 && (
            <p className="exam-history__count">
              {L(
                `${rows.length} examen${frS(rows.length)} corrigé${frS(rows.length)}`,
                `${rows.length} egzamen korije`,
              )}
              {latest?.submittedAtMs ? ` · ${L('dernier le', 'dènye a')} ${formatDate(latest.submittedAtMs)}` : ''}
            </p>
          )}
        </header>

        {/* 1. Unfinished first — the most actionable thing on the page. */}
        {drafts.length > 0 && (
          <section className="exam-history__block" aria-labelledby="exam-history-resume">
            <div className="exam-history__block-head">
              <h2 id="exam-history-resume" className="exam-history__block-title">
                <PlayCircle size={18} aria-hidden />
                {L('Examens commencés', 'Egzamen ou kòmanse')}
              </h2>
              <p className="exam-history__block-note">
                {L(
                  'Enregistrés sur cet appareil. Reprenez là où vous vous êtes arrêté.',
                  'Anrejistre sou aparèy sa a. Kontinye kote ou te rete a.',
                )}
              </p>
            </div>

            <ul className="exam-history__resume-list">
              {drafts.map((d) => {
                const date = formatDate(d.updatedAtMs);
                return (
                  <li key={d.examKey} className="exam-history__resume">
                    <span className="exam-history__resume-bar" style={{ background: d.color }} aria-hidden />
                    <div className="exam-history__resume-body">
                      <span className="exam-history__title">{d.title}</span>
                      <span className="exam-history__meta">
                        {[d.subject, d.levelLabel, d.year].filter(Boolean).join(' · ')}
                      </span>
                      <span className="exam-history__resume-progress">
                        {d.answered > 0
                          ? L(
                              `${d.answered} réponse${frS(d.answered)} enregistrée${frS(d.answered)}`,
                              `${d.answered} repons anrejistre`,
                            )
                          : L('Commencé, aucune réponse encore', 'Kòmanse, poko gen repons')}
                        {date ? ` · ${date}` : ''}
                      </span>
                    </div>
                    <Link
                      className="button button--primary button--sm"
                      to={`/exams/${d.slug}/${d.examKey}`}
                      aria-label={L(`Reprendre : ${d.title}`, `Kontinye : ${d.title}`)}
                    >
                      {L('Reprendre', 'Kontinye')}
                      <ArrowRight size={15} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 2. Corrected exams — most recent featured, the rest compact. */}
        <section className="exam-history__block" aria-labelledby="exam-history-graded">
          <div className="exam-history__block-head">
            <h2 id="exam-history-graded" className="exam-history__block-title">
              <History size={18} aria-hidden />
              {L('Examens corrigés', 'Egzamen korije')}
            </h2>
          </div>

          {isPending ? (
            <div aria-busy="true" className="exam-history__list">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={72} radius={16} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<History size={28} strokeWidth={1.75} aria-hidden />}
              title={L('Aucun résultat pour le moment', 'Poko gen rezilta')}
              message={
                isAuthenticated
                  ? L(
                      'Passez votre premier examen blanc : sa correction détaillée et vos points faibles apparaîtront ici.',
                      'Fè premye egzamen blan ou : koreksyon detaye a ak pwen fèb ou yo ap parèt isit la.',
                    )
                  : L(
                      'Vos résultats restent sur cet appareil tant que vous n’êtes pas connecté. Connectez-vous pour les retrouver partout.',
                      'Rezilta ou yo rete sou aparèy sa a toutotan ou pa konekte. Konekte pou jwenn yo tout kote.',
                    )
              }
              action={
                isAuthenticated
                  ? { label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams') }
                  : { label: L('Se connecter', 'Konekte'), onClick: () => toggleAuthModal() }
              }
              secondaryAction={
                isAuthenticated
                  ? undefined
                  : { label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams') }
              }
            />
          ) : (
            <>
              {latest && (
                <div
                  className={`exam-history__feature exam-history__feature--${scoreTone(latest.percentage)}`}
                  style={{ '--exam-accent': latest.color } as React.CSSProperties}
                >
                  <div className="exam-history__feature-main">
                    <span className="exam-history__feature-eyebrow">
                      {L('Dernier examen corrigé', 'Dènye egzamen korije')}
                    </span>
                    <h3 className="exam-history__feature-title">{latest.title}</h3>
                    <p className="exam-history__meta">
                      {[latest.subject, latest.levelLabel, latest.year, formatDate(latest.submittedAtMs)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {latest.percentage != null && (
                    <p className={`exam-history__feature-score exam-history__feature-score--${scoreTone(latest.percentage)}`}>
                      <span className="exam-history__feature-score-value">{latest.percentage}%</span>
                      <span className="exam-history__feature-score-label">{L('Meilleur score', 'Pi bon nòt')}</span>
                    </p>
                  )}
                  <div className="exam-history__feature-actions">
                    <Link className="button button--primary button--sm" to={`/exams/${latest.slug}/${latest.examKey}/results`}>
                      {L('Revoir la correction', 'Gade koreksyon an')}
                    </Link>
                    <Link className="button button--ghost button--sm" to={`/exams/${latest.slug}/${latest.examKey}`}>
                      {L('Refaire l’examen', 'Refè egzamen an')}
                    </Link>
                  </div>
                </div>
              )}

              {older.length > 0 && (
                <div className="exam-history__list">
                  {older.map((r) => {
                    const tone = scoreTone(r.percentage);
                    const date = formatDate(r.submittedAtMs);
                    const meta = [r.subject, r.levelLabel, r.year, date].filter(Boolean).join(' · ');
                    return (
                      <Link
                        key={r.examKey}
                        className="exam-history__row"
                        to={`/exams/${r.slug}/${r.examKey}/results`}
                        aria-label={[
                          r.title,
                          meta,
                          r.percentage != null ? L(`score ${r.percentage} %`, `nòt ${r.percentage} %`) : '',
                        ]
                          .filter(Boolean)
                          .join(' — ')}
                      >
                        <span className="exam-history__swatch" style={{ background: r.color }} aria-hidden />
                        <span className="exam-history__body">
                          <span className="exam-history__title">{r.title}</span>
                          <span className="exam-history__meta">{meta}</span>
                        </span>
                        {r.percentage != null && (
                          <span className={`exam-history__score exam-history__score--${tone}`}>{r.percentage}%</span>
                        )}
                        <ChevronRight size={17} className="exam-history__chevron" aria-hidden />
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {/* 3. Next action — same loop ExamResults closes on. */}
        {hasAnything && (
          <section className="exam-history__next" aria-labelledby="exam-history-next">
            <span className="exam-history__next-icon" aria-hidden>
              <Lightbulb size={20} />
            </span>
            <div className="exam-history__next-copy">
              <h2 id="exam-history-next" className="exam-history__next-title">
                {L('Et maintenant', 'E kounye a')}&nbsp;?
              </h2>
              <p className="exam-history__next-sub">
                {dueCount > 0
                  ? L(
                      `Vous avez ${dueCount} question${frS(dueCount)} à revoir. Reprendre ses erreurs fait progresser plus vite qu’un nouvel examen.`,
                      `Ou gen ${dueCount} kesyon pou revize. Travay sou erè ou yo fè ou pwogrese pi vit pase yon lòt egzamen.`,
                    )
                  : L(
                      'Passez un nouvel examen blanc pour voir où vous en êtes, ou retravaillez une correction déjà ouverte.',
                      'Fè yon lòt egzamen blan pou wè kote ou ye, oswa retounen sou yon koreksyon ou deja louvri.',
                    )}
              </p>
              <div className="exam-history__next-actions">
                {dueCount > 0 && (
                  <Link className="button button--primary button--sm" to="/revision">
                    <Target size={15} aria-hidden /> {L('Revoir mes erreurs', 'Revize erè m yo')} ({dueCount})
                  </Link>
                )}
                <Link className={`button button--${dueCount > 0 ? 'ghost' : 'primary'} button--sm`} to="/exams">
                  {L('Choisir un examen', 'Chwazi yon egzamen')}
                </Link>
              </div>
            </div>
          </section>
        )}

        {!isAuthenticated && hasAnything && (
          <p className="exam-history__signin">
            {L(
              'Ces résultats sont enregistrés sur cet appareil uniquement.',
              'Rezilta sa yo anrejistre sou aparèy sa a sèlman.',
            )}{' '}
            <button type="button" className="exam-history__signin-link" onClick={() => toggleAuthModal()}>
              {L('Se connecter pour les retrouver partout', 'Konekte pou jwenn yo tout kote')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
