import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { subjectColor } from '../utils/examUtils';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import { EmptyState } from '../components/StateViews';
import { Skeleton } from '../components/Skeleton';
import './ExamOverview.css'; // shared .exam-overview__crumbs
import './ExamHistory.css';

/**
 * ExamHistory — /exams/resultats ("Mes résultats")
 *
 * Every graded exam in one place, newest first: title, subject, level, date,
 * score. Rows open the full result page; the empty state routes to the
 * browser. Anonymous visitors see their session results (sessionStorage) —
 * signing in adds the cross-device history.
 */

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
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const { data: catalog, isPending } = useExamCatalogIndex();
  const attempts = useExamAttempts();

  const rows = useMemo(() => {
    if (!catalog) return [];
    const byKey = new Map<string, any>();
    for (const e of catalog) byKey.set(String(e.exam_id ?? e._idx), e);
    return Object.entries(attempts)
      .map(([examKey, info]) => {
        const exam = byKey.get(examKey);
        if (!exam) return null;
        const slug = levelToSlug(exam.level);
        return {
          examKey,
          slug,
          title: exam._title || exam.exam_title || L('Examen', 'Egzamen'),
          subject: exam._subject || exam.subject || '',
          year: exam.year || '',
          levelLabel: LEVEL_SLUG_LABELS[slug]?.[ht ? 'ht' : 'fr'] || slug,
          color: subjectColor(exam._subject),
          percentage: info.percentage,
          submittedAtMs: info.submittedAtMs,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0)) as any[];
  }, [catalog, attempts, ht]);

  return (
    <div className="section exam-history">
      <div className="container exam-history__container">
        <nav className="exam-overview__crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <span>{L('Mes résultats', 'Rezilta mwen')}</span>
        </nav>

        <div className="page-header">
          <div>
            <h1>{L('Mes résultats', 'Rezilta mwen')}</h1>
            <p className="text-muted">
              {L('Tous vos examens corrigés, du plus récent au plus ancien.', 'Tout egzamen ou fin fè yo, soti nan pi resan an.')}
            </p>
          </div>
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
                ? L('Passez votre premier examen blanc pour voir vos résultats ici.', 'Fè premye egzamen blan ou pou wè rezilta ou yo isit la.')
                : L('Connectez-vous pour retrouver vos résultats sur tous vos appareils.', 'Konekte pou jwenn rezilta ou yo sou tout aparèy ou.')
            }
            action={
              isAuthenticated
                ? { label: L('Choisir un examen', 'Chwazi yon egzamen'), onClick: () => navigate('/exams') }
                : { label: L('Se connecter', 'Konekte'), onClick: () => toggleAuthModal() }
            }
          />
        ) : (
          <div className="exam-history__list">
            {rows.map((r) => {
              const tone = r.percentage == null ? '' : r.percentage >= 60 ? 'good' : r.percentage >= 40 ? 'mid' : 'low';
              const date = r.submittedAtMs
                ? new Date(r.submittedAtMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                : null;
              return (
                <Link key={r.examKey} className="exam-history__row" to={`/exams/${r.slug}/${r.examKey}/results`}>
                  <span className="exam-history__swatch" style={{ background: r.color }} aria-hidden />
                  <span className="exam-history__body">
                    <span className="exam-history__title">{r.title}</span>
                    <span className="exam-history__meta">
                      {[r.subject, r.levelLabel, r.year, date].filter(Boolean).join(' · ')}
                    </span>
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
      </div>
    </div>
  );
}
