import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Target } from '../components/icons';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { listRecentExamAttempts } from '../services/userActivity';
import { loadDueReviewIds } from '../services/reviewService';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { examDisplayTitle } from '../utils/examUtils';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import { Skeleton } from '../components/Skeleton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import './examPremium.css';

/**
 * ExamHistory — /exams/resultats ("Mes résultats")
 *
 * The page answers, in this order (redesign plan §6.6 applied to a history
 * screen): what is still unfinished, how did the finished ones go, and what
 * should I do next.
 *
 *   1. "Examens commencés" — unfinished drafts first, because an abandoned
 *      attempt is more actionable than a score already earned. Two sources are
 *      merged (see the `drafts` memo): the Firestore attempts from
 *      `listRecentExamAttempts` and the synchronous localStorage mirror
 *      ExamTake writes and ExamOverview reads (`edlight-exam-draft-<examId>`),
 *      with ExamOverview's exact "has progress" predicate — no second progress
 *      model.
 *   2. "Examens corrigés" — the most recent result gets a featured surface
 *      with its review action; older ones stay compact rows.
 *   3. "Et maintenant ?" — the same next-step logic ExamResults ends on, fed
 *      by the real due-review count from reviewService (never a fabricated
 *      trend, streak or readiness claim).
 *
 * Anonymous visitors see their session results (sessionStorage); signing in
 * adds the cross-device history.
 *
 * EVERY NUMBER THIS PAGE SHOWS (redesign plan §6.6, "define the source and
 * meaning of each displayed number"):
 *
 *   rows.length         How many exams have a saved correction. One Firestore
 *                       document per exam (users/{uid}/examResults/{examId}),
 *                       plus anything in this session's sessionStorage — so it
 *                       counts PAPERS with a correction, not sittings.
 *   r.percentage        `summary.percentage` off that saved correction, i.e.
 *                       the score of the correction the row opens. Via
 *                       useExamAttempts, which keeps the higher of the saved
 *                       document and this session's result for the same exam.
 *                       Labelled as the score of that correction, never as a
 *                       "best score" across attempts — only one correction per
 *                       exam is ever stored, so no such history exists.
 *   r.submittedAtMs     `submitted_at_ms` on that same correction. It is when
 *                       the correction this row opens was submitted, which is
 *                       also what the list is sorted by.
 *   d.answered          Answers recorded on an unfinished attempt:
 *                       `answered_count` from the Firestore attempt, or the
 *                       size of the local draft's answers map, whichever this
 *                       device knows better (local wins — it is written on
 *                       every keystroke).
 *   dueCount            `loadDueReviewIds` → users/{uid}/mastery/review, the
 *                       ONE shared review doc mobile also writes. These are
 *                       QUIZ-BANK questions missed in exercises; exam
 *                       questions are not written to that doc, so the copy
 *                       names the source instead of implying exam mistakes.
 *
 * NOT SHOWN: any average, trend, readiness or mastery figure. Readiness is
 * computed elsewhere (services/readinessService.ts) from a wider input set and
 * is displayed on /exams and /profile; restating a partial version of it here
 * would be a second, contradictory model.
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

  const { data: catalog, isPending, isError, refetch } = useExamCatalogIndex();
  const attempts = useExamAttempts();
  // Same query key as the Practice hub, so the two share one cached answer.
  const { data: dueIds = [] } = useQuery({
    queryKey: ['due-review-ids', userId],
    queryFn: () => loadDueReviewIds(userId!),
    enabled: !!userId,
  });
  const [localDrafts] = useState(readLocalDrafts);

  /*
   * THE DRAFTS THAT ARE NOT ON THIS DEVICE.
   *
   * This page originally read only the `edlight-exam-draft-*` localStorage
   * mirror, on the belief that no bulk reader existed for the remote ones.
   * One does — `listRecentExamAttempts`, which the Dashboard has been using
   * all along. The consequence was visible on the live site: the dashboard
   * listed three exams in progress while this page, for the same account in
   * the same browser, said "Aucun résultat pour le moment".
   *
   * Same query key as the Dashboard so the two share one cached answer and can
   * never disagree again.
   */
  const { data: remoteAttempts = [] } = useQuery({
    queryKey: ['dashboard-exam-attempts', userId],
    queryFn: () => listRecentExamAttempts(userId!, 25),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

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
    };
  };

  const drafts = useMemo(() => {
    if (!catalog) return [];

    /*
     * Remote first, then anything this device knows that the server does not
     * yet — a draft saved while offline, or one from before the account was
     * signed in. Keyed by exam id so the same paper never appears twice, and
     * the local answered-count wins when both exist because it is the one
     * written on every keystroke.
     */
    const merged = new Map<string, { answered: number; updatedAtMs: number | null }>();
    for (const a of (remoteAttempts as any[])) {
      if (a?.status !== 'in_progress' || !a?.exam_id) continue;
      merged.set(String(a.exam_id), {
        answered: typeof a.answered_count === 'number' ? a.answered_count : 0,
        updatedAtMs: a.updated_at_ms ?? null,
      });
    }
    for (const d of localDrafts) {
      const prev = merged.get(d.examKey);
      merged.set(d.examKey, {
        answered: d.answered || prev?.answered || 0,
        updatedAtMs: d.updatedAtMs ?? prev?.updatedAtMs ?? null,
      });
    }

    return [...merged.entries()]
      .map(([examKey, d]) => {
        const meta = describe(examKey);
        return meta ? { ...meta, answered: d.answered, updatedAtMs: d.updatedAtMs } : null;
      })
      .filter(Boolean) as any[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, byKey, localDrafts, remoteAttempts, ht]);

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

  const leadTone = (pct: number | null) =>
    pct == null ? 'well' : pct >= 60 ? 'mint' : pct >= 40 ? 'amber' : 'rose';

  const [sortBy, setSortBy] = useState<'recent' | 'best'>('recent');
  const sorted = useMemo(
    () => (sortBy === 'best'
      ? [...rows].sort((a: any, b: any) => (b.percentage ?? -1) - (a.percentage ?? -1))
      : rows),
    [rows, sortBy],
  );
  const latest = rows[0];
  const dueCount = dueIds.length;
  const hasAnything = drafts.length > 0 || rows.length > 0;

  /** French plural mark; Kreyòl nouns do not take one. */
  const frS = (n: number) => (n > 1 ? 's' : '');

  return (
    <div className="xp">
      <div className="xp-page xp-page--narrow">
        <header className="xp-head">
          <div>
            <nav className="xp-crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
              <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
              <span aria-hidden>›</span>
              <span aria-current="page">{L('Mes résultats', 'Rezilta mwen')}</span>
            </nav>
            <h1 className="xp-title">{L('Mes résultats', 'Rezilta mwen')}</h1>
            <p className="xp-lede">
              {rows.length > 0
                ? <>
                    {L(`${rows.length} examen${frS(rows.length)} corrigé${frS(rows.length)}`, `${rows.length} egzamen korije`)}
                    {latest?.submittedAtMs ? ` · ${L('dernière correction le', 'dènye koreksyon an')} ${formatDate(latest.submittedAtMs)}` : ''}
                  </>
                : L('Tes épreuves commencées et corrigées.', 'Egzamen ou kòmanse ak sa ki korije yo.')}
            </p>
          </div>
        </header>

        {/* 1. Unfinished first — the most actionable thing on the page, and
            where the page's one solid button lives. */}
        {drafts.length > 0 && (
          <section className="xp-section" aria-labelledby="xp-h-resume">
            <div className="xp-section__head">
              <h2 id="xp-h-resume" className="xp-h2">{L('En cours', 'Ap fèt')}</h2>
              {/* Names the sources the visitor actually has. */}
              <span className="xp-meta">
                {isAuthenticated
                  ? L('Enregistrés sur ton compte et cet appareil', 'Anrejistre sou kont ou ak aparèy sa a')
                  : L('Enregistrés sur cet appareil seulement', 'Anrejistre sou aparèy sa a sèlman')}
              </span>
            </div>
            <ul className="xp-rows">
              {drafts.map((d, i) => {
                const date = formatDate(d.updatedAtMs);
                return (
                  <li key={d.examKey}>
                    <div className="xp-row">
                      <span className="xp-row__body">
                        <span className="xp-row__title">{d.title}</span>
                        <span className="xp-row__meta">
                          {[
                            d.subject,
                            d.year,
                            d.answered > 0
                              ? L(`${d.answered} réponse${frS(d.answered)} enregistrée${frS(d.answered)}`, `${d.answered} repons anrejistre`)
                              : L('aucune réponse encore', 'poko gen repons'),
                            date,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="xp-row__end">
                        <Link
                          className={`xp-btn xp-btn--sm${i === 0 ? '' : ' xp-btn--tonal'}`}
                          // Straight back into the draft, like every other Reprendre.
                          to={`/exams/${d.slug}/${d.examKey}/take`}
                          state={{ autostart: true, resume: true }}
                          aria-label={L(`Reprendre : ${d.title}`, `Kontinye : ${d.title}`)}
                          style={{ display: 'inline-flex' }}
                        >
                          {L('Reprendre', 'Kontinye')}
                        </Link>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 2. Corrected exams, each led by its score. */}
        <section className="xp-section" aria-labelledby="xp-h-graded">
          <div className="xp-section__head">
            <h2 id="xp-h-graded" className="xp-h2">{L('Corrigés', 'Korije')}</h2>
            {rows.length > 1 && (
              <div className="xp-seg" role="group" aria-label={L('Trier', 'Klase')} style={{ width: 'auto' }}>
                <button type="button" aria-pressed={sortBy === 'recent'} onClick={() => setSortBy('recent')}>{L('Récents', 'Resan')}</button>
                <button type="button" aria-pressed={sortBy === 'best'} onClick={() => setSortBy('best')}>{L('Meilleurs', 'Pi bon')}</button>
              </div>
            )}
          </div>

          {isPending ? (
            <LoadingState className="xp-skel" label={L('Chargement de tes résultats…', 'N ap chaje rezilta ou yo…')}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={84} radius={18} />)}
            </LoadingState>
          ) : isError ? (
            /* Every row joins a stored result to the catalog index. When the
               index cannot be fetched, say so — never "aucun résultat". */
            <ErrorState
              title={L('Liste des examens indisponible', 'Lis egzamen yo pa disponib')}
              message={L('Tes résultats sont enregistrés, mais la liste des examens n’a pas pu être chargée, souvent une connexion coupée. Réessaie.',
                'Rezilta ou yo anrejistre, men lis egzamen yo pa t ka chaje, anpil fwa se koneksyon an. Eseye ankò.')}
              offlineMessage={L('Tes résultats sont enregistrés. La liste des examens reviendra dès que tu seras reconnecté.',
                'Rezilta ou yo anrejistre. Lis egzamen yo ap tounen lè ou rekonekte.')}
              onRetry={() => { void refetch(); }}
              retryLabel={L('Réessayer', 'Eseye ankò')}
              action={{ label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams') }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={L('Aucun résultat pour le moment', 'Poko gen rezilta')}
              message={isAuthenticated
                ? L('Passe ton premier examen blanc : sa correction détaillée apparaîtra ici.', 'Fè premye egzamen blan ou : koreksyon detaye a ap parèt isit la.')
                : L('Tes résultats restent sur cet appareil tant que tu n’es pas connecté. Connecte-toi pour les retrouver partout.',
                  'Rezilta ou yo rete sou aparèy sa a toutotan ou pa konekte. Konekte pou jwenn yo tout kote.')}
              action={isAuthenticated || drafts.length > 0
                ? { label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams'), variant: drafts.length > 0 ? 'secondary' : 'primary' }
                : { label: L('Se connecter', 'Konekte'), onClick: () => toggleAuthModal() }}
              secondaryAction={isAuthenticated || drafts.length > 0
                ? undefined
                : { label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams') }}
            />
          ) : (
            <ul className="xp-rows">
              {sorted.map((r: any) => {
                const date = formatDate(r.submittedAtMs);
                const meta = [r.levelLabel, date].filter(Boolean).join(' · ');
                return (
                  <li key={r.examKey}>
                    <Link
                      className="xp-row"
                      to={`/exams/${r.slug}/${r.examKey}/results`}
                      aria-label={[r.title, meta, r.percentage != null ? L(`score ${r.percentage} %`, `nòt ${r.percentage} %`) : ''].filter(Boolean).join(' — ')}
                    >
                      {/* The score of the correction this row opens — never
                          called "best": only one correction per exam exists. */}
                      <span className={`xp-row__lead xp-row__lead--inline xp-row__lead--${leadTone(r.percentage)}`} aria-hidden="true">
                        {r.percentage != null ? <>{r.percentage}<small>%</small></> : '—'}
                      </span>
                      <span className="xp-row__body">
                        <span className="xp-row__title">{r.title}</span>
                        <span className="xp-row__meta">{meta}</span>
                      </span>
                      <span className="xp-row__end">
                        <span className="xp-btn xp-btn--tonal xp-btn--sm" aria-hidden="true">{L('Voir la correction', 'Wè koreksyon an')}</span>
                        <ChevronRight size={18} className="xp-row__chev" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. Next action — the same loop ExamResults closes on. dueCount is
            quiz-bank questions missed in EXERCISES, and the copy says so. */}
        {rows.length > 0 && (
          <section className="xp-note" aria-labelledby="xp-h-next">
            <div>
              <strong id="xp-h-next">{L('Et maintenant ?', 'E kounye a ?')}</strong>
              <span>
                {dueCount > 0
                  ? L(`${dueCount} question${frS(dueCount)} ratée${frS(dueCount)} dans tes exercices attend${dueCount > 1 ? 'ent' : ''} d’être revue${frS(dueCount)}.`,
                    `${dueCount} kesyon ou rate nan egzèsis yo ap tann pou w revize yo.`)
                  : L('Passe un nouvel examen blanc, ou retravaille une correction déjà ouverte.', 'Fè yon lòt egzamen blan, oswa retounen sou yon koreksyon ou deja louvri.')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '0 0 auto' }}>
              {dueCount > 0 && (
                <Link className="xp-btn xp-btn--tonal xp-btn--sm" to="/revision">
                  <Target size={15} aria-hidden /> {L('Revoir mes erreurs', 'Revize erè mwen')} ({dueCount})
                </Link>
              )}
              <Link className="xp-btn xp-btn--tonal xp-btn--sm" to="/exams">{L('Choisir un examen', 'Chwazi yon egzamen')}</Link>
            </div>
          </section>
        )}

        {!isAuthenticated && hasAnything && (
          <p className="xp-meta">
            {L('Ces résultats sont enregistrés sur cet appareil uniquement.', 'Rezilta sa yo anrejistre sou aparèy sa a sèlman.')}{' '}
            <button type="button" className="xp-link" onClick={() => toggleAuthModal()}>
              {L('Se connecter pour les retrouver partout', 'Konekte pou jwenn yo tout kote')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
