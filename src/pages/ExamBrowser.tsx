import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, SlidersHorizontal, ChevronRight, Clock, Save, LogIn } from 'lucide-react';
import useStore from '../contexts/store';
import { TRACKS, TRACK_BY_CODE, getCoefficient, DEFAULT_SUBJECT_ORDER, gradeProfile } from '../config/trackConfig';
import TrackSelector from '../components/TrackSelector';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { buildExamIndex, subjectColor } from '../utils/examUtils';
import { examTopicTags } from '../../shared/examUtils';
import CardCover from '../components/CardCover';
import { SUBJECT_GLYPHS } from '../utils/subjectGlyphs';
import { sessionRowName, yearRange } from '../utils/examNaming';
import './ExamOverview.css'; // shared .exam-overview__crumbs (same trail as the subject/exam pages)
import './ExamSubject.css'; // shared .exam-session row — the same list, one step down
import './ExamBrowser.css';
import { deriveSignals, selectAdaptiveItems, type AttemptEvent } from '../services/adaptiveEngine';
import { Skeleton } from '../components/Skeleton';

const PAGE_SIZE = 24;

/** Slim per-exam attempt summary as returned by loadAllExamResultSummaries. */
interface ExamAttemptSummary {
  percentage?: number | null;
  submittedAtMs?: number | null;
}

/** Map the numeric difficulty (1–5) to a 3-tier label + tone for display. */
const DIFFICULTY_META = {
  1: { label: 'Facile', tier: 'easy' },
  2: { label: 'Facile', tier: 'easy' },
  3: { label: 'Moyen', tier: 'medium' },
  4: { label: 'Difficile', tier: 'hard' },
  5: { label: 'Difficile', tier: 'hard' },
};

/** Creole difficulty labels, keyed by tier (parallel to DIFFICULTY_META). */
const DIFFICULTY_LABEL_HT = { easy: 'Fasil', medium: 'Mwayen', hard: 'Difisil' };

function difficultyMeta(d) {
  return DIFFICULTY_META[d] || null;
}

/**
 * The filière/série a paper was set for.
 *
 * `tracks` is `['ALL']` on essentially every catalog entry, so the filière that
 * `sessionRowName` would print is usually empty — and eight Bac 2022 maths
 * papers came out as eight rows reading "Bac permanent". `_series` (parsed off
 * the records-office title in `buildExamIndex`) is the real separator. Shown
 * only when `tracks` is empty so the two never duplicate each other.
 */
function seriesLabel(exam, isCreole) {
  const tracks = (Array.isArray(exam?.tracks) ? exam.tracks : []).filter((tr) => tr && tr !== 'ALL');
  if (tracks.length > 0) return '';
  const raw = String(exam?._series || '').trim();
  if (!raw) return '';
  const parts = [...new Set(raw.split(/[,·/]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))].slice(0, 3);
  if (parts.length === 0) return '';
  const label = isCreole ? 'Seri' : parts.length > 1 ? 'Séries' : 'Série';
  return `${label} ${parts.join(' · ')}`;
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

/** gradeProfile().examLevel → this browser's level URL keys, so a student's
 *  grade can pick the default pool (POSTBAC → université concours, 9e → 9ème). */
const EXAM_LEVEL_TO_ROUTE = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
};

const ExamBrowser = () => {
  const { level } = useParams(); // Get level from URL
  const navigate = useNavigate();

  const { data: allExams, isPending: isLoading, error, refetch } = useExamCatalog();
  const attempts = useExamAttempts();

  // Track state
  const userTrack = useStore((s) => s.track);
  const grade = useStore((s) => s.grade);
  const onboardingCompleted = useStore((s) => s.onboardingCompleted);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const userId = useStore((s) => s.user?.uid);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  // gradeProfile().examLevel is null for 7ᵉ, 8ᵉ and NS1–NS3: no national paper
  // maps to those classes. The pool stays browsable — a curious 8ᵉ may look —
  // but the page says so instead of presenting the Bac as their exam (§6.4).
  const offLevel = !!grade && !gradeProfile(grade).examLevel;

  // ── Grade-based curation ───────────────────────────────────────────────────
  // Map the student's grade to an exam level; when it differs from the browser's
  // default Bac (terminale) pool, default-filter to it so a post-Bac (or 9e)
  // student isn't dumped into every Bac paper. Only ever curates *away* from the
  // default terminale pool — an explicit level (9e / université route) is left
  // untouched. Dismissible, never locked (see the level chip below). Mirrors the
  // mobile ExamBrowser behaviour.
  const curatedLevel = useMemo(() => {
    const mapped = EXAM_LEVEL_TO_ROUTE[gradeProfile(grade).examLevel ?? ''] ?? null;
    return level === 'terminale' && mapped && mapped !== 'terminale' ? mapped : null;
  }, [grade, level]);
  const [activeLevel, setActiveLevel] = useState(curatedLevel ?? level);
  const levelTouched = useRef(false);
  // Late store hydration: snap to the curated level once grade resolves, unless
  // the student has already chosen a level via the chip.
  useEffect(() => {
    if (!levelTouched.current && curatedLevel && activeLevel === level && curatedLevel !== level) {
      setActiveLevel(curatedLevel);
    }
  }, [curatedLevel, level, activeLevel]);

  const isTerminale = activeLevel === 'terminale';
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
    // 'all' (level chip escape) or an unmapped value → every level.
    if (!activeLevel || activeLevel === 'all') return full;

    const rawLevel = URL_LEVEL_TO_RAW[activeLevel];
    if (!rawLevel) return full;

    const filtered = full.exams.filter(
      (e) => (e.level || '').toLowerCase() === rawLevel
    );

    // Rebuild unique subjects / years from the filtered set
    const subjectSet = new Set<string>();
    const yearSet = new Set<number>();
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
  }, [allExams, activeLevel]);

  // Filter state
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState(''); // '' | 'easy' | 'medium' | 'hard'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'todo' | 'done'
  const [showFilters, setShowFilters] = useState(false); // collapsible dropdown panel

  const hasActiveFilters = subjectFilter || yearFilter || search.trim() || trackFilter || statusFilter || difficultyFilter;
  // Coursera-style browsing: the clean state sells SUBJECTS (one card each);
  // any search/filter switches to the detailed per-exam results below. The
  // track chip alone stays in card view — it only re-ranks subjects by coef.
  const subjectCardView = !(subjectFilter || yearFilter || search.trim() || statusFilter || difficultyFilter);
  const dropdownCount = [subjectFilter, yearFilter, difficultyFilter].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSubjectFilter('');
    setYearFilter('');
    setSearch('');
    setTrackFilter('');
    setStatusFilter('');
    setDifficultyFilter('');
  }, []);

  // Toggle the level chip between the grade-curated pool and every level.
  const toggleLevel = useCallback(() => {
    levelTouched.current = true;
    clearFilters();
    setActiveLevel((cur) => (cur === curatedLevel ? 'all' : (curatedLevel ?? level)));
  }, [curatedLevel, level, clearFilters]);

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

  // Per-subject ability estimate (Adaptive Engine, Slice 3a): fold the student's
  // past exam results into a 0–100 skill per subject, from data already loaded
  // here (index → subject, attempts → percentages). Drives within-subject
  // challenge ordering below. No extra fetch.
  const ability = useMemo(() => {
    const exams = index?.exams || [];
    const subjectByKey = new Map<string, string>();
    for (const e of exams) subjectByKey.set(examKeyOf(e), e._subject || '');
    const events: AttemptEvent[] = [];
    type AttemptInfo = { attempted?: boolean; percentage?: number | null; submittedAtMs?: number | null };
    for (const [key, info] of Object.entries(attempts) as [string, AttemptInfo][]) {
      if (!info?.attempted) continue;
      const subject = subjectByKey.get(key) || '';
      if (!subject) continue;
      events.push({
        subject,
        quizId: key,
        percentage: typeof info.percentage === 'number' ? info.percentage : 0,
        timeSpent: 0,
        attemptedAtMs: typeof info.submittedAtMs === 'number' ? info.submittedAtMs : 0,
      });
    }
    return deriveSignals(events).ability;
  }, [index, attempts, examKeyOf]);

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
    const arr = [...bySubject.entries()].map(([subject, exams]) => {
      // Within a subject we know the student's level in, order papers by
      // challenge fit (stretch the strong, on-ramp the rest); else year-desc.
      const a = ability[subject] ?? 0;
      return {
        subject,
        exams: a > 0 ? selectAdaptiveItems(exams, { ability: a }) : exams,
        adaptive: a > 0,
        color: subjectColor(subject),
        coef: activeTrack ? getCoefficient(activeTrack, subject) : null,
      };
    });
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
  }, [filtered, activeTrack, ability]);

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
  useEffect(() => { setOpenTouched(false); }, [activeLevel, activeTrack]);

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
            <h1 className="page-header__title">{t('Examens', 'Egzamen')}</h1>
            <p className="page-header__subtitle">{t('Chargement du catalogue…', 'Ap chaje katalòg la…')}</p>
          </div>
          {/* The skeleton mirrors the subject ROWS this page actually opens
              with, so the layout doesn't jump when the catalog lands. */}
          <ul className="exam-subject-rows" style={{ marginTop: '1.5rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="exam-subject-row exam-subject-row--skeleton">
                <Skeleton width={44} height={44} radius={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Skeleton width="42%" height={16} />
                  <Skeleton width="62%" height={13} style={{ marginTop: '0.45rem' }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <div className="page-header">
            <h1 className="page-header__title">{t('Examens', 'Egzamen')}</h1>
          </div>
          {/* Plain language + a safe recovery action, instead of the raw
              exception text (§8). */}
          <div className="card card--message">
            <p>
              {t(
                'Nous n’avons pas pu charger le catalogue d’examens. Vérifiez votre connexion, puis réessayez.',
                'Nou pa t ka chaje katalòg egzamen an. Tcheke koneksyon ou, epi eseye ankò.',
              )}
            </p>
            <button className="button button--primary" type="button" onClick={() => refetch()}>
              {t('Réessayer', 'Eseye ankò')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        {/* Same trail as the subject and exam pages, so the four steps of the
            exam path (landing → niveau → matière → épreuve) read as one
            journey and every step back is one tap. */}
        <nav className="exam-overview__crumbs" aria-label={t('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{t('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <span>
            {activeLevel === 'all'
              ? t('Tous les niveaux', 'Tout nivo')
              : (LEVEL_LABELS[activeLevel] || t('Examens Nationaux', 'Egzamen Nasyonal'))}
          </span>
        </nav>

        {/* Header — reflects the effective (grade-curated) level, not just the URL */}
        <div className="page-header exam-browser__header">
          <h1 className="page-header__title">
            {activeLevel === 'all'
              ? t('Tous les examens', 'Tout egzamen')
              : (LEVEL_LABELS[activeLevel] || t('Examens Nationaux', 'Egzamen Nasyonal'))}
          </h1>
          {/* The level is already the h1 and the last crumb — repeating it here
              was a third copy of the same word (§13 "duplicate headings"). */}
          {/* An exam here is not a quiz, and the subtitle is where that has to
              be said — the rows below all lead to a full paper (§6.4). */}
          <p className="page-header__subtitle">
            {t(
              "Banque d'examens officiels du MENFP — des épreuves complètes, pas des quiz rapides.",
              'Bank egzamen ofisyèl MENFP — epwèv konplè, se pa ti kiz.',
            )}
          </p>
          {/* The count moved into the toolbar, next to the filters that change
              it (it used to float here, far above the controls). */}
        </div>

        {/* Grade-curated level context — shown only when the student's grade
            implies a different pool than the default Bac papers. Gives a one-tap
            escape to browse every level, then back to their own. Styled from
            tokens now — the inline rgba()/#1558B8 it used to carry ignored the
            dark theme. */}
        {curatedLevel && (
          <div className="exam-browser__level-note" role="status">
            <span className="exam-browser__level-note-body">
              <strong>
                {activeLevel === curatedLevel
                  ? (LEVEL_LABELS[curatedLevel] || '')
                  : t('Tous les niveaux', 'Tout nivo')}
              </strong>
              <span>
                {activeLevel === curatedLevel
                  ? t('Adapté à ton profil', 'Adapte pou pwofil ou')
                  : t('Affichage de tous les examens', 'N ap montre tout egzamen')}
              </span>
            </span>
            <button
              type="button"
              className="button button--ghost"
              onClick={toggleLevel}
            >
              {activeLevel === curatedLevel
                ? t('Voir tous les niveaux', 'Wè tout nivo')
                : t('Mon niveau', 'Nivo mwen')}
            </button>
          </div>
        )}

        {/* Not this student's level — explain, point at what is, keep browsing. */}
        {offLevel && (
          <div className="exam-browser__level-note" role="status">
            <span className="exam-browser__level-note-body">
              <strong>{t('Pas encore votre niveau', 'Poko nivo ou')}</strong>
              <span>
                {t(
                  'Les examens nationaux commencent en 9ᵉ AF. Vous pouvez consulter ces épreuves librement.',
                  'Egzamen nasyonal yo kòmanse nan 9yèm ane. Ou lib pou gade epwèv sa yo.',
                )}
              </span>
            </span>
            <Link to="/quizzes" className="button button--ghost">
              {t('Faire un quiz', 'Fè yon kiz')}
            </Link>
          </div>
        )}

        {/* What these rows lead to, and whether a result is kept — once for the
            list, not on every row. ExamTake's save effect returns early without
            a uid, so signed out the result really is not stored. */}
        <p className="exam-browser__terms">
          <Clock size={14} aria-hidden="true" />
          {t(
            'Chaque épreuve indique sa durée, ou qu’elle n’est pas chronométrée.',
            'Chak epwèv montre dire li, oswa li di li pa gen kwonomèt.',
          )}
          {userId ? <Save size={14} aria-hidden="true" /> : <LogIn size={14} aria-hidden="true" />}
          {userId
            ? t('Vos résultats sont enregistrés.', 'Rezilta ou yo anrejistre.')
            : t('Résultats non enregistrés hors connexion.', 'Rezilta pa anrejistre si ou pa konekte.')}
          {!userId && (
            <button type="button" className="exam-browser__terms-link" onClick={() => setShowAuthModal(true)}>
              {t('Se connecter', 'Konekte')}
            </button>
          )}
        </p>

        {/* ── Browse toolbar ──────────────────────────────────────────────────
            One horizontal row (Coursera's browse pattern): a constrained
            search field, the status segment, the filters toggle, and the live
            result count — instead of a full-bleed search banner with a bare
            icon button bolted on. The three selects and the filière chips
            drop below on their own rows when opened / relevant. */}
        <div className="exam-browser__toolbar">
          <div className="exam-browser__toolbar-row">
            {/* Search — leading magnifier inside the field, clear affordance
                on the right once there's a query. */}
            <div className="exam-browser__search-wrap">
              <Search className="exam-browser__search-icon" size={17} aria-hidden="true" />
              <input
                className="exam-browser__search"
                type="search"
                placeholder={t('Rechercher une épreuve…', 'Chèche yon egzamen…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('Rechercher un examen', 'Chèche yon egzamen')}
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
              />
              {search && (
                <button
                  type="button"
                  className="exam-browser__search-clear"
                  onClick={() => setSearch('')}
                  aria-label={t('Effacer la recherche', 'Efase rechèch la')}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Status segment (Tous / À faire / Terminés) */}
            <div className="exam-browser__status-filter" role="group" aria-label={t('Filtrer par statut', 'Filtre dapre eta')}>
              <button
                type="button"
                className={`exam-browser__status-chip ${!statusFilter ? 'exam-browser__status-chip--active' : ''}`}
                onClick={() => setStatusFilter('')}
              >
                {t('Tous', 'Tout')}
              </button>
              <button
                type="button"
                className={`exam-browser__status-chip ${statusFilter === 'todo' ? 'exam-browser__status-chip--active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === 'todo' ? '' : 'todo')}
              >
                {t('À faire', 'Pou fè')}
              </button>
              <button
                type="button"
                className={`exam-browser__status-chip ${statusFilter === 'done' ? 'exam-browser__status-chip--active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === 'done' ? '' : 'done')}
                disabled={summary.done === 0 && statusFilter !== 'done'}
              >
                {t('Terminés', 'Fini')}
              </button>
            </div>

            {/* Filters toggle — a labelled control, not a bare glyph */}
            <button
              type="button"
              className={`exam-browser__filter-toggle ${showFilters ? 'exam-browser__filter-toggle--open' : ''}`}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              {t('Filtres', 'Filt')}
              {dropdownCount > 0 && <span className="exam-browser__filter-badge">{dropdownCount}</span>}
            </button>

            {/* Live count of what the filters currently match */}
            <span className="exam-browser__toolbar-count">
              {summary.exams} {t('examen', 'egzamen')}{summary.exams !== 1 ? t('s', '') : ''}
              {summary.done > 0 && <> · {summary.done} {t('terminé', 'fini')}{summary.done !== 1 ? t('s', '') : ''}</>}
            </span>

            {hasActiveFilters && (
              <button
                className="exam-browser__clear-btn"
                onClick={clearFilters}
                type="button"
                aria-label={t('Réinitialiser les filtres', 'Reyinisyalize filt yo')}
              >
                <X size={14} aria-hidden="true" />
                {t('Effacer', 'Efase')}
              </button>
            )}
          </div>

          {/* Filter dropdowns (collapsible) */}
          {showFilters && (
            <div className="exam-browser__filters">
              <select
                className="exam-browser__select"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                aria-label={t('Filtrer par matière', 'Filtre dapre matyè')}
              >
                <option value="">{t('Toutes les matières', 'Tout matyè')}</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                className="exam-browser__select"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label={t('Filtrer par année', 'Filtre dapre ane')}
              >
                <option value="">{t('Toutes les années', 'Tout ane')}</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                className="exam-browser__select"
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                aria-label={t('Filtrer par difficulté', 'Filtre dapre difikilte')}
              >
                <option value="">{t('Toute difficulté', 'Tout difikilte')}</option>
                <option value="easy">{t('Facile', 'Fasil')}</option>
                <option value="medium">{t('Moyen', 'Mwayen')}</option>
                <option value="hard">{t('Difficile', 'Difisil')}</option>
              </select>
            </div>
          )}

          {/* Track filter chips — only for Terminale/Baccalauréat */}
          {isTerminale && (
            <div className="exam-browser__track-bar">
              <span className="exam-browser__track-label">{t('Filière', 'Filyè')}</span>
              <button
                className={`exam-browser__track-chip ${!trackFilter ? 'exam-browser__track-chip--active' : ''}`}
                onClick={() => setTrackFilter('')}
                type="button"
              >
                {t('Toutes', 'Tout')}
              </button>
              {TRACKS.map((tr) => (
                <button
                  key={tr.code}
                  className={`exam-browser__track-chip ${trackFilter === tr.code ? 'exam-browser__track-chip--active' : ''}`}
                  style={{ '--track-color': tr.color } as React.CSSProperties}
                  onClick={() => setTrackFilter(trackFilter === tr.code ? '' : tr.code)}
                  type="button"
                >
                  {tr.shortLabel}
                </button>
              ))}
              {!userTrack && isAuthenticated && (
                <button
                  className="exam-browser__track-chip exam-browser__track-chip--set"
                  onClick={() => setShowTrackSelector(true)}
                  type="button"
                >
                  {t('Définir ma filière', 'Chwazi filyè m')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clean browse: one compact ROW per subject. This used to be a grid of
            equal-weight cards, each with a 16:8 cover and a repeated "EdLight
            Academy" byline — a wall to read rather than a list to scan (§6.2:
            compact rows with title, relevant progress and one clear action).
            Every figure below comes from the catalog or the student's own
            attempts; nothing is estimated. */}
        {subjectCardView && groups.length > 0 && (
          <ul className="exam-subject-rows">
            {groups.map((g) => {
              const done = g.exams.reduce((n, e) => n + (attempts[examKeyOf(e)] ? 1 : 0), 0);
              const best = g.exams.reduce((mx, e) => {
                const p = attempts[examKeyOf(e)]?.percentage;
                return typeof p === 'number' && p > mx ? p : mx;
              }, -1);
              const span = yearRange(g.exams);
              return (
                <li key={g.subject}>
                  <button
                    type="button"
                    className="exam-subject-row"
                    onClick={() => navigate(`/exams/${level}/matiere/${encodeURIComponent(g.subject)}`)}
                  >
                    <CardCover className="exam-subject-row__cover" glyph={SUBJECT_GLYPHS[g.subject] || 'book'} color={g.color} />
                    <span className="exam-subject-row__body">
                      <span className="exam-subject-row__name">{g.subject}</span>
                      <span className="exam-subject-row__meta">
                        {g.exams.length} {g.exams.length === 1 ? t('épreuve officielle', 'egzamen ofisyèl') : t('épreuves officielles', 'egzamen ofisyèl')}
                        {span ? ` · ${span}` : ''}
                        {g.coef != null ? ` · ${t('coef.', 'koef.')} ${g.coef}` : ''}
                      </span>
                    </span>
                    {done > 0 && (
                      <span className="exam-subject-row__progress">
                        <span className="exam-subject-row__progress-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round((done / g.exams.length) * 100)}%` }} />
                        </span>
                        <span className="exam-subject-row__progress-text">
                          {done}/{g.exams.length} {t('terminées', 'fini')}
                          {best >= 0 ? ` · ${t('meilleur', 'pi bon')} ${best}%` : ''}
                        </span>
                      </span>
                    )}
                    <ChevronRight size={18} className="exam-subject-row__chevron" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* An empty pool used to render nothing at all — a blank page that
            looked like a failure. Say what happened and offer a way out (§8). */}
        {subjectCardView && groups.length === 0 && (
          <div className="card card--message exam-browser__empty">
            <p>
              {trackFilter
                ? t(
                    'Aucune épreuve pour cette filière à ce niveau.',
                    'Pa gen egzamen pou filyè sa a nan nivo sa a.',
                  )
                : t(
                    'Aucune épreuve disponible pour ce niveau pour le moment.',
                    'Pa gen egzamen disponib pou nivo sa a pou kounye a.',
                  )}
            </p>
            {trackFilter ? (
              <button className="button button--ghost" type="button" onClick={() => setTrackFilter('')}>
                {t('Voir toutes les filières', 'Wè tout filyè yo')}
              </button>
            ) : (
              <button className="button button--ghost" type="button" onClick={() => navigate('/exams')}>
                {t('Choisir un autre niveau', 'Chwazi yon lòt nivo')}
              </button>
            )}
          </div>
        )}

        {/* Detailed results — active search / filters */}
        {!subjectCardView && (filtered.length === 0 ? (
          <div className="card card--message exam-browser__empty">
            <p>{t('Aucun examen trouvé. Essayez de modifier vos filtres.', 'Nou pa jwenn okenn egzamen. Eseye chanje filt ou yo.')}</p>
            {hasActiveFilters && (
              <button
                className="button button--ghost"
                onClick={clearFilters}
                type="button"
              >
                {t('Réinitialiser les filtres', 'Reyinisyalize filt yo')}
              </button>
            )}
          </div>
        ) : (
          <div className="exam-browser__results">
            {/* The count lives in the toolbar now; this row keeps only the
                expand/collapse control. */}
            <div className="exam-browser__results-head">
              {groups.length > 1 && !forceOpen && (
                <button
                  type="button"
                  className="exam-browser__expand-all"
                  onClick={() => setAllOpen(!allOpen)}
                >
                  {allOpen ? t('Tout réduire', 'Fèmen tout') : t('Tout développer', 'Louvri tout')}
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
                    {g.coef != null && <span className="exam-section__coef">{t('Coef.', 'Koef.')} {g.coef}</span>}
                    {g.adaptive && <span className="exam-section__coef">✨ {t('trié pour ton niveau', 'klase pou nivo ou')}</span>}
                    <svg
                      className={`exam-section__chevron ${open ? 'is-open' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {open && (
                    <ul className="exam-subject__list exam-section__list">
                      {g.exams.map((exam) => (
                        <ExamRow
                          key={exam.exam_id || exam._idx}
                          exam={exam}
                          attempt={attempts[examKeyOf(exam)]}
                          onClick={() => navigate(`/exams/${level}/${examKeyOf(exam)}`)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ))}

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

// ── Exam Row Component ──────────────────────────────────────────────────────

/**
 * One compact row per paper — the same row the subject page uses, so the two
 * steps of the path (niveau → matière → épreuve) read as one list.
 *
 * It replaced a grid of equal-weight cards (§7). The cards also could not tell
 * same-session papers apart: eight Bac 2022 maths sujets all headed "Bac
 * permanent", six July 2025 ones all "Bac régulier · Juillet". The row leads
 * with the session name INCLUDING its year and then states the série, the
 * question count, the real timing and the topics actually in the paper.
 *
 * Nothing here is estimated: a paper with no `duration_minutes` says it has no
 * timer, which is what ExamTake does with it.
 */
function ExamRow({ exam, onClick, attempt }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
  const subject = exam._subject || 'Examen';
  const name = sessionRowName(exam, isCreole ? 'ht' : 'fr');

  const qCount = exam._questionCount || 0;
  const duration = exam.duration_minutes || 0;
  const diff = difficultyMeta(exam.difficulty);
  const topicTags = examTopicTags(exam.topics);

  const meta = [
    name.subtitle,
    seriesLabel(exam, isCreole),
    qCount > 0 ? `${qCount} ${t('question', 'kesyon')}${qCount !== 1 ? t('s', '') : ''}` : '',
    duration > 0 ? `${duration} min` : t('non chronométré', 'san kwonomèt'),
  ].filter(Boolean).join(' · ');

  const pct = attempt && typeof attempt.percentage === 'number' ? attempt.percentage : null;
  const tone = pct == null ? '' : pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'low';

  return (
    <li>
      <button
        type="button"
        className="exam-session exam-session--button"
        onClick={onClick}
        aria-label={`${subject} — ${name.title}${attempt ? t(', déjà fait', ', deja fèt') : ''}`}
      >
        <span className="exam-session__body">
          <span className="exam-session__title">{name.title}</span>
          <span className="exam-session__meta">{meta}</span>
          {topicTags.length > 0 && (
            <span className="exam-session__topics">
              {topicTags.map((tag) => (
                <span key={tag} className="exam-session__topic">{tag}</span>
              ))}
            </span>
          )}
        </span>
        {diff && (
          <span className={`exam-session__diff exam-session__diff--${diff.tier}`}>
            {t(diff.label, DIFFICULTY_LABEL_HT[diff.tier])}
          </span>
        )}
        {attempt ? (
          <span className={`exam-session__score exam-session__score--${tone}`}>
            {pct != null ? `${pct}%` : '✓'}
          </span>
        ) : (
          <span className="exam-session__todo">{t('À faire', 'Pou fè')}</span>
        )}
        <ChevronRight size={17} className="exam-session__chevron" aria-hidden="true" />
      </button>
    </li>
  );
}

export default ExamBrowser;
