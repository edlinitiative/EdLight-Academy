import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACKS } from '../config/trackConfig';
import TrackSelector from '../components/TrackSelector';
import ExamPreviewModal from '../components/ExamPreviewModal';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { loadAllExamResultSummaries } from '../services/examResults';
import {
  buildExamIndex,
  subjectColor,
} from '../utils/examUtils';

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasActiveFilters = subjectFilter || yearFilter || search.trim() || trackFilter || statusFilter || difficultyFilter;

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setTrackFilter('');
    setStatusFilter('');
    setDifficultyFilter('');
    setVisibleCount(PAGE_SIZE);
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

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [subjectFilter, yearFilter, difficultyFilter, search, trackFilter, statusFilter]);

  // Paginated subset
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  // Summary counts for filtered set
  const summary = useMemo(() => {
    const totalQ = filtered.reduce((s, e) => s + (e._questionCount || 0), 0);
    const gradable = filtered.reduce((s, e) => s + (e._autoGradable || 0), 0);
    const done = filtered.reduce((s, e) => s + (attempts[examKeyOf(e)] ? 1 : 0), 0);
    return { exams: filtered.length, totalQ, gradable, done };
  }, [filtered, attempts, examKeyOf]);

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
            Banque d'examens officiels du MENFP{level ? `, ${LEVEL_LABELS[level]}` : ''}
          </p>
          <p className="page-header__count">
            {summary.exams} examen{summary.exams !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sticky filter bar */}
        <div className="exam-browser__filters-sticky">
          <div className="exam-browser__filters-card">
            <div className="exam-browser__filters">
              {/* Subject */}
              <div className="exam-browser__field">
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
              </div>

              {/* Year */}
              <div className="exam-browser__field">
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
              </div>

              {/* Difficulty */}
              <div className="exam-browser__field">
                <select
                  className="exam-browser__select"
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  aria-label="Filtrer par difficulté"
                >
                  <option value="">Toute difficulté</option>
                  <option value="easy">Facile</option>
                  <option value="medium">Moyen</option>
                  <option value="hard">Difficile</option>
                </select>
              </div>

              {/* Search */}
              <div className="exam-browser__field exam-browser__field--search">
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

            {/* Stat chips */}
            <div className="exam-browser__summary">
              <span className="exam-browser__stat-chip">
                {summary.totalQ.toLocaleString()} question{summary.totalQ !== 1 ? 's' : ''}
              </span>
              {summary.gradable > 0 && (
                <span className="exam-browser__stat-chip exam-browser__stat-chip--accent">
                  {summary.gradable.toLocaleString()} auto-corrigée{summary.gradable !== 1 ? 's' : ''}
                </span>
              )}
              {summary.done > 0 && (
                <span className="exam-browser__stat-chip exam-browser__stat-chip--done">
                  {summary.done} déjà fait{summary.done !== 1 ? 's' : ''}
                </span>
              )}

              {/* Status filter — done / to do */}
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
                  key={exam.exam_id || exam._idx}
                  exam={exam}
                  attempt={attempts[examKeyOf(exam)]}
                  onClick={() => setPreviewExam(exam)}
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
 * The normalized exam title has the shape "Subject — Topic · Year/Session".
 * The card already shows the subject (heading + colour dot) and the year (pill),
 * so we pull out ONLY the distinct topic (e.g. "English Time") to use as a
 * subtitle — never repeating the subject or year. Returns '' when there is none.
 */
function topicFromTitle(fullTitle) {
  const t = String(fullTitle || '');
  const dash = t.indexOf(' — ');
  if (dash === -1) return '';
  let topic = t.slice(dash + 3);
  const dot = topic.indexOf(' · ');
  if (dot !== -1) topic = topic.slice(0, dot);
  topic = topic.trim();

  // Drop an unmatched trailing "(" group, e.g. a title truncated mid-phrase
  // like "Faculté des Sciences (Génie, Chimie" -> "Faculté des Sciences".
  const opens = (topic.match(/\(/g) || []).length;
  const closes = (topic.match(/\)/g) || []).length;
  if (opens > closes) {
    const i = topic.lastIndexOf('(');
    if (i > 0) topic = topic.slice(0, i);
  }

  // Strip a leading ALL-CAPS prefix before a " - " — usually the subject in its
  // full form that the normalizer didn't match (e.g. subject "Histoire-Géo" vs
  // "HISTOIRE-GÉOGRAPHIE - Croisades" -> "Croisades").
  const segs = topic.split(/\s[-–—]\s/);
  if (segs.length > 1 && /[A-ZÀ-Þ]/.test(segs[0]) && segs[0] === segs[0].toUpperCase()) {
    topic = segs.slice(1).join(' - ');
  }

  // Tidy stray edge punctuation left by the cuts above.
  topic = topic.replace(/^[\s\-–—:,.()/]+|[\s\-–—:,.()/]+$/g, '').trim();

  // Calm a still-shouty ALL-CAPS topic down to sentence case.
  if (topic.length > 3 && topic === topic.toUpperCase()) {
    topic = topic.charAt(0).toUpperCase() + topic.slice(1).toLowerCase();
  }
  return topic;
}

function ExamCard({ exam, onClick, attempt }) {
  const color = subjectColor(exam._subject);
  const subject = exam._subject || 'Examen';
  // The subject (heading + colour dot) and the year (pill) are each shown once,
  // so we surface ONLY the distinct topic as a subtitle — avoiding the subject,
  // year and language being repeated inside the title. '' when there is none.
  const topic = topicFromTitle(exam._title || exam.exam_title || '');
  const qCount = exam._questionCount || 0;
  const duration = exam.duration_minutes || 0;
  const diff = difficultyMeta(exam.difficulty);

  // Best score (if known) drives a compact pill in the header.
  const pct = attempt && typeof attempt.percentage === 'number' ? attempt.percentage : null;
  const scoreTone = pct == null ? '' : pct >= 60 ? '--good' : pct >= 40 ? '--mid' : '--low';

  return (
    <button
      className={`card exam-card ${attempt ? 'exam-card--done' : ''}`}
      onClick={onClick}
      type="button"
      aria-label={`${subject}${topic ? ` — ${topic}` : ''}${exam._year ? `, ${exam._year}` : ''}${attempt ? ', déjà fait' : ''}`}
    >
      <div className="exam-card__header">
        <h3 className="exam-card__title" title={subject}>
          <span className="exam-card__dot" style={{ background: color }} aria-hidden="true" />
          <span className="exam-card__title-text">{subject}</span>
        </h3>
        <div className="exam-card__header-right">
          {attempt && (
            <span className={`exam-card__score-pill exam-card__score-pill${scoreTone}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              {pct != null ? `${pct}%` : 'Fait'}
            </span>
          )}
          {exam._year > 0 && <span className="exam-card__year">{exam._year}</span>}
        </div>
      </div>

      {topic && <p className="exam-card__topic" title={topic}>{topic}</p>}

      <div className="exam-card__meta">
        <span className="exam-card__meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
          {qCount} question{qCount !== 1 ? 's' : ''}
        </span>
        {duration > 0 && (
          <span className="exam-card__meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {duration} min
          </span>
        )}
        {diff && (
          <span className={`exam-card__difficulty exam-card__difficulty--${diff.tier}`}>
            {diff.label}
          </span>
        )}
      </div>

      <div className="exam-card__cta">
        <span className="exam-card__cta-text">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
          Aperçu
        </span>
      </div>
    </button>
  );
}

export default ExamBrowser;
