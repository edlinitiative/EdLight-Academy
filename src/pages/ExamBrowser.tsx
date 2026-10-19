import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, SlidersHorizontal, ChevronRight, ChevronDown } from '../components/icons';
import useStore from '../contexts/store';
import { TRACKS, TRACK_BY_CODE, getCoefficient, DEFAULT_SUBJECT_ORDER, gradeProfile } from '../config/trackConfig';
import TrackSelector from '../components/TrackSelector';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { buildExamIndex, subjectColor } from '../utils/examUtils';
import { examTopicTags } from '../../shared/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { URL_LEVEL_TO_RAW, RAW_LEVEL_TO_URL, LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import './examPremium.css';
import { deriveSignals, selectAdaptiveItems, type AttemptEvent } from '../services/adaptiveEngine';
import { Skeleton } from '../components/Skeleton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

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

/** gradeProfile().examLevel → this browser's level URL keys, so a student's
 *  grade can pick the default pool (POSTBAC → université concours, 9e → 9ème).
 *  The slug↔raw maps and the bilingual level names come from `examLevels` —
 *  this file used to keep private copies, and its label map was French-only,
 *  so the crumb and the h1 stayed "Baccalauréat" in Kreyòl. */
const EXAM_LEVEL_TO_ROUTE = RAW_LEVEL_TO_URL;

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
  /** Bilingual name of a level slug ('' when the slug isn't one we know). */
  const slugLabel = (slug) => LEVEL_SLUG_LABELS[slug || '']?.[isCreole ? 'ht' : 'fr'] || '';
  /** Bilingual name of a RAW catalog level ('baccalaureat' → "Bakaloreya"). */
  const rawLevelLabel = (raw) => slugLabel(RAW_LEVEL_TO_URL[raw || '']);
  // Read at render time, not stored: a failed fetch while the browser reports
  // no connection is a different state from a server/parse failure (§8).
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

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

  // Is the visible pool a single level? It is whenever the level chip resolves
  // to one raw catalog level; it is NOT in the "all levels" escape, nor for an
  // unmapped :level segment, where the index falls back to every exam.
  const oneLevel = !!URL_LEVEL_TO_RAW[activeLevel || ''];

  // Group filtered exams into subject sections, ordered by the active track's
  // coefficient (most-weighted subject first), else a sensible default order.
  //
  // The bucket key carries the LEVEL as well as the subject whenever more than
  // one level is in view. Ten of the seventeen catalog subjects exist at two or
  // three levels (Mathématiques at 9ᵉ, Bac and université), and a subject row
  // leads to a page that only ever lists one of them — so a single merged row
  // would both over-count its papers and land on a level the student did not
  // pick. With one level in view the key is just the subject, as before.
  const groups = useMemo(() => {
    if (!filtered.length) return [];
    const bucket = new Map();
    for (const e of filtered) {
      const subject = e._subject || 'Autre';
      const rawLevel = String(e.level || '');
      const key = oneLevel ? subject : `${subject}\u0000${rawLevel}`;
      if (!bucket.has(key)) bucket.set(key, { key, subject, rawLevel, exams: [] });
      bucket.get(key).exams.push(e);
    }
    const arr = [...bucket.values()].map(({ key, subject, rawLevel, exams }) => {
      // Within a subject we know the student's level in, order papers by
      // challenge fit (stretch the strong, on-ramp the rest); else year-desc.
      const a = ability[subject] ?? 0;
      return {
        key,
        subject,
        rawLevel,
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
  }, [filtered, activeTrack, ability, oneLevel]);

  // Default expansion: open the highest-priority section(s) up to a small card
  // budget, so the page opens as a scannable "table of contents".
  const defaultOpen = useMemo(() => {
    const set = new Set();
    let budget = PAGE_SIZE;
    for (const g of groups) {
      if (set.size === 0 || budget > 0) {
        set.add(g.key);
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
    (key) => forceOpen || openSet.has(key),
    [forceOpen, openSet]
  );
  const toggleSection = useCallback((key) => {
    setOpenSubjects((prev) => {
      const base = openTouched ? prev : defaultOpen;
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setOpenTouched(true);
  }, [openTouched, defaultOpen]);
  const allOpen = groups.length > 0 && groups.every((g) => openSet.has(g.key));
  const setAllOpen = useCallback((open) => {
    setOpenSubjects(open ? new Set(groups.map((g) => g.key)) : new Set());
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

  const levelTitle = activeLevel === 'all'
    ? t('Tous les examens', 'Tout egzamen')
    : (slugLabel(activeLevel) || t('Examens nationaux', 'Egzamen nasyonal'));

  if (isLoading) {
    return (
      <div className="xp">
        <div className="xp-page xp-page--narrow">
          <LoadingState className="xp-skel" label={t('Chargement des examens…', 'N ap chaje egzamen yo…')}>
            <Skeleton width={200} height={16} radius={999} />
            <Skeleton width="45%" height={40} radius={12} />
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} width="100%" height={84} radius={18} />)}
          </LoadingState>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="xp">
        <div className="xp-page xp-page--narrow">
          <h1 className="xp-title">{t('Examens', 'Egzamen')}</h1>
          {/* Plain language + a safe recovery action (§8). Offline is its own
              state: the service worker keeps this index in DATA_CACHE. */}
          <ErrorState
            headingLevel={2}
            title={isOffline ? t('Hors ligne', 'Pa sou entènèt') : t('Catalogue indisponible', 'Katalòg la pa disponib')}
            message={isOffline
              ? t('Tu es hors ligne et la liste des examens n’est pas encore enregistrée sur cet appareil. Connecte-toi une fois pour la charger : ensuite elle reste consultable hors ligne.',
                'Ou pa sou entènèt e lis egzamen yo poko anrejistre sou aparèy sa a. Konekte yon fwa pou chaje l : apre sa ou ka gade l san entènèt.')
              : t('Nous n’avons pas pu charger le catalogue d’examens. Vérifie ta connexion, puis réessaie.',
                'Nou pa t ka chaje katalòg egzamen an. Tcheke koneksyon ou, epi eseye ankò.')}
            offlineTitle={t('Hors ligne', 'Pa sou entènèt')}
            offlineMessage={t('Tu es hors ligne et la liste des examens n’est pas encore enregistrée sur cet appareil. Connecte-toi une fois pour la charger : ensuite elle reste consultable hors ligne.',
              'Ou pa sou entènèt e lis egzamen yo poko anrejistre sou aparèy sa a. Konekte yon fwa pou chaje l : apre sa ou ka gade l san entènèt.')}
            onRetry={() => { void refetch(); }}
            retryLabel={t('Réessayer', 'Eseye ankò')}
            action={{ label: t('Tous les niveaux', 'Tout nivo yo'), onClick: () => navigate('/exams') }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="xp">
      <div className="xp-page xp-page--narrow">
        <header className="xp-head">
          <div>
            {/* Same trail as the subject and exam pages. */}
            <nav className="xp-crumbs" aria-label={t('Fil d’Ariane', 'Chemen')}>
              <Link to="/exams">{t('Examens', 'Egzamen')}</Link>
              <span aria-hidden>›</span>
              <span aria-current="page">{levelTitle}</span>
            </nav>
            <h1 className="xp-title">{levelTitle}</h1>
            {/* What the rows lead to, and whether a result is kept — once. */}
            <p className="xp-lede">
              {t('Des épreuves complètes, pas des quiz rapides.', 'Epwèv konplè, se pa ti kiz.')}
              {' '}
              {userId
                ? t('Tes résultats sont enregistrés.', 'Rezilta ou yo anrejistre.')
                : <>
                    {t('Sans compte, tes résultats ne sont pas gardés.', 'San kont, rezilta ou pa kenbe.')}{' '}
                    <button type="button" className="xp-link" onClick={() => setShowAuthModal(true)}>{t('Se connecter', 'Konekte')}</button>
                  </>}
            </p>
          </div>

          {/* Grade-curated level context, with a one-tap escape. */}
          {curatedLevel && (
            <div className="xp-note" role="status">
              <div>
                <strong>{activeLevel === curatedLevel ? slugLabel(curatedLevel) : t('Tous les niveaux', 'Tout nivo')}</strong>
                <span>{activeLevel === curatedLevel ? t('Adapté à ton profil', 'Adapte pou pwofil ou') : t('Affichage de tous les examens', 'N ap montre tout egzamen')}</span>
              </div>
              <button type="button" className="xp-btn xp-btn--tonal xp-btn--sm" onClick={toggleLevel}>
                {activeLevel === curatedLevel ? t('Voir tous les niveaux', 'Wè tout nivo') : t('Mon niveau', 'Nivo mwen')}
              </button>
            </div>
          )}

          {offLevel && (
            <div className="xp-note" role="status">
              <div>
                <strong>{t('Pas encore ton niveau', 'Poko nivo ou')}</strong>
                <span>{t('Les examens nationaux commencent en 9ᵉ AF. Tu peux consulter ces épreuves librement.', 'Egzamen nasyonal yo kòmanse nan 9yèm ane. Ou lib pou gade epwèv sa yo.')}</span>
              </div>
              <Link to="/quizzes" className="xp-btn xp-btn--tonal xp-btn--sm">{t('Faire un quiz', 'Fè yon kiz')}</Link>
            </div>
          )}

          {/* Toolbar: search, status, filters, live count. */}
          <div className="xp-tools">
            <label className="xp-search">
              <Search size={18} aria-hidden="true" />
              <input
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
                <button type="button" className="xp-search__clear" onClick={() => setSearch('')} aria-label={t('Effacer la recherche', 'Efase rechèch la')}>
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
            <div className="xp-seg" role="group" aria-label={t('Filtrer par statut', 'Filtre dapre eta')}>
              <button type="button" aria-pressed={!statusFilter} onClick={() => setStatusFilter('')}>{t('Tous', 'Tout')}</button>
              <button type="button" aria-pressed={statusFilter === 'todo'} onClick={() => setStatusFilter(statusFilter === 'todo' ? '' : 'todo')}>{t('À faire', 'Pou fè')}</button>
              <button type="button" aria-pressed={statusFilter === 'done'} onClick={() => setStatusFilter(statusFilter === 'done' ? '' : 'done')}
                disabled={summary.done === 0 && statusFilter !== 'done'}>{t('Terminés', 'Fini')}</button>
            </div>
          </div>
          <div className="xp-tools">
            <div className="xp-chips">
              <button type="button" className="xp-chip" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
                <SlidersHorizontal size={15} aria-hidden="true" /> {t('Filtres', 'Filt')}{dropdownCount > 0 ? <b>{dropdownCount}</b> : null}
              </button>
              {hasActiveFilters && (
                <button className="xp-chip" onClick={clearFilters} type="button">
                  <X size={14} aria-hidden="true" /> {t('Effacer', 'Efase')}
                </button>
              )}
            </div>
            <span className="xp-meta">
              {summary.exams} {t('examen', 'egzamen')}{summary.exams !== 1 ? t('s', '') : ''}
              {summary.done > 0 && <> · {summary.done} {t('terminé', 'fini')}{summary.done !== 1 ? t('s', '') : ''}</>}
            </span>
          </div>

          {showFilters && (
            <div className="xp-chips">
              <select className="xp-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label={t('Filtrer par matière', 'Filtre dapre matyè')}>
                <option value="">{t('Toutes les matières', 'Tout matyè')}</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="xp-select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label={t('Filtrer par année', 'Filtre dapre ane')}>
                <option value="">{t('Toutes les années', 'Tout ane')}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="xp-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label={t('Filtrer par difficulté', 'Filtre dapre difikilte')}>
                <option value="">{t('Toute difficulté', 'Tout difikilte')}</option>
                <option value="easy">{t('Facile', 'Fasil')}</option>
                <option value="medium">{t('Moyen', 'Mwayen')}</option>
                <option value="hard">{t('Difficile', 'Difisil')}</option>
              </select>
            </div>
          )}

          {/* Filière chips — Baccalauréat only. */}
          {isTerminale && (
            <div className="xp-chips" role="group" aria-label={t('Filière', 'Filyè')}>
              <span className="xp-label">{t('Filière', 'Filyè')}</span>
              <button className="xp-chip" aria-pressed={!trackFilter} onClick={() => setTrackFilter('')} type="button">{t('Toutes', 'Tout')}</button>
              {TRACKS.map((tr) => (
                <button key={tr.code} className="xp-chip" aria-pressed={trackFilter === tr.code}
                  onClick={() => setTrackFilter(trackFilter === tr.code ? '' : tr.code)} type="button">
                  {tr.shortLabel}
                </button>
              ))}
              {!userTrack && isAuthenticated && (
                <button className="xp-link" onClick={() => setShowTrackSelector(true)} type="button">{t('Définir ma filière', 'Chwazi filyè m')}</button>
              )}
            </div>
          )}
        </header>

        {/* Clean browse: one row per subject, led by its real paper count. */}
        {subjectCardView && groups.length > 0 && (
          <ul className="xp-rows">
            {groups.map((g) => {
              const done = g.exams.reduce((n, e) => n + (attempts[examKeyOf(e)] ? 1 : 0), 0);
              const best = g.exams.reduce((mx, e) => {
                const p = attempts[examKeyOf(e)]?.percentage;
                return typeof p === 'number' && p > mx ? p : mx;
              }, -1);
              const span = yearRange(g.exams);
              // The row's own level, not the :level segment (a curated 9ᵉ page
              // must not send the student to Bac papers).
              const groupSlug = RAW_LEVEL_TO_URL[g.rawLevel] || activeLevel || level;
              const groupLevel = oneLevel ? '' : rawLevelLabel(g.rawLevel);
              const meta = [
                groupLevel,
                span,
                g.coef != null ? `${t('coef.', 'koef.')} ${g.coef}` : '',
                done > 0 ? `${done}/${g.exams.length} ${t('terminés', 'fini')}${best >= 0 ? ` · ${t('meilleur', 'pi bon')} ${best} %` : ''}` : '',
              ].filter(Boolean).join(' · ');
              return (
                <li key={g.key}>
                  <Link className="xp-row" to={`/exams/${groupSlug}/matiere/${encodeURIComponent(g.subject)}`}>
                    <span className="xp-row__lead">{g.exams.length}<small>{g.exams.length === 1 ? t('sujet', 'sijè') : t('sujets', 'sijè')}</small></span>
                    <span className="xp-row__body">
                      <span className="xp-row__title">{g.subject}</span>
                      {meta && <span className="xp-row__meta">{meta}</span>}
                    </span>
                    <ChevronRight size={18} className="xp-row__chev" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* An empty pool says what happened and offers a way out (§8). */}
        {subjectCardView && groups.length === 0 && (
          <EmptyState
            headingLevel={2}
            title={trackFilter
              ? t('Aucune épreuve pour cette filière à ce niveau.', 'Pa gen egzamen pou filyè sa a nan nivo sa a.')
              : t('Aucune épreuve disponible pour ce niveau pour le moment.', 'Pa gen egzamen disponib pou nivo sa a pou kounye a.')}
            action={trackFilter
              ? { label: t('Voir toutes les filières', 'Wè tout filyè yo'), onClick: () => setTrackFilter(''), variant: 'secondary' }
              : { label: t('Choisir un autre niveau', 'Chwazi yon lòt nivo'), onClick: () => navigate('/exams'), variant: 'secondary' }}
          />
        )}

        {/* Detailed results — active search / filters */}
        {!subjectCardView && (filtered.length === 0 ? (
          <EmptyState
            headingLevel={2}
            title={t('Aucun examen trouvé', 'Nou pa jwenn okenn egzamen')}
            message={t('Essaie de modifier tes filtres.', 'Eseye chanje filt ou yo.')}
            action={hasActiveFilters
              ? { label: t('Réinitialiser les filtres', 'Reyinisyalize filt yo'), onClick: clearFilters, variant: 'secondary' }
              : { label: t('Choisir un autre niveau', 'Chwazi yon lòt nivo'), onClick: () => navigate('/exams'), variant: 'secondary' }}
          />
        ) : (
          <div className="xp-section">
            {groups.length > 1 && !forceOpen && (
              <button type="button" className="xp-link" style={{ alignSelf: 'flex-end' }} onClick={() => setAllOpen(!allOpen)}>
                {allOpen ? t('Tout réduire', 'Fèmen tout') : t('Tout développer', 'Louvri tout')}
              </button>
            )}
            {groups.map((g) => {
              const open = isSectionOpen(g.key);
              const groupLevel = oneLevel ? '' : rawLevelLabel(g.rawLevel);
              return (
                <section key={g.key} className="xp-section" style={{ gap: 12 }}>
                  <button type="button" className="xp-group__head" onClick={() => toggleSection(g.key)} aria-expanded={open} disabled={forceOpen}>
                    <span className="xp-group__name">{g.subject}</span>
                    <span className="xp-pill">{g.exams.length}</span>
                    {groupLevel && <span className="xp-meta">{groupLevel}</span>}
                    {g.coef != null && <span className="xp-meta">{t('Coef.', 'Koef.')} {g.coef}</span>}
                    {g.adaptive && <span className="xp-meta">{t('Trié pour ton niveau', 'Klase pou nivo ou')}</span>}
                    <ChevronDown size={18} className={`xp-group__chev ${open ? 'is-open' : ''}`} aria-hidden="true" />
                  </button>
                  {open && (
                    <ul className="xp-rows">
                      {g.exams.map((exam) => (
                        <ExamRow
                          key={exam.exam_id || exam._idx}
                          exam={exam}
                          attempt={attempts[examKeyOf(exam)]}
                          // The paper's own level, so the overview's crumb names it.
                          onClick={() => navigate(`/exams/${levelToSlug(exam.level) || level}/${examKeyOf(exam)}`)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ))}

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
    </div>
  );
};

// ── Exam Row Component ──────────────────────────────────────────────────────

/**
 * One row per paper, led by its year — the same row the subject page uses.
 * The session name, série, question count, real timing and the topics in the
 * paper are what tell same-session papers apart. Nothing is estimated: a
 * paper with no `duration_minutes` says it has no timer.
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
  const year = /^\d{4}$/.test(String(exam.year)) ? String(exam.year) : '';

  const meta = [
    name.subtitle,
    seriesLabel(exam, isCreole),
    qCount > 0 ? `${qCount} ${t('question', 'kesyon')}${qCount !== 1 ? t('s', '') : ''}` : '',
    duration > 0 ? `${duration} min` : t('non chronométré', 'san kwonomèt'),
    diff ? t(diff.label, DIFFICULTY_LABEL_HT[diff.tier]) : '',
  ].filter(Boolean).join(' · ');

  const pct = attempt && typeof attempt.percentage === 'number' ? attempt.percentage : null;

  return (
    <li>
      <button
        type="button"
        className="xp-row"
        onClick={onClick}
        aria-label={`${subject} — ${name.title}${attempt ? t(', déjà fait', ', deja fèt') : ''}`}
      >
        <span className={`xp-row__lead${attempt ? ' xp-row__lead--mint' : ''}`}>{year || '—'}</span>
        <span className="xp-row__body">
          <span className="xp-row__title">{name.title}</span>
          <span className="xp-row__meta">{meta}</span>
          {topicTags.length > 0 && (
            <span className="xp-row__tags">
              {topicTags.map((tag) => <span key={tag} className="xp-row__tag">{tag}</span>)}
            </span>
          )}
          {attempt && <span className="xp-pill xp-pill--mint xp-row__status">{pct != null ? t(`Score ${pct} %`, `Nòt ${pct} %`) : t('Fait', 'Fèt')}</span>}
        </span>
        <span className="xp-row__end">
          <ChevronRight size={18} className="xp-row__chev" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

export default ExamBrowser;
