import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, ChevronRight, CheckCircle2, Eye, PlayCircle, RotateCcw, Save, LogIn,
} from '../components/icons';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { fetchSingleExam, normalizeExamCatalog, resolveExamFromCatalog } from '../utils/examCatalog';
import { QUESTION_TYPE_META, examDisplayTitle } from '../utils/examUtils';
import { durationLabel } from './examHubParts';
import { TRACK_BY_CODE } from '../config/trackConfig';
import { loadExamAttemptDraft } from '../services/examAttempts';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import InstructionRenderer from '../components/InstructionRenderer';
import './examPremium.css';

/**
 * ExamOverview — /exams/:level/:examId
 *
 * The Coursera-style landing page for one exam: what it is, how it's
 * structured, how you did last time, and ONE clear next action. Taking the
 * exam lives on the /take subpage; every historical deep link (Sandra
 * recommendations, study-plan tasks, search) lands here and gains context
 * instead of being dropped into the paper.
 */

const DIFFICULTY_META: Record<number, { fr: string; ht: string; tier: string }> = {
  1: { fr: 'Facile', ht: 'Fasil', tier: 'easy' },
  2: { fr: 'Facile', ht: 'Fasil', tier: 'easy' },
  3: { fr: 'Moyen', ht: 'Mwayen', tier: 'medium' },
  4: { fr: 'Difficile', ht: 'Difisil', tier: 'hard' },
  5: { fr: 'Difficile', ht: 'Difisil', tier: 'hard' },
};

const LANG_LABEL: Record<string, string> = { fr: 'Français', ht: 'Kreyòl', en: 'English', es: 'Español' };

function useExamCatalog() {
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

/** Local draft sniff (synchronous mirror written by ExamTake). */
function readLocalDraft(examId: string): any | null {
  try {
    const raw = localStorage.getItem(`edlight-exam-draft-${examId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const draftHasProgress = (d: any): boolean =>
  !!d && ((d.answers && Object.keys(d.answers).length > 0) || (d.currentQ ?? 0) > 0);

export default function ExamOverview() {
  const { level: levelParam, examId: examIdParam } = useParams();
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const userId = useStore((s) => s.user?.uid);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const { data: catalog, isPending: catalogLoading, isError: catalogError, refetch: refetchCatalog } = useExamCatalog();

  const resolved = useMemo(
    () => (catalog ? resolveExamFromCatalog(catalog, examIdParam) : null),
    [catalog, examIdParam],
  );
  const exam = resolved?.exam || null;
  const examKey = resolved?.examId != null ? String(resolved.examId) : String(examIdParam || '');
  const slug = levelToSlug(levelParam || exam?.level);
  const levelLabel = LEVEL_SLUG_LABELS[slug]?.[ht ? 'ht' : 'fr'] || slug;

  // Full exam file (sections + sample question). Same query key ExamTake
  // uses, so pressing "Commencer" opens instantly.
  const { data: full, isPending: fullLoading } = useQuery({
    queryKey: ['exam', examKey],
    queryFn: () => fetchSingleExam(examKey),
    enabled: !!examKey && !!exam,
    staleTime: 60 * 60 * 1000,
  });

  // Best score (Firestore + sessionStorage, best-of).
  const attempts = useExamAttempts();
  const attempt = attempts[examKey];

  // Resume state: synchronous local mirror first, then the Firestore draft.
  const [draft, setDraft] = useState<any | null>(() => readLocalDraft(examKey));
  useEffect(() => {
    setDraft(readLocalDraft(examKey));
    if (!userId || !examKey) return;
    let alive = true;
    loadExamAttemptDraft(userId, examKey).then((remote: any) => {
      if (!alive || !remote || remote.status === 'submitted') return;
      setDraft((local: any) => {
        const localMs = local?.updated_at_ms ?? 0;
        const remoteMs = remote?.updated_at_ms ?? 0;
        return remoteMs > localMs ? remote : local;
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId, examKey]);

  const resumable = draftHasProgress(draft);
  const answeredCount = draft?.answers ? Object.keys(draft.answers).length : 0;

  // NOT exam._title: the single-exam fetch path ships the raw document, so
  // _title is absent here and the fallback was the ministry letterhead.
  const title = examDisplayTitle(exam, L('Examen', 'Egzamen'));

  const sections = full?.sections || [];
  const sectionRows = sections.map((s: any, i: number) => ({
    title: s.section_title || `Section ${i + 1}`,
    count: (s.questions || []).length,
  }));

  const sample = useMemo(() => {
    for (const s of sections) {
      for (const q of s.questions || []) {
        if (q && q.question) return q;
      }
    }
    return null;
  }, [sections]);

  const goTake = (autostart: boolean) =>
    navigate(`/exams/${slug}/${examKey}/take`, autostart ? { state: { autostart: true } } : undefined);

  const frame = (children: React.ReactNode, docked = false) => (
    <div className="xp"><div className={`xp-page${docked ? ' xp-page--docked' : ''}`}>{children}</div></div>
  );

  // ── Loading / not found ────────────────────────────────────────────────────
  if (catalogLoading) {
    return frame(
      <LoadingState className="xp-skel" label={L('Chargement de l’examen…', 'N ap chaje egzamen an…')}>
        <Skeleton width={180} height={16} radius={999} />
        <Skeleton width="65%" height={40} radius={12} />
        <div className="xp-facts">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={96} radius={18} />)}
        </div>
        <SkeletonText lines={4} lastWidth="60%" />
      </LoadingState>,
    );
  }

  // A failed catalog fetch is NOT "introuvable" — say which one it is, and
  // offer the matching recovery (§8: plain-language error + safe action).
  if (catalogError) {
    return frame(
      <ErrorState
        page
        headingLevel={1}
        title={L('Catalogue indisponible', 'Katalòg la pa disponib')}
        message={L('Nous n’avons pas pu charger cet examen. Vérifie ta connexion, puis réessaie.', 'Nou pa t ka chaje egzamen an. Tcheke koneksyon ou, epi eseye ankò.')}
        offlineTitle={L('Hors ligne', 'Pa sou entènèt')}
        offlineMessage={L('Cet examen n’est pas encore enregistré sur cet appareil. Reconnecte-toi pour l’ouvrir.', 'Egzamen sa a poko anrejistre sou aparèy sa a. Rekonekte pou louvri l.')}
        onRetry={() => { void refetchCatalog(); }}
        retryLabel={L('Réessayer', 'Eseye ankò')}
        action={{ label: L('Voir les examens', 'Gade egzamen yo'), onClick: () => navigate(`/exams/${slug}`) }}
      />,
    );
  }

  if (!exam) {
    return frame(
      <EmptyState
        page
        headingLevel={1}
        title={L('Examen introuvable', 'Nou pa jwenn egzamen an')}
        message={L('Cet examen n’existe pas ou n’est plus disponible.', 'Egzamen sa a pa egziste oswa li pa disponib ankò.')}
        action={{ label: L('Voir les examens', 'Gade egzamen yo'), onClick: () => navigate(`/exams/${slug}`) }}
      />,
    );
  }

  const subjectName: string = exam._subject || exam.subject || '';
  const diff = DIFFICULTY_META[exam.difficulty as number] || null;
  const duration = exam.duration_minutes || 0;
  const points = exam.total_points || 0;
  const qCount = exam._questionCount || 0;
  const autoGradable = exam._autoGradable || 0;
  const typeEntries = Object.entries(exam._typeCounts || {}).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));
  const tracks = (exam.tracks || []).filter((tr: string) => tr && tr !== 'ALL');
  const topics = (Array.isArray(exam.topics) ? exam.topics : [])
    .filter((tp: unknown): tp is string => typeof tp === 'string' && tp.length > 2 && tp.length < 80)
    // Section headers ("A.- Recopier…") are instructions, not themes.
    .filter((tp: string) => !/^[A-Z0-9]{1,2}\s*[.\-–)]/.test(tp))
    .slice(0, 8);

  const pct = attempt?.percentage ?? null;
  const attemptDate = attempt?.submittedAtMs
    ? new Date(attempt.submittedAtMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const primaryLabel = resumable
    ? L('Reprendre l’examen', 'Kontinye egzamen an')
    : attempt
      ? L('Refaire l’examen', 'Refè egzamen an')
      : L('Commencer l’examen', 'Kòmanse egzamen an');
  const PrimaryIcon = resumable ? PlayCircle : attempt ? RotateCcw : ArrowRight;

  const durationText = duration > 0 ? durationLabel(duration, ht) : '';
  const metaLine = [levelLabel, subjectName, exam.year, diff ? (ht ? diff.ht : diff.fr) : '', exam.language && exam.language !== 'fr' ? (LANG_LABEL[exam.language] || String(exam.language).toUpperCase()) : '']
    .filter(Boolean).join(' · ');

  /** "PARTIE A.- Recopier…" → letter A + "Recopier…". */
  const splitSection = (title: string, i: number) => {
    const m = /^\s*(?:partie|part|pati)\s+([A-Z0-9]{1,2})\s*[.\-–:)]*\s*[-–]?\s*(.*)$/i.exec(title || '');
    if (m) return { letter: m[1].toUpperCase(), name: m[2] || title };
    return { letter: String.fromCharCode(65 + (i % 26)), name: title };
  };

  return frame(
    <>
      <div className="xp-ov">
        <div className="xp-ov__main">
          <header className="xp-head">
            <div>
              {/* The trail mirrors how the student got here (niveau → matière). */}
              <nav className="xp-crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
                <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
                <span aria-hidden>›</span>
                <Link to={`/exams/${slug}`}>{levelLabel}</Link>
                {subjectName && (
                  <>
                    <span aria-hidden>›</span>
                    <Link to={`/exams/${slug}/matiere/${encodeURIComponent(subjectName)}`}>{subjectName}</Link>
                  </>
                )}
              </nav>
              <h1 className="xp-title xp-title--md">{title}</h1>
              <p className="xp-lede">{metaLine}</p>
            </div>
          </header>

          {/* Three facts, numerals first. Only the ones the data has. */}
          <ul className="xp-facts">
            <li className="xp-fact">
              <span className="xp-fact__num">{durationText || '—'}</span>
              <span className="xp-fact__label">{duration > 0 ? L('Durée', 'Dire') : L('Sans chronomètre', 'San kwonomèt')}</span>
            </li>
            <li className="xp-fact">
              <span className="xp-fact__num">{qCount || '—'}</span>
              <span className="xp-fact__label">{L('questions', 'kesyon')}</span>
            </li>
            <li className="xp-fact">
              <span className="xp-fact__num">{points > 0 ? points : (sectionRows.length || (fullLoading ? '…' : '—'))}</span>
              <span className="xp-fact__label">{points > 0 ? L('points', 'pwen') : L('parties', 'pati')}</span>
            </li>
          </ul>

          <section className="xp-card" aria-labelledby="xp-struct">
            <h2 id="xp-struct" className="xp-card__title">{L('Structure de l’épreuve', 'Estrikti egzamen an')}</h2>
            {fullLoading ? (
              <SkeletonText lines={3} lastWidth="55%" />
            ) : sectionRows.length > 0 ? (
              <ol className="xp-struct">
                {sectionRows.map((sec, i) => {
                  const { letter, name } = splitSection(sec.title, i);
                  return (
                    <li key={i}>
                      <span className="xp-struct__disc" aria-hidden>{letter}</span>
                      <span className="xp-struct__body">
                        <strong>{name}</strong>
                        <span>{sec.count} {L(sec.count > 1 ? 'questions' : 'question', 'kesyon')}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="xp-meta">{L('Structure indisponible.', 'Estrikti pa disponib.')}</p>
            )}
          </section>

          {topics.length > 0 && (
            <section className="xp-section" aria-labelledby="xp-topics" style={{ gap: 12 }}>
              <h2 id="xp-topics" className="xp-card__title" style={{ margin: 0 }}>{L('Thèmes abordés', 'Tèm yo abòde')}</h2>
              <div className="xp-chips">
                {topics.map((tp: string) => <span key={tp} className="xp-chip xp-chip--plain">{tp}</span>)}
              </div>
            </section>
          )}

          {(typeEntries.length > 0 || tracks.length > 0) && (
            <section className="xp-section" aria-labelledby="xp-types" style={{ gap: 12 }}>
              <h2 id="xp-types" className="xp-card__title" style={{ margin: 0 }}>{L('Types de questions', 'Kalite kesyon')}</h2>
              <div className="xp-chips">
                {typeEntries.map(([type, count]) => {
                  const meta = (QUESTION_TYPE_META as Record<string, any>)[type] || (QUESTION_TYPE_META as any).unknown;
                  return <span key={type} className="xp-chip xp-chip--plain">{meta.label} <b>{String(count)}</b></span>;
                })}
                {tracks.map((tr: string) => (
                  <span key={tr} className="xp-chip xp-chip--plain">{L('Filière', 'Filyè')} {TRACK_BY_CODE[tr]?.shortLabel || tr}</span>
                ))}
              </div>
            </section>
          )}

          {sample && (
            <section className="xp-card" aria-labelledby="xp-sample">
              <h2 id="xp-sample" className="xp-card__title">{L('Aperçu d’une question', 'Apèsi yon kesyon')}</h2>
              <div className="xp-sample">
                <InstructionRenderer text={sample.question} inline={false} />
              </div>
              <p className="xp-meta" style={{ marginTop: 12 }}>
                {ht ? `Kòmanse egzamen an pou wè tout ${qCount} kesyon yo.` : `Commence l’examen pour voir les ${qCount} questions.`}
              </p>
            </section>
          )}
        </div>

        {/* Action rail: the page's one solid button. */}
        <aside className="xp-ov__rail">
          <div className="xp-card xp-rail">
            {attempt ? (
              <>
                <p className="xp-label">{L('Ta dernière correction', 'Dènye koreksyon ou')}</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {pct != null ? (
                    <p className="xp-score"><span className="xp-score__num">{pct}</span><span className="xp-score__of">%</span></p>
                  ) : (
                    <p className="xp-score"><span className="xp-score__num" style={{ fontSize: 28 }}>{L('Déjà tenté', 'Deja eseye')}</span></p>
                  )}
                  <Link className="xp-link" to={`/exams/${slug}/${examKey}/results`}>{L('Voir la correction', 'Wè koreksyon an')} <ChevronRight size={16} aria-hidden /></Link>
                </div>
                {attemptDate && <p className="xp-meta">{attemptDate}</p>}
              </>
            ) : resumable ? (
              <>
                <span className="xp-pill" style={{ alignSelf: 'flex-start' }}>{L('En cours', 'Ap fèt')}</span>
                <p className="xp-meta">
                  {L(
                    `${answeredCount} réponse${answeredCount > 1 ? 's' : ''} enregistrée${answeredCount > 1 ? 's' : ''}${qCount ? ` sur ${qCount}` : ''}.`,
                    `${answeredCount} repons anrejistre${qCount ? ` sou ${qCount}` : ''}.`,
                  )}
                </p>
                {qCount > 0 && (
                  <div className="xp-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round((answeredCount / qCount) * 100))}%` }} /></div>
                )}
              </>
            ) : null}

            <button type="button" className="xp-btn xp-btn--block xp-rail__solid" onClick={() => goTake(true)}>
              <PrimaryIcon size={18} aria-hidden />
              {primaryLabel}
            </button>
            {/* Say what the primary button will actually do. */}
            <p className="xp-rail__hint">
              {resumable
                ? L('Tu pourras reprendre où tu en étais ou recommencer.', 'Ou ka kontinye kote ou te ye a oswa rekòmanse.')
                : duration > 0
                  ? L(`Chronométré : ${durationText}, remis automatiquement à la fin.`, `Ak kwonomèt : ${durationText}, li voye otomatikman nan fen an.`)
                  : L('Sans chronomètre : prends le temps qu’il te faut.', 'San kwonomèt : pran tan ou bezwen an.')}
            </p>
            <button type="button" className="xp-btn xp-btn--tonal xp-btn--block" onClick={() => goTake(false)}>
              <Eye size={16} aria-hidden /> {L('Lire l’épreuve d’abord', 'Li egzamen an anvan')}
            </button>
          </div>

          {/* What taking this exam involves — every line read from real data:
              the timer only exists when duration_minutes > 0, and answers are
              only persisted for a signed-in student. */}
          <div className="xp-card">
            <ul className="xp-list-plain">
              <li>
                {userId ? <Save size={16} aria-hidden /> : <LogIn size={16} aria-hidden />}
                <span>
                  <strong>{userId ? L('Réponses enregistrées', 'Repons yo anrejistre') : L('Résultat non enregistré', 'Rezilta a pa anrejistre')}</strong>
                  {userId
                    ? L('Tes réponses sont sauvegardées pendant que tu travailles.', 'Repons ou yo anrejistre pandan w ap travay.')
                    : L('Connecte-toi pour garder tes réponses et retrouver ce résultat.', 'Konekte pou kenbe repons ou yo epi jwenn rezilta a.')}
                </span>
              </li>
              {autoGradable > 0 && (
                <li>
                  <CheckCircle2 size={16} aria-hidden />
                  <span>
                    <strong>{L('Correction automatique', 'Koreksyon otomatik')}</strong>
                    {ht
                      ? `${autoGradable} kesyon korije otomatikman apre ou remèt egzamen an.`
                      : `${autoGradable} question${autoGradable !== 1 ? 's' : ''} corrigée${autoGradable !== 1 ? 's' : ''} automatiquement après la remise.`}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>
      <div className="xp-dock">
        <button type="button" className="xp-btn xp-btn--block" onClick={() => goTake(true)}>
          <PrimaryIcon size={18} aria-hidden />
          {primaryLabel}
        </button>
      </div>
    </>,
    true,
  );
}
