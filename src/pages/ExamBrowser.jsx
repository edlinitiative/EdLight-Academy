import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  subjectColor,
  examStats,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

const PAGE_SIZE = 24;

/** Fetch and cache the exam catalog */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      const data = await res.json();
      // Data is structured by level, flatten it for original filtering logic
      return Object.values(data).flat();
    },
    staleTime: Infinity, // static asset, never re-fetch
  });
}

const ExamBrowser = () => {
  const navigate = useNavigate();
  const { level } = useParams(); // Get level from URL

  const { data: allExams, isLoading, error } = useExamCatalog();

  // Filter exams by level from URL
  const rawExams = useMemo(() => {
    if (!allExams) return [];
    if (!level) return allExams; // Should not happen with new routes
    
    // Map URL level to catalog key
    const levelKey = {
      '9e': '9e Année',
      'terminale': 'Terminale',
      'university': 'Université'
    }[level];

    return allExams.filter(exam => {
        if (levelKey === '9e Année') return exam.title.includes('9e') || exam.title.includes('9AF');
        if (levelKey === 'Terminale') return exam.title.includes('Terminale') || exam.title.includes('Philo') || exam.title.includes('NS') || exam.title.includes('SVT');
        if (levelKey === 'Université') return ! (exam.title.includes('9e') || exam.title.includes('9AF') || exam.title.includes('Terminale') || exam.title.includes('Philo') || exam.title.includes('NS') || exam.title.includes('SVT'));
        return false;
    });
  }, [allExams, level]);

  // Build index once
  const index = useMemo(() => {
    if (!rawExams) return null;
    // buildExamIndex expects a flat array
    return { exams: rawExams };
  }, [rawExams]);

  // Filter state
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState(level || '');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasActiveFilters = subjectFilter || yearFilter || search.trim();

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setLevelFilter(level || '');
    setVisibleCount(PAGE_SIZE);
  }, [level]);

  // Filtered list
  const filtered = useMemo(() => {
    if (!index) return [];
    let list = index.exams;

    if (subjectFilter) list = list.filter((e) => e.subject === subjectFilter);
    if (yearFilter) list = list.filter((e) => e.year === yearFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.subject || '').toLowerCase().includes(q) ||
          (e.year || '').toLowerCase().includes(q)
      );
    }

    // Sort: newest first
    return [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
  }, [index, subjectFilter, yearFilter, search]);

  // Reset visible count when filters change
  const prevFilterKey = `${subjectFilter}|${yearFilter}|${search}`;
  const [lastFilterKey, setLastFilterKey] = useState(prevFilterKey);
  if (prevFilterKey !== lastFilterKey) {
    setLastFilterKey(prevFilterKey);
    setVisibleCount(PAGE_SIZE);
  }

  // Paginated subset
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  // Summary counts for filtered set
  const summary = useMemo(() => {
    const totalQ = filtered.reduce((s, e) => s + (e.questions?.length || 0), 0);
    const gradable = filtered.reduce((s, e) => s + (e.questions?.filter(q => q.auto_gradable).length || 0), 0);
    return { exams: filtered.length, totalQ, gradable };
  }, [filtered]);

  // Unique subjects and years for filters
  const { subjects, years } = useMemo(() => {
    if (!rawExams) return { subjects: [], years: [] };
    const subjectSet = new Set();
    const yearSet = new Set();
    rawExams.forEach(exam => {
      if (exam.subject) subjectSet.add(exam.subject);
      if (exam.year) yearSet.add(exam.year);
    });
    return {
      subjects: Array.from(subjectSet).sort(),
      years: Array.from(yearSet).sort((a, b) => b - a)
    };
  }, [rawExams]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <section className="section">
        <div className="container">
          <div className="page-header">
            <h1 className="page-header__title">Examens</h1>
            <p className="page-header__subtitle">Chargement du catalogue…</p>
          </div>
          <div className="card card--centered card--loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <div className="page-header">
            <h1 className="page-header__title">Examens</h1>
          </div>
          <div className="card card--message">
            <p>Erreur: {error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        {/* Header */}
        <div className="page-header exam-browser__header">
          <span className="page-header__eyebrow">Examens</span>
          <h1 className="page-header__title">Examens Nationaux</h1>
          <p className="page-header__subtitle">
            Banque d'examens officiels du MENFP — Baccalauréat, 9ème AF, Concours universitaires
          </p>
        </div>

        {/* Sticky filter bar */}
        <div className="exam-browser__filters-sticky">
          <div className="exam-browser__filters">
            {/* Level */}
            <select
              className="exam-browser__select"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              aria-label="Filtrer par niveau"
            >
              <option value="">Tous les niveaux</option>
              {index.levels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* Subject */}
            <select
              className="exam-browser__select"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Filtrer par matière"
            >
              <option value="">Toutes les matières</option>
              {index.subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Year */}
            <select
              className="exam-browser__select"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              aria-label="Filtrer par année"
            >
              <option value="">Toutes les années</option>
              {index.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {/* Search */}
            <div className="exam-browser__search-wrap">
              <svg className="exam-browser__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="exam-browser__search"
                type="text"
                placeholder="Rechercher un examen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher un examen"
              />
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                className="exam-browser__clear-btn"
                onClick={clearFilters}
                type="button"
              >
                ✕ Réinitialiser
              </button>
            )}
          </div>

          {/* Summary */}
          <div className="exam-browser__summary">
            <strong>{summary.exams}</strong> examens
            {' • '}
            <strong>{summary.totalQ.toLocaleString()}</strong> questions
            {summary.gradable > 0 && (
              <>
                {' • '}
                <strong>{summary.gradable.toLocaleString()}</strong> auto-corrigées
              </>
            )}
          </div>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="card card--message exam-browser__empty">
            <p>Aucun examen trouvé. Essayez de modifier vos filtres.</p>
            {hasActiveFilters && (
              <button
                className="button button--ghost"
                onClick={clearFilters}
                type="button"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid--exams exam-browser__grid">
              {visible.map((exam) => (
                <ExamCard
                  key={exam._idx}
                  exam={exam}
                  onClick={() => navigate(`/exams/${exam._idx}`)}
                />
              ))}
            </div>

            {/* Pagination */}
            {hasMore && (
              <div className="exam-browser__load-more">
                <button
                  className="exam-browser__load-btn"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  type="button"
                >
                  Afficher plus d'examens ({filtered.length - visibleCount} restants)
                </button>
              </div>
            )}
            <p className="exam-browser__showing">
              {Math.min(visibleCount, filtered.length)} sur {filtered.length} examens affichés
            </p>
          </>
        )}
      </div>
    </section>
  );
};

// ── Exam Card Component ──────────────────────────────────────────────────────

function ExamCard({ exam, onClick }) {
  const color = subjectColor(exam._subject);
  const stats = {
    total: exam._questionCount,
    gradable: exam._autoGradable,
  };

  // Top question types for this exam
  const topTypes = Object.entries(exam._typeCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const title = exam._title || exam.exam_title || 'Examen';

  return (
    <button
      className="card exam-card"
      onClick={onClick}
      type="button"
      aria-label={`${exam._subject} — ${title} (${exam._year || ''})`}
      style={{ '--exam-accent': color }}
    >
      <div className="exam-card__header">
        <span
          className="exam-card__subject-badge"
          style={{ background: color + '18', color }}
        >
          {exam._subject}
        </span>
        {exam._year > 0 && <span className="exam-card__year">{exam._year}</span>}
      </div>

      <h3 className="exam-card__title" title={title}>{title}</h3>

      <div className="exam-card__meta">
        <span className="exam-card__level">{exam._level}</span>
        {exam.duration_minutes > 0 && (
          <span className="exam-card__duration">⏱ {exam.duration_minutes} min</span>
        )}
        {exam.language && (
          <span className="exam-card__lang">
            {exam.language === 'fr' ? '🇫🇷' : exam.language === 'ht' ? '🇭🇹' : '🇬🇧'}
          </span>
        )}
      </div>

      <div className="exam-card__stats">
        <span>{stats.total} question{stats.total !== 1 ? 's' : ''}</span>
        {stats.gradable > 0 && (
          <span className="exam-card__gradable">
            ✓ {stats.gradable} auto-corrigée{stats.gradable !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {topTypes.length > 0 && (
        <div className="exam-card__types">
          {topTypes.map(([type, count]) => {
            const meta = QUESTION_TYPE_META[type] || QUESTION_TYPE_META.unknown;
            return (
              <span key={type} className="exam-card__type-chip">
                {meta.icon} {meta.label} ({count})
              </span>
            );
          })}
        </div>
      )}

      <div className="exam-card__cta">
        <span className="exam-card__cta-text">Commencer →</span>
      </div>
    </button>
  );
}

export default ExamBrowser;
