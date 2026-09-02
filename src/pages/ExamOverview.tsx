import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Clock, FileText, Layers, Award, CheckCircle2, Eye,
  PlayCircle, RotateCcw, History,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { fetchSingleExam, normalizeExamCatalog, resolveExamFromCatalog } from '../utils/examCatalog';
import { subjectColor, QUESTION_TYPE_META } from '../utils/examUtils';
import { TRACK_BY_CODE } from '../config/trackConfig';
import { loadExamAttemptDraft } from '../services/examAttempts';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import InstructionRenderer from '../components/InstructionRenderer';
import './ExamOverview.css';

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

  const { data: catalog, isPending: catalogLoading } = useExamCatalog();

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

  const title = exam?._title || exam?.exam_title || L('Examen', 'Egzamen');
  const color = exam ? subjectColor(exam._subject) : 'var(--primary-500)';

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

  // ── Loading / not found ────────────────────────────────────────────────────
  if (catalogLoading) {
    return (
      <div className="section exam-overview-page">
        <div className="container exam-overview__container" aria-busy="true">
          <Skeleton width={180} height={16} radius={999} style={{ marginBottom: '1.25rem' }} />
          <Skeleton width="65%" height={34} style={{ marginBottom: '1rem' }} />
          <div className="skeleton-row" style={{ gap: '0.6rem', marginBottom: '1.5rem' }}>
            <Skeleton width={90} height={26} radius={999} />
            <Skeleton width={70} height={26} radius={999} />
          </div>
          <SkeletonText lines={4} lastWidth="60%" />
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="section">
        <div className="container exam-overview__container">
          <div className="card card--message">
            <h1 className="section__title">{L('Examen introuvable', 'Nou pa jwenn egzamen an')}</h1>
            <p className="text-muted">{L('Cet examen n’existe pas ou n’est plus disponible.', 'Egzamen sa a pa egziste oswa li pa disponib ankò.')}</p>
            <button className="button button--primary" onClick={() => navigate(`/exams/${slug}`)}>
              {L('Voir les examens', 'Gade egzamen yo')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const diff = DIFFICULTY_META[exam.difficulty as number] || null;
  const duration = exam.duration_minutes || 0;
  const points = exam.total_points || 0;
  const qCount = exam._questionCount || 0;
  const autoGradable = exam._autoGradable || 0;
  const typeEntries = Object.entries(exam._typeCounts || {}).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));
  const tracks = (exam.tracks || []).filter((tr: string) => tr && tr !== 'ALL');
  const topics = (Array.isArray(exam.topics) ? exam.topics : [])
    .filter((tp: unknown): tp is string => typeof tp === 'string' && tp.length > 2 && tp.length < 80)
    .slice(0, 8);

  const pct = attempt?.percentage ?? null;
  const tone = pct == null ? '' : pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'low';
  const attemptDate = attempt?.submittedAtMs
    ? new Date(attempt.submittedAtMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const primaryLabel = resumable
    ? L('Reprendre l’examen', 'Kontinye egzamen an')
    : attempt
      ? L('Refaire l’examen', 'Refè egzamen an')
      : L('Commencer l’examen', 'Kòmanse egzamen an');
  const PrimaryIcon = resumable ? PlayCircle : attempt ? RotateCcw : ArrowRight;

  return (
    <div className="section exam-overview-page" style={{ '--exam-accent': color } as React.CSSProperties}>
      <div className="container exam-overview__container">
        <nav className="exam-overview__crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <Link to={`/exams/${slug}`}>{levelLabel}</Link>
        </nav>

        <header className="exam-overview__head">
          <div className="exam-overview__badges">
            <span className="exam-overview__subject" style={{ background: `${color}1f`, color }}>
              {exam._subject || exam.subject}
            </span>
            {diff && <span className={`exam-overview__tag exam-overview__tag--${diff.tier}`}>{ht ? diff.ht : diff.fr}</span>}
            {exam.language && <span className="exam-overview__tag">{LANG_LABEL[exam.language] || String(exam.language).toUpperCase()}</span>}
          </div>
          <h1 className="exam-overview__title">{title}</h1>

          {attempt && (
            <Link className={`exam-overview__attempt exam-overview__attempt--${tone}`} to={`/exams/${slug}/${examKey}/results`}>
              <CheckCircle2 size={15} aria-hidden />
              <span>
                {pct != null ? L(`Meilleur score : ${pct}%`, `Pi bon nòt : ${pct}%`) : L('Déjà tenté', 'Deja eseye')}
                {attemptDate ? ` · ${attemptDate}` : ''}
              </span>
              <span className="exam-overview__attempt-link">{L('Revoir mes résultats', 'Gade rezilta m')} →</span>
            </Link>
          )}

          {resumable && (
            <p className="exam-overview__resume-note">
              <History size={14} aria-hidden />
              {L(
                `Examen en cours — ${answeredCount} réponse${answeredCount > 1 ? 's' : ''} enregistrée${answeredCount > 1 ? 's' : ''}.`,
                `Egzamen an kòmanse deja — ${answeredCount} repons anrejistre.`,
              )}
            </p>
          )}
        </header>

        <div className="exam-overview__layout">
          <div className="exam-overview__main">
            {/* Stat tiles */}
            <div className="exam-overview__stats">
              <div className="exam-overview__stat">
                <FileText size={16} aria-hidden />
                <strong>{qCount}</strong>
                <span>{L('questions', 'kesyon')}</span>
              </div>
              {duration > 0 && (
                <div className="exam-overview__stat">
                  <Clock size={16} aria-hidden />
                  <strong>{duration}</strong>
                  <span>{L('minutes', 'minit')}</span>
                </div>
              )}
              {points > 0 && (
                <div className="exam-overview__stat">
                  <Award size={16} aria-hidden />
                  <strong>{points}</strong>
                  <span>{L('points', 'pwen')}</span>
                </div>
              )}
              <div className="exam-overview__stat">
                <Layers size={16} aria-hidden />
                <strong>{sectionRows.length || (fullLoading ? '…' : '—')}</strong>
                <span>{L('sections', 'seksyon')}</span>
              </div>
            </div>

            {autoGradable > 0 && (
              <p className="exam-overview__autograde">
                <CheckCircle2 size={14} aria-hidden />
                {ht
                  ? `${autoGradable} kesyon korije otomatikman`
                  : `${autoGradable} question${autoGradable !== 1 ? 's' : ''} corrigée${autoGradable !== 1  ? 's' : ''} automatiquement`}
              </p>
            )}

            {/* Structure */}
            <section className="exam-overview__block">
              <h2>{L('Structure de l’épreuve', 'Estrikti egzamen an')}</h2>
              {fullLoading ? (
                <SkeletonText lines={3} lastWidth="55%" />
              ) : sectionRows.length > 0 ? (
                <ol className="exam-overview__sections">
                  {sectionRows.map((sec, i) => (
                    <li key={i}>
                      <span className="exam-overview__section-dot" style={{ background: color }} aria-hidden />
                      <span className="exam-overview__section-name">{sec.title}</span>
                      <span className="exam-overview__section-qty">{sec.count} {L('q.', 'k.')}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted">{L('Structure indisponible.', 'Estrikti pa disponib.')}</p>
              )}
            </section>

            {/* Topics */}
            {topics.length > 0 && (
              <section className="exam-overview__block">
                <h2>{L('Sujets couverts', 'Sijè yo kouvri')}</h2>
                <div className="exam-overview__chips">
                  {topics.map((tp: string) => (
                    <span key={tp} className="exam-overview__chip">{tp}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Question types */}
            {typeEntries.length > 0 && (
              <section className="exam-overview__block">
                <h2>{L('Types de questions', 'Kalite kesyon')}</h2>
                <div className="exam-overview__chips">
                  {typeEntries.map(([type, count]) => {
                    const meta = (QUESTION_TYPE_META as Record<string, any>)[type] || (QUESTION_TYPE_META as any).unknown;
                    return (
                      <span key={type} className="exam-overview__chip">
                        {meta.label} <strong>{String(count)}</strong>
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Filières */}
            {tracks.length > 0 && (
              <section className="exam-overview__block">
                <h2>{L('Filières concernées', 'Filyè konsène')}</h2>
                <div className="exam-overview__chips">
                  {tracks.map((tr: string) => (
                    <span key={tr} className="exam-overview__chip exam-overview__chip--track">
                      {TRACK_BY_CODE[tr]?.shortLabel || tr}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Sample question */}
            {sample && (
              <section className="exam-overview__block">
                <h2>{L('Aperçu d’une question', 'Apèsi yon kesyon')}</h2>
                <div className="exam-overview__sample">
                  <InstructionRenderer text={sample.question} inline={false} />
                  <div className="exam-overview__sample-fade" aria-hidden />
                </div>
                <p className="exam-overview__sample-note">
                  {ht ? `Kòmanse egzamen an pou wè tout ${qCount} kesyon yo.` : `Commencez l'examen pour voir les ${qCount} questions.`}
                </p>
              </section>
            )}
          </div>

          {/* Action rail */}
          <aside className="exam-overview__rail">
            <div className="exam-overview__cta-card">
              <button
                type="button"
                className="button button--primary exam-overview__cta"
                style={{ background: color }}
                onClick={() => goTake(true)}
              >
                <PrimaryIcon size={18} aria-hidden />
                {primaryLabel}
              </button>
              {duration > 0 && (
                <p className="exam-overview__cta-hint">
                  {L(`Prévoyez ${duration} minutes dans les conditions de l'examen.`, `Prevwa ${duration} minit nan kondisyon egzamen an.`)}
                </p>
              )}
              <button type="button" className="button button--ghost exam-overview__cta-secondary" onClick={() => goTake(false)}>
                <Eye size={16} aria-hidden /> {L('Lire l’épreuve d’abord', 'Li egzamen an anvan')}
              </button>
              {attempt && (
                <Link className="button button--ghost exam-overview__cta-secondary" to={`/exams/${slug}/${examKey}/results`}>
                  <History size={16} aria-hidden /> {L('Revoir mes résultats', 'Gade rezilta m')}
                </Link>
              )}
            </div>
            <button type="button" className="exam-overview__back-link" onClick={() => navigate(`/exams/${slug}`)}>
              <ArrowLeft size={15} aria-hidden /> {L('Tous les examens', 'Tout egzamen yo')} {levelLabel}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
