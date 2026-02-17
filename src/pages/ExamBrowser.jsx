import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  buildExamIndex,
  subjectColor,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

const PAGE_SIZE = 24;

/** Fetch and cache the exam catalog (flat array of exam objects) */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      const data = await res.json();
      // The catalog is a flat array; return as-is
      return Array.isArray(data) ? data : Object.values(data).flat();
    },
    staleTime: Infinity, // static asset, never re-fetch
  });
}

/** Map URL path segments to the raw level values used in exam_catalog.json */
const URL_LEVEL_TO_RAW = {
  '9e': '9eme_af',
  'terminale': 'baccalaureat',
  'university': 'universite',
};

/** Display labels for level URL params */
const LEVEL_LABELS = {
  '9e': '9ème AF',
  'terminale': 'Baccalauréat',
  'university': 'Université',
};

const ExamBrowser = () => {
  const navigate = useNavigate();
  const { level } = useParams(); // Get level from URL

  const { data: allExams, isLoading, error } = useExamCatalog();

  // Build enriched index from full catalog, then filter by level
  const index = useMemo(() => {
    if (!allExams) return null;
    const full = buildExamIndex(allExams);
    if (!level) return full;

    const rawLevel = URL_LEVEL_TO_RAW[level];
    if (!rawLevel) return full;

    const filtered = full.exams.filter(
      (e) => (e.level || '').toLowerCase() === rawLevel
    );

    // Rebuild unique subjects / years from the filtered set
    const subjectSet = new Set();
    const yearSet = new Set();
    for (const e of filtered) {
      if (e._subject) subjectSet.add(e._subject);
      if (e._year) yearSet.add(e._year);
    }

    return {
      exams: filtered,
      levels: full.levels,
      subjects: [...subjectSet].sort(),
      years: [...yearSet].sort((a, b) => b - a),
    };
  }, [allExams, level]);

  // Filter state
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasActiveFilters = subjectFilter || yearFilter || search.trim();

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setVisibleCount(PAGE_SIZE);
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    if (!index) return [];
    let list = index.exams;

    if (subjectFilter) list = list.filter((e) => e._subject === subjectFilter);
    if (yearFilter) list = list.filter((e) => e._year === Number(yearFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e._title || '').toLowerCase().includes(q) ||
          (e._subject || '').toLowerCase().includes(q) ||
          String(e._year || '').includes(q)
      );
    }

    // Sort: newest first
    return [...list].sort((a, b) => (b._year || 0) - (a._year || 0));
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
    const totalQ = filtered.reduce((s, e) => s + (e._questionCount || 0), 0);
    const gradable = filtered.reduce((s, e) => s + (e._autoGradable || 0), 0);
    return { exams: filtered.length, totalQ, gradable };
  }, [filtered]);

  // Unique subjects and years for filter dropdowns (from level-filtered index)
  const subjects = index?.subjects || [];
  const years = index?.years || [];

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
          <h1 className="page-header__title">{LEVEL_LABELS[level] || 'Examens Nationaux'}</h1>
          <p className="page-header__subtitle">
            Banque d'examens officiels du MENFP{level ? ` — ${LEVEL_LABELS[level]}` : ''}
          </p>
        </div>

        {/* Sticky filter bar */}
        <div className="exam-browser__filters-sticky">
          <div className="exam-browser__filters">
            {/* Subject */}
            <select
              className="exam-browser__select"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Filtrer par matière"
            >
              <option value="">Toutes les matières</option>
              {subjects.map((s) => (
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
              {years.map((y) => (
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
                  onClick={() => navigate(`/exams/${level}/${exam._idx}`)}
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
