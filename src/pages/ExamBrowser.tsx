import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACKS, TRACK_BY_CODE, getCoefficient, DEFAULT_SUBJECT_ORDER } from '../config/trackConfig';
import TrackSelector from '../components/TrackSelector';
import ExamPreviewModal from '../components/ExamPreviewModal';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { loadAllExamResultSummaries } from '../services/examResults';
import { buildExamIndex, subjectColor, examCardName } from '../utils/examUtils';
import { Skeleton } from '../components/Skeleton';

const PAGE_SIZE = 24;

/** Map the numeric difficulty (1–5) to a 3-tier label + tone for display. */
const DIFFICULTY_META = {
  1: { label: 'Facile', tier: 'easy' },
  2: { label: 'Facile', tier: 'easy' },
  3: { label: 'Moyen', tier: 'medium' },
  4: { label: 'Difficile', tier: 'hard' },
  5: { label: 'Difficile', tier: 'hard' },
};

function difficultyMeta(d) {
  return DIFFICULTY_META[d] || null;
}

/** Fetch and cache the slim browse index (metadata only, ~280 KB).
 *  The full catalog (~27 MB) is only loaded later when a specific exam is
 *  opened in ExamTake/ExamResults, so browsing stays fast. */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      const data = await res.json();
      return normalizeExamCatalog(data);
    },
    staleTime: Infinity, // static asset, never re-fetch
  });
}

/**
 * Build a map of `examId -> { percentage, attempted }` from two sources:
 *   1. Firestore (signed-in users, cross-device)
 *   2. sessionStorage (works for everyone in the current session)
 * Used to surface "already done / best score" badges on exam cards.
 */
function useExamAttempts() {
  const userId = useStore((s) => s.user?.uid);

  // Remote summaries for authenticated users
  const { data: remote } = useQuery({
    queryKey: ['exam-attempts', userId],
    queryFn: () => loadAllExamResultSummaries(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map = {};
    const add = (id, percentage, ms) => {
      if (id == null) return;
      const key = String(id);
      const pct = typeof percentage === 'number' ? percentage : null;
      const prev = map[key];
      // Keep the best score seen across sources
      if (!prev || (pct != null && (prev.percentage == null || pct > prev.percentage))) {
        map[key] = { percentage: pct, attempted: true, submittedAtMs: ms ?? prev?.submittedAtMs ?? null };
      }
    };

    // 1. Firestore summaries
    if (remote) {
      for (const [id, info] of Object.entries(remote)) {
        add(id, info?.percentage, info?.submittedAtMs);
      }
    }

    // 2. sessionStorage scan (exam-result-<id>)
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !k.startsWith('exam-result-')) continue;
        const raw = sessionStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        add(parsed.examId ?? k.slice('exam-result-'.length), parsed.result?.summary?.percentage, parsed.timestamp);
      }
    } catch { /* sessionStorage may be unavailable */ }

    return map;
  }, [remote]);
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
  const { level } = useParams(); // Get level from URL

  const { data: allExams, isLoading, error } = useExamCatalog();
  const attempts = useExamAttempts();

  // Track state
  const userTrack = useStore((s) => s.track);
  const onboardingCompleted = useStore((s) => s.onboardingCompleted);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const isTerminale = level === 'terminale';
  const [trackFilter, setTrackFilter] = useState('');
  const [showTrackSelector, setShowTrackSelector] = useState(false);
  const [previewExam, setPreviewExam] = useState(null);

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
  const [difficultyFilter, setDifficultyFilter] = useState(''); // '' | 'easy' | 'medium' | 'hard'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'todo' | 'done'
  const [showFilters, setShowFilters] = useState(false); // collapsible dropdown panel

  const hasActiveFilters = subjectFilter || yearFilter || search.trim() || trackFilter || statusFilter || difficultyFilter;
  const dropdownCount = [subjectFilter, yearFilter, difficultyFilter].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setTrackFilter('');
    setStatusFilter('');
    setDifficultyFilter('');
  }, []);

  const examKeyOf = useCallback((e) => String(e.exam_id ?? e._idx), []);

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
    if (difficultyFilter) {
      list = list.filter((e) => difficultyMeta(e.difficulty)?.tier === difficultyFilter);
    }
    if (statusFilter) {
      list = list.filter((e) => {
        const done = !!attempts[examKeyOf(e)];
        return statusFilter === 'done' ? done : !done;
      });
    }
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
  }, [index, subjectFilter, yearFilter, difficultyFilter, search, trackFilter, isTerminale, statusFilter, attempts, examKeyOf]);

  // The student's active filière drives both the section ordering and the
  // coefficient note on each subject header (track-first organisation).
  const activeTrack = isTerminale ? (trackFilter || userTrack || '') : '';

  // Group filtered exams into subject sections, ordered by the active track's
  // coefficient (most-weighted subject first), else a sensible default order.
  const groups = useMemo(() => {
    if (!filtered.length) return [];
    const bySubject = new Map();
    for (const e of filtered) {
      const s = e._subject || 'Autre';
      if (!bySubject.has(s)) bySubject.set(s, []);
      bySubject.get(s).push(e);
    }
    const arr = [...bySubject.entries()].map(([subject, exams]) => ({
      subject,
      exams,
      color: subjectColor(subject),
      coef: activeTrack ? getCoefficient(activeTrack, subject) : null,
    }));
    arr.sort((a, b) => {
      if (activeTrack) {
        if ((b.coef || 0) !== (a.coef || 0)) return (b.coef || 0) - (a.coef || 0);
      } else {
        const ra = DEFAULT_SUBJECT_ORDER.indexOf(a.subject);
        const rb = DEFAULT_SUBJECT_ORDER.indexOf(b.subject);
        const na = ra === -1 ? 999 : ra;
        const nb = rb === -1 ? 999 : rb;
        if (na !== nb) return na - nb;
      }
      if (b.exams.length !== a.exams.length) return b.exams.length - a.exams.length;
      return a.subject.localeCompare(b.subject);
    });
    return arr;
  }, [filtered, activeTrack]);

  // Default expansion: open the highest-priority section(s) up to a small card
  // budget, so the page opens as a scannable "table of contents".
  const defaultOpen = useMemo(() => {
    const set = new Set();
    let budget = PAGE_SIZE;
    for (const g of groups) {
      if (set.size === 0 || budget > 0) {
        set.add(g.subject);
        budget -= g.exams.length;
      }
    }
    return set;
  }, [groups]);

  // Track which sections the user toggled; reset when the level / filière changes.
  const [openTouched, setOpenTouched] = useState(false);
  const [openSubjects, setOpenSubjects] = useState(() => new Set());
  useEffect(() => { setOpenTouched(false); }, [level, activeTrack]);

  const openSet = openTouched ? openSubjects : defaultOpen;
  // A subject filter or an active search forces matching sections open so
  // results are never hidden behind a collapsed header.
  const forceOpen = !!subjectFilter || !!search.trim();
  const isSectionOpen = useCallback(
    (subject) => forceOpen || openSet.has(subject),
    [forceOpen, openSet]
  );
  const toggleSection = useCallback((subject) => {
    setOpenSubjects((prev) => {
      const base = openTouched ? prev : defaultOpen;
      const next = new Set(base);
      if (next.has(subject)) next.delete(subject); else next.add(subject);
      return next;
    });
    setOpenTouched(true);
  }, [openTouched, defaultOpen]);
  const allOpen = groups.length > 0 && groups.every((g) => openSet.has(g.subject));
  const setAllOpen = useCallback((open) => {
    setOpenSubjects(open ? new Set(groups.map((g) => g.subject)) : new Set());
    setOpenTouched(true);
  }, [groups]);

  // Summary counts for filtered set
  const summary = useMemo(() => {
    const done = filtered.reduce((s, e) => s + (attempts[examKeyOf(e)] ? 1 : 0), 0);
    return { exams: filtered.length, done };
  }, [filtered, attempts, examKeyOf]);

  // Unique subjects and years for filter dropdowns (from level-filtered index)
  const subjects = index?.subjects || [];
  const years = index?.years || [];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <section className="section">
        <div className="container" aria-busy="true">
          <div className="page-header">
            <h1 className="page-header__title">Examens</h1>
            <p className="page-header__subtitle">Chargement du catalogue…</p>
          </div>
          <div className="grid grid--exams" style={{ marginTop: '1.5rem' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="card exam-card exam-card--skeleton">
                <div className="skeleton-row skeleton-row--between">
                  <Skeleton width={54} height={16} radius={999} />
                  <Skeleton width={40} height={16} radius={999} />
                </div>
                <Skeleton width="85%" height={20} style={{ marginTop: '0.75rem' }} />
                <Skeleton width="55%" height={14} style={{ marginTop: '0.6rem' }} />
                <div className="skeleton-row" style={{ marginTop: '0.9rem' }}>
                  <Skeleton width={70} height={22} radius={999} />
                  <Skeleton width={58} height={22} radius={999} />
                </div>
                <Skeleton width={64} height={14} style={{ marginTop: '1rem' }} />
              </div>
            ))}
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
          <h1 className="page-header__title">{LEVEL_LABELS[level] || 'Examens Nationaux'}</h1>
          <p className="page-header__subtitle">
            Banque d'examens officiels du MENFP{level ? `, ${LEVEL_LABELS[level]}` : ''}
          </p>
          <p className="page-header__count">
            {summary.exams} examen{summary.exams !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sticky filter bar */}
        <div className="exam-browser__filters-sticky">
          <div className="exam-browser__filters-card">
            {/* Search + filter toggle */}
            <div className="exam-browser__search-row">
              <div className="exam-browser__search-wrap">
                <input
                  className="exam-browser__search"
                  type="search"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Rechercher un examen"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <button
                type="button"
                className={`exam-browser__filter-toggle ${showFilters ? 'exam-browser__filter-toggle--open' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-label="Filtres"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {dropdownCount > 0 && <span className="exam-browser__filter-badge">{dropdownCount}</span>}
              </button>
            </div>

            {/* Filter dropdowns (collapsible) */}
            {showFilters && (
            <div className="exam-browser__filters">
              <select
                className="exam-browser__select"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                aria-label="Filtrer par matière"
              >
                <option value="">Matière</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                className="exam-browser__select"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label="Filtrer par année"
              >
                <option value="">Année</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                className="exam-browser__select"
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                aria-label="Filtrer par difficulté"
              >
                <option value="">Difficulté</option>
                <option value="easy">Facile</option>
                <option value="medium">Moyen</option>
                <option value="hard">Difficile</option>
              </select>
            </div>
            )}

            {/* Track filter chips — only for Terminale/Baccalauréat */}
            {isTerminale && (
              <div className="exam-browser__track-bar">
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
                    {t.shortLabel}
                  </button>
                ))}
                {!userTrack && isAuthenticated && (
                  <button
                    className="exam-browser__track-chip"
                    style={{ '--track-color': '#6366f1' }}
                    onClick={() => setShowTrackSelector(true)}
                    type="button"
                  >
                    Définir ma filière
                  </button>
                )}
              </div>
            )}

            {/* Status filter + reset */}
            <div className="exam-browser__summary">
              <div className="exam-browser__status-filter" role="group" aria-label="Filtrer par statut">
                <button
                  type="button"
                  className={`exam-browser__status-chip ${!statusFilter ? 'exam-browser__status-chip--active' : ''}`}
                  onClick={() => setStatusFilter('')}
                >
                  Tous
                </button>
                <button
                  type="button"
                  className={`exam-browser__status-chip ${statusFilter === 'todo' ? 'exam-browser__status-chip--active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === 'todo' ? '' : 'todo')}
                >
                  À faire
                </button>
                <button
                  type="button"
                  className={`exam-browser__status-chip ${statusFilter === 'done' ? 'exam-browser__status-chip--active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === 'done' ? '' : 'done')}
                  disabled={summary.done === 0 && statusFilter !== 'done'}
                >
                  Terminés
                </button>
              </div>

              {hasActiveFilters && (
                <button
                  className="exam-browser__clear-btn"
                  onClick={clearFilters}
                  type="button"
                  aria-label="Réinitialiser les filtres"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  Effacer
                </button>
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
          <div className="exam-browser__results">
            <div className="exam-browser__results-head">
              <p className="exam-browser__results-count">
                {summary.exams} examen{summary.exams !== 1 ? 's' : ''}
                {summary.done > 0 && <> · {summary.done} terminé{summary.done !== 1 ? 's' : ''}</>}
              </p>
              {groups.length > 1 && !forceOpen && (
                <button
                  type="button"
                  className="exam-browser__expand-all"
                  onClick={() => setAllOpen(!allOpen)}
                >
                  {allOpen ? 'Tout réduire' : 'Tout développer'}
                </button>
              )}
            </div>

            {groups.map((g) => {
              const open = isSectionOpen(g.subject);
              return (
                <section key={g.subject} className="exam-section">
                  <button
                    type="button"
                    className="exam-section__head"
                    onClick={() => toggleSection(g.subject)}
                    aria-expanded={open}
                    disabled={forceOpen}
                  >
                    <span className="exam-section__swatch" style={{ background: g.color }} aria-hidden="true" />
                    <span className="exam-section__name">{g.subject}</span>
                    <span className="exam-section__count">{g.exams.length}</span>
                    {g.coef != null && <span className="exam-section__coef">Coef. {g.coef}</span>}
                    <svg
                      className={`exam-section__chevron ${open ? 'is-open' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {open && (
                    <div className="grid grid--exams exam-section__grid">
                      {g.exams.map((exam) => (
                        <ExamCard
                          key={exam.exam_id || exam._idx}
                          exam={exam}
                          attempt={attempts[examKeyOf(exam)]}
                          onClick={() => setPreviewExam(exam)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
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

        {/* Quick-look preview modal */}
        {previewExam && (
          <ExamPreviewModal
            exam={previewExam}
            attempt={attempts[examKeyOf(previewExam)]}
            level={level}
            onClose={() => setPreviewExam(null)}
          />
        )}
      </div>
    </section>
  );
};

// ── Exam Card Component ──────────────────────────────────────────────────────

/**
 * Flat, editorial exam card. Because cards live inside a subject section, the
 * subject already appears in the section header — so the card leads with the
 * distinct topic / session (the real differentiator between same-subject papers)
 * and surfaces year, filière, length and difficulty as quiet metadata.
 */
function ExamCard({ exam, onClick, attempt }) {
  const subject = exam._subject || 'Examen';
  // The section header already carries the subject and the card shows the year
  // as a chip, so the heading leads with the real differentiator (topic) and
  // falls back to a clean session/type label — never a bare year or "Épreuve".
  const { heading, sub } = examCardName({
    topic: exam._topic || '',
    session: exam._session || '',
    examType: exam._examType || '',
  });

  const qCount = exam._questionCount || 0;
  const duration = exam.duration_minutes || 0;
  const diff = difficultyMeta(exam.difficulty);
  const tracks = (exam.tracks || [])
    .filter((t) => t && t !== 'ALL')
    .map((t) => TRACK_BY_CODE[t]?.shortLabel || t);

  const pct = attempt && typeof attempt.percentage === 'number' ? attempt.percentage : null;
  const scoreTone = pct == null ? '' : pct >= 60 ? '--good' : pct >= 40 ? '--mid' : '--low';

  return (
    <button
      className={`card exam-card ${attempt ? 'exam-card--done' : ''}`}
      onClick={onClick}
      type="button"
      aria-label={`${subject} — ${heading}${exam._year ? `, ${exam._year}` : ''}${attempt ? ', déjà fait' : ''}`}
    >
      <div className="exam-card__top">
        <span className="exam-card__year">{exam._year || '—'}</span>
        {attempt && (
          <span className={`exam-card__score exam-card__score${scoreTone}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            {pct != null ? `${pct}%` : 'Fait'}
          </span>
        )}
      </div>

      <h3 className="exam-card__heading" title={heading}>{heading}</h3>
      {sub && <p className="exam-card__sub" title={sub}>{sub}</p>}

      <div className="exam-card__meta">
        <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
        {duration > 0 && <span>{duration} min</span>}
        {diff && <span className={`exam-card__diff exam-card__diff--${diff.tier}`}>{diff.label}</span>}
      </div>

      {tracks.length > 0 && (
        <p className="exam-card__tracks">Filière : {tracks.join(' · ')}</p>
      )}

      <span className="exam-card__cta">Aperçu →</span>
    </button>
  );
}

export default ExamBrowser;
