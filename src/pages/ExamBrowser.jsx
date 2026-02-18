import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACKS, TRACK_BY_CODE } from '../config/trackConfig';
import TrackSelector from '../components/TrackSelector';
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

  // Track state
  const userTrack = useStore((s) => s.track);
  const onboardingCompleted = useStore((s) => s.onboardingCompleted);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const isTerminale = level === 'terminale';
  const [trackFilter, setTrackFilter] = useState('');
  const [showTrackSelector, setShowTrackSelector] = useState(false);

  // Auto-default track filter to user's track on first load
  useEffect(() => {
    if (isTerminale && userTrack && !trackFilter) {
      setTrackFilter(userTrack);
    }
  }, [isTerminale, userTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show onboarding prompt for authenticated Terminale users without a track
  useEffect(() => {
    if (isTerminale && isAuthenticated && !onboardingCompleted && !userTrack) {
      setShowTrackSelector(true);
    }
  }, [isTerminale, isAuthenticated, onboardingCompleted, userTrack]);

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

  const hasActiveFilters = subjectFilter || yearFilter || search.trim() || trackFilter;

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setTrackFilter('');
    setVisibleCount(PAGE_SIZE);
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    if (!index) return [];
    let list = index.exams;

    // Track filter (only for Terminale/baccalaureat level)
    if (trackFilter && isTerminale) {
      list = list.filter((e) => {
        const tracks = e.tracks || [];
        return tracks.includes('ALL') || tracks.includes(trackFilter);
      });
    }

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
  }, [index, subjectFilter, yearFilter, search, trackFilter, isTerminale]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [subjectFilter, yearFilter, search, trackFilter]);

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
          <div className="exam-browser__filters-card">
            <div className="exam-browser__filters">
              {/* Subject */}
              <div className="exam-browser__field">
                <span className="exam-browser__label">Matière</span>
                <select
                  className="exam-browser__select"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  aria-label="Filtrer par matière"
                >
                  <option value="">Toutes</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div className="exam-browser__field">
                <span className="exam-browser__label">Année</span>
                <select
                  className="exam-browser__select"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  aria-label="Filtrer par année"
                >
                  <option value="">Toutes</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="exam-browser__field exam-browser__field--search">
                <span className="exam-browser__label">Recherche</span>
                <div className="exam-browser__search-wrap">
                  <svg className="exam-browser__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="exam-browser__search"
                    type="search"
                    placeholder="Titre, matière, année…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher un examen"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <div className="exam-browser__field exam-browser__field--actions">
                  <button
                    className="exam-browser__clear-btn"
                    onClick={clearFilters}
                    type="button"
                    aria-label="Réinitialiser les filtres"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    Effacer
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <hr className="exam-browser__divider" />

            {/* Track filter chips — only for Terminale/Baccalauréat */}
            {isTerminale && (
              <div className="exam-browser__track-bar">
                <span className="exam-browser__track-label">Filière :</span>
                <button
                  className={`exam-browser__track-chip ${!trackFilter ? 'exam-browser__track-chip--active' : ''}`}
                  onClick={() => setTrackFilter('')}
                  type="button"
                >
                  Toutes
                </button>
                {TRACKS.map((t) => (
                  <button
                    key={t.code}
                    className={`exam-browser__track-chip ${trackFilter === t.code ? 'exam-browser__track-chip--active' : ''}`}
                    style={{ '--track-color': t.color }}
                    onClick={() => setTrackFilter(trackFilter === t.code ? '' : t.code)}
                    type="button"
                  >
                    {t.icon} {t.shortLabel}
                  </button>
                ))}
                {!userTrack && isAuthenticated && (
                  <button
                    className="exam-browser__track-chip"
                    style={{ '--track-color': '#6366f1' }}
                    onClick={() => setShowTrackSelector(true)}
                    type="button"
                  >
                    ⚙️ Définir ma filière
                  </button>
                )}
              </div>
            )}

            {/* Stat chips */}
            <div className="exam-browser__summary">
              <span className="exam-browser__stat-chip">
                <span className="exam-browser__stat-icon">📋</span>
                {summary.exams} examen{summary.exams !== 1 ? 's' : ''}
              </span>
              <span className="exam-browser__stat-chip">
                <span className="exam-browser__stat-icon">❓</span>
                {summary.totalQ.toLocaleString()} question{summary.totalQ !== 1 ? 's' : ''}
              </span>
              {summary.gradable > 0 && (
                <span className="exam-browser__stat-chip exam-browser__stat-chip--accent">
                  <span className="exam-browser__stat-icon">✓</span>
                  {summary.gradable.toLocaleString()} auto-corrigée{summary.gradable !== 1 ? 's' : ''}
                </span>
              )}
            </div>
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

        {/* Track selector modal (onboarding) */}
        {showTrackSelector && (
          <TrackSelector
            mode="modal"
            currentTrack={userTrack}
            onSelect={(code) => {
              setShowTrackSelector(false);
              setTrackFilter(code);
            }}
            onClose={() => setShowTrackSelector(false)}
          />
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

      {/* Track badges */}
      {exam.tracks && exam.tracks.length > 0 && !exam.tracks.includes('ALL') && (
        <div className="exam-card__tracks">
          {exam.tracks.map((t) => {
            const info = TRACK_BY_CODE[t];
            return (
              <span key={t} className="exam-card__track-chip">
                {info?.icon || ''} {info?.shortLabel || t}
              </span>
            );
          })}
        </div>
      )}

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
