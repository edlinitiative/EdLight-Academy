import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, subjectColor } from '../utils/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { URL_LEVEL_TO_RAW, LEVEL_SLUG_LABELS } from '../utils/examLevels';
import CardCover from '../components/CardCover';
import { SUBJECT_GLYPHS } from '../utils/subjectGlyphs';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/StateViews';
import './ExamOverview.css'; // shared .exam-overview__crumbs
import './ExamSubject.css';

/**
 * ExamSubject — /exams/:level/matiere/:subject
 *
 * One subject's exam bank as a clean, Coursera-style session list. The
 * browse grid sells the SUBJECT (one card each); this page is where the
 * years live — chronological rows with human names ("Session de juillet
 * 2025", not the records-office title), difficulty, and the student's
 * own status per paper. Rows open the exam overview page.
 */

const DIFFICULTY_DOT: Record<number, { fr: string; ht: string; cls: string }> = {
  1: { fr: 'Facile', ht: 'Fasil', cls: 'easy' },
  2: { fr: 'Facile', ht: 'Fasil', cls: 'easy' },
  3: { fr: 'Moyen', ht: 'Mwayen', cls: 'medium' },
  4: { fr: 'Difficile', ht: 'Difisil', cls: 'hard' },
  5: { fr: 'Difficile', ht: 'Difisil', cls: 'hard' },
};

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

export default function ExamSubject() {
  const { level, subject: subjectParam } = useParams();
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const subject = decodeURIComponent(subjectParam || '');
  const { data: allExams, isPending } = useExamCatalog();
  const attempts = useExamAttempts();
  const [statusFilter, setStatusFilter] = useState<'' | 'todo' | 'done'>('');

  const exams = useMemo(() => {
    if (!allExams) return [];
    const rawLevel = URL_LEVEL_TO_RAW[level || ''] || level;
    return buildExamIndex(allExams).exams
      .filter((e: any) => e._level === rawLevel || e.level === rawLevel)
      .filter((e: any) => (e._subject || e.subject) === subject)
      .sort((a: any, b: any) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  }, [allExams, level, subject]);

  const keyOf = (e: any) => String(e.exam_id ?? e._idx);
  const doneCount = exams.filter((e) => attempts[keyOf(e)]).length;
  const best = exams.reduce((mx, e) => {
    const p = attempts[keyOf(e)]?.percentage;
    return typeof p === 'number' && p > mx ? p : mx;
  }, -1);

  const visible = exams.filter((e) => {
    if (!statusFilter) return true;
    const done = !!attempts[keyOf(e)];
    return statusFilter === 'done' ? done : !done;
  });

  const color = subjectColor(subject);
  const glyph = SUBJECT_GLYPHS[subject] || 'book';
  const levelLabel = LEVEL_SLUG_LABELS[level || '']?.[ht ? 'ht' : 'fr'] || level;

  if (isPending) {
    return (
      <section className="section exam-subject">
        <div className="container exam-subject__container" aria-busy="true">
          <Skeleton width={220} height={16} radius={999} style={{ marginBottom: '1.2rem' }} />
          <Skeleton width="100%" height={120} radius={20} style={{ marginBottom: '1.5rem' }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={64} radius={14} style={{ marginBottom: '0.7rem' }} />
          ))}
        </div>
      </section>
    );
  }

  if (exams.length === 0) {
    return (
      <section className="section exam-subject">
        <div className="container exam-subject__container">
          <EmptyState
            title={L('Aucune épreuve pour cette matière', 'Pa gen egzamen pou matyè sa a')}
            message={L('Le catalogue évolue régulièrement — revenez bientôt.', 'Katalòg la ap grandi souvan — tounen talè.')}
            action={{ label: L('Toutes les matières', 'Tout matyè yo'), onClick: () => navigate(`/exams/${level}`) }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="section exam-subject" style={{ '--exam-accent': color } as React.CSSProperties}>
      <div className="container exam-subject__container">
        <nav className="exam-overview__crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <Link to={`/exams/${level}`}>{levelLabel}</Link>
          <span aria-hidden>›</span>
          <span>{subject}</span>
        </nav>

        {/* Subject hero */}
        <header className="exam-subject__hero">
          <CardCover className="exam-subject__cover" glyph={glyph} color={color} />
          <div className="exam-subject__hero-body">
            <h1 className="exam-subject__title">{subject}</h1>
            <p className="exam-subject__meta">
              {levelLabel} · {exams.length} {exams.length === 1 ? L('épreuve officielle', 'egzamen ofisyèl') : L('épreuves officielles', 'egzamen ofisyèl')}
              {yearRange(exams) ? ` · ${yearRange(exams)}` : ''}
            </p>
            {doneCount > 0 && (
              <p className="exam-subject__progress">
                <CheckCircle2 size={15} aria-hidden />
                {doneCount}/{exams.length} {L('terminées', 'fini')}
                {best >= 0 ? ` · ${L('meilleur score', 'pi bon nòt')} ${best}%` : ''}
              </p>
            )}
          </div>
        </header>

        {/* Status filter */}
        <div className="exam-subject__filters" role="group" aria-label={L('Filtrer par statut', 'Filtre dapre eta')}>
          {([
            ['', L('Toutes', 'Tout')],
            ['todo', L('À faire', 'Pou fè')],
            ['done', L('Terminées', 'Fini')],
          ] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              className={`exam-subject__chip${statusFilter === value ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(value as any)}
              aria-pressed={statusFilter === value}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Session list */}
        <ol className="exam-subject__list">
          {visible.map((e: any) => {
            const key = keyOf(e);
            const name = sessionRowName(e, ht ? 'ht' : 'fr');
            const attempt = attempts[key];
            const pct = attempt?.percentage ?? null;
            const tone = pct == null ? '' : pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'low';
            const diff = DIFFICULTY_DOT[e.difficulty as number];
            return (
              <li key={key}>
                <Link className="exam-session" to={`/exams/${level}/${key}`}>
                  <span className="exam-session__year" aria-hidden>{e.year || '—'}</span>
                  <span className="exam-session__body">
                    <span className="exam-session__title">{name.title}</span>
                    <span className="exam-session__meta">
                      {[
                        name.subtitle,
                        e._questionCount ? `${e._questionCount} ${L('questions', 'kesyon')}` : '',
                        e.duration_minutes ? `${e.duration_minutes} min` : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {diff && (
                    <span className={`exam-session__diff exam-session__diff--${diff.cls}`}>
                      {ht ? diff.ht : diff.fr}
                    </span>
                  )}
                  {attempt ? (
                    <span className={`exam-session__score exam-session__score--${tone}`}>
                      {pct != null ? `${pct}%` : '✓'}
                    </span>
                  ) : (
                    <span className="exam-session__todo">{L('À faire', 'Pou fè')}</span>
                  )}
                  <ChevronRight size={17} className="exam-session__chevron" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>

        {visible.length === 0 && (
          <p className="text-muted exam-subject__none">
            {statusFilter === 'done'
              ? L('Aucune épreuve terminée pour le moment.', 'Poko gen egzamen fini.')
              : L('Tout est terminé — bravo !', 'Tout bagay fini — bravo !')}
          </p>
        )}
      </div>
    </section>
  );
}
