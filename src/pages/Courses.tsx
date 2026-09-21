import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, ArrowRight, Target, Layers, Check, Search,
  Sigma, Atom, FlaskConical, LineChart, BookOpen, GraduationCap, RefreshCw, WifiOff,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCourses } from '../hooks/useData';
import { loadAppData } from '../services/dataService';
import { useAllProgress, calculateCompletionPercentage } from '../hooks/useProgress';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Skeleton } from '../components/Skeleton';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';
import { GRADES, gradeProfile, type HomeSurface } from '../config/trackConfig';
import { SUBJECT_COVERS } from '../utils/subjectCovers';
import './Courses.css';

const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'ECON'];
const LEVEL_ORDER = ['NSI', 'NSII', 'NSIII', 'NSIV'];

// Friendly glyph per subject — gives each row an identity beyond its name.
const SUBJECT_ICONS = { MATH: Sigma, PHYS: Atom, CHEM: FlaskConical, ECON: LineChart };

/**
 * The store's grade codes ('7e'…'NS4'|'POSTBAC') vs the catalog's level codes
 * ('NSI'…'NSIV'). Only the four Nouveau Secondaire years have courses; the
 * other grades resolve to `undefined` on purpose so the page says so honestly
 * instead of pretending a section exists for them.
 */
const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};

/** Grades whose class actually maps onto a catalog level (used by the picker). */
const GRADES_WITH_COURSES = GRADES.filter((g) => GRADE_TO_LEVEL[g.code]);

/**
 * Where a grade's non-course emphasis lives, so "we have no courses for the
 * 9ᵉ année" can still hand the student a real next step. Keys come from
 * gradeProfile().lead — the one authoritative description of a grade's
 * content emphasis. Only routes that exist are listed; anything unmapped is
 * skipped rather than guessed at.
 */
const SURFACE_ROUTES: Partial<Record<HomeSurface, string>> = {
  exams: '/exams',
  prefac: '/exams',
  quiz: '/quizzes',
  trivia: '/jeux',
  readiness: '/dashboard',
};

/** Cover artwork per subject lives in utils/subjectCovers. */

/** Small square subject thumbnail: real artwork, glyph fallback. */
function SubjectThumb({ code }) {
  const [broken, setBroken] = useState(false);
  const src = SUBJECT_COVERS[code];
  const Icon = SUBJECT_ICONS[code] || BookOpen;
  return (
    <span className="lrn-thumb" aria-hidden="true">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon size={20} strokeWidth={1.8} />
      )}
    </span>
  );
}

function countCourseLessons(course) {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const lessonsCount = units.reduce((sum, u) => sum + (u?.lessons?.length || 0), 0);
  return lessonsCount || units.length || course?.videoCount || 0;
}

function levelLabel(level) {
  return String(level || '').replace(/^NS(.*)$/i, 'NS $1');
}

/**
 * CatalogCourseRow — the one compact course row used at every depth (the
 * student's class section, a level-filtered catalog list, and inside a
 * subject): level/subject, one meta line, progress only when there IS
 * progress, and exactly one action.
 *
 * Same behaviour contract as the card it replaced (click / Enter / Space →
 * course detail, enrolled marker, parent-supplied progress); `lead` decides
 * whether the subject or the level is the row's name, so neither is printed
 * twice on a screen that already says it.
 *
 * A `comingSoon` course renders inert and labelled instead of looking like a
 * link that goes nowhere.
 */
function CatalogCourseRow({ course, stats = null, lead = 'level', enrolled = false, t, L }) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFrench = i18n.language === 'fr';
  const isCreole = i18n.language === 'ht';

  const units = course.modules || [];
  const lessonsCount = units.reduce((sum, u) => sum + (u.lessons?.length || 0), 0);
  // Progress comes from the parent, which prefers cross-device Firestore
  // progress over the local store.
  const pct = stats?.pct ?? 0;
  const doneLessons = stats?.completed ?? 0;
  const totalLessons = stats?.total || lessonsCount || units.length || course.videoCount || 0;
  // Three distinct states, never one "start" button for all of them: untouched
  // (Commencer), in progress (Reprendre — resumes), finished (Revoir — says so
  // and does not pretend there is something left to resume).
  const finished = pct >= 100;
  const started = pct > 0 && !finished;

  const formatDuration = (minutes) => {
    const totalMinutes = parseInt(minutes, 10) || 0;
    if (!totalMinutes) return t('courses.selfPaced');
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hourLabel = isFrench ? 'h' : (isCreole ? 'èdtan' : `hr${hours > 1 ? 's' : ''}`);
    const minuteLabel = isFrench ? 'min' : (isCreole ? 'minit' : 'min');
    if (hours && mins) return `${hours} ${hourLabel} ${mins} ${minuteLabel}`;
    if (hours) return `${hours} ${hourLabel}`;
    return `${mins} ${minuteLabel}`;
  };

  const subjectLabel = t(`subjects.${course.subject}`, { defaultValue: course.subject });
  const lvl = levelLabel(course.level);
  const name = lead === 'subject' ? subjectLabel : lvl;
  const badge = lead === 'subject' ? lvl : null;
  const accent = { '--accent': course.color || 'var(--primary-500)' } as React.CSSProperties;

  const meta = [
    `${units.length} ${t('courses.modules')}`,
    t('courses.lessonsCount', { count: lessonsCount || course.videoCount }),
    formatDuration(course.duration),
    enrolled ? t('courses.enrolled') : '',
  ].filter(Boolean).join(' · ');

  if (course.comingSoon) {
    return (
      <div className="lrn-row lrn-row--soon" style={accent} aria-disabled="true">
        <span className="lrn-row__main">
          <span className="lrn-row__name">
            {name}
            {badge && <span className="lrn-row__badge">{badge}</span>}
          </span>
          <span className="lrn-row__meta">{L('Cours en préparation', 'Kou a ap prepare')}</span>
        </span>
        <span className="lrn-row__soon">{L('Bientôt disponible', 'Byento disponib')}</span>
      </div>
    );
  }

  const goToCourse = () => navigate(`/courses/${course.id}`);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToCourse(); }
  };

  return (
    <article
      className="lrn-row"
      style={accent}
      role="button"
      tabIndex={0}
      onClick={goToCourse}
      onKeyDown={handleKeyDown}
      aria-label={`${subjectLabel} · ${lvl} — ${course.name}`}
    >
      <span className="lrn-row__main">
        <span className="lrn-row__name">
          {name}
          {badge && <span className="lrn-row__badge">{badge}</span>}
          {finished && (
            <span className="lrn-row__done">
              <Check size={12} aria-hidden="true" />
              {t('courses.completed')}
            </span>
          )}
        </span>
        <span className="lrn-row__meta">{meta}</span>
        {/* Progress appears once there IS progress. A 0% bar on every row
            reads as failure, so an untouched course just looks neutral. */}
        {pct > 0 && (
          <span className="lrn-row__progress">
            <span className="progress-bar"><span className="progress-bar__fill" style={{ width: `${pct}%` }} /></span>
            <span className="lrn-row__pct">
              {pct}%
              {totalLessons > 0 && ` · ${doneLessons}/${t('courses.lessonsCount', { count: totalLessons })}`}
            </span>
          </span>
        )}
      </span>
      {/* Deliberately a <span>: the whole row is the click target, so a
          nested <button> would be invalid markup and would announce two
          controls for one destination. */}
      <span className={`lrn-row__cta${started ? ' lrn-row__cta--resume' : ''}`}>
        {finished
          ? L('Revoir', 'Revize')
          : started ? L('Reprendre', 'Kontinye') : t('courses.startCourse')}
        <ArrowRight size={15} aria-hidden="true" />
      </span>
    </article>
  );
}

/**
 * CatalogSubjectRow — a subject is a destination, not content, so its one
 * action opens the subject instead of claiming to "start" or "continue"
 * anything (the actual resume lives in the Reprendre strip and on the course
 * rows). Unavailable subjects never render as a row: see the quiet group at
 * the bottom of the catalog section.
 */
function CatalogSubjectRow({ group, label, lessons, onOpen, t, L }) {
  return (
    <button
      type="button"
      className="lrn-row lrn-row--subject"
      style={{ '--accent': group.accent } as React.CSSProperties}
      onClick={onOpen}
      aria-label={label}
    >
      <SubjectThumb code={group.code} />
      <span className="lrn-row__main">
        <span className="lrn-row__name">{label}</span>
        <span className="lrn-row__meta">
          {[
            t('courses.levelCount', { count: group.items.length }),
            lessons > 0 ? t('courses.lessonsCount', { count: lessons }) : '',
            group.enrolledCount > 0 ? `${group.enrolledCount} ${t('courses.enrolledShort')}` : '',
          ].filter(Boolean).join(' · ')}
        </span>
        {group.pct > 0 && (
          <span className="lrn-row__progress">
            <span className="progress-bar"><span className="progress-bar__fill" style={{ width: `${group.pct}%` }} /></span>
            <span className="lrn-row__pct">
              {group.pct}% · {group.doneLessons}/{t('courses.lessonsCount', { count: group.totalLessons })}
            </span>
          </span>
        )}
      </span>
      <span className="lrn-row__cta">
        {group.items.length === 1
          ? L('Voir le cours', 'Wè kou a')
          : L(`Voir les ${group.items.length} cours`, `Wè ${group.items.length} kou yo`)}
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

/**
 * LevelFilter — a "Niveau" button that opens a small popover list of levels.
 * Lives in the catalog toolbar now, so it is reachable at the depth where the
 * student is actually choosing (it used to appear only after a subject was
 * picked).
 */
function LevelFilter({ value, onChange, levels, hasEnrolled, t, L }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = [
    { value: 'all', label: L('Tous les niveaux', 'Tout nivo yo') },
    ...(hasEnrolled ? [{ value: 'enrolled', label: t('courses.myCourses') }] : []),
    ...levels.map((lvl) => ({ value: lvl, label: levelLabel(lvl) })),
  ];
  const isFiltered = value !== 'all';
  const active = options.find((o) => o.value === value);
  const niveau = L('Niveau', 'Nivo');

  return (
    <div className="level-filter" ref={ref}>
      <button
        type="button"
        className={`level-filter__btn ${isFiltered ? 'level-filter__btn--active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={15} className="level-filter__icon" aria-hidden="true" />
        <span className="level-filter__label">
          {isFiltered ? `${niveau} : ${active?.label}` : niveau}
        </span>
        <ChevronDown size={16} className="level-filter__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="level-filter__menu" role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`level-filter__item ${o.value === value ? 'level-filter__item--active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={15} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Courses — a grade-led catalog.
 *
 * A returning student's own class leads (their level's courses, labelled as
 * theirs); the complete Matière → Niveau → Cours catalog stays open right
 * below, so leading never means filtering things away. Search and the level
 * filter sit in one compact toolbar at the top — the depth where the choice
 * is actually made — and search reuses the app's single SearchOverlay rather
 * than adding a second search over the same index.
 */
export default function Courses() {
  const navigate = useNavigate();
  const { data: courses = [], isLoading, isError, isFetching, refetch } = useCourses();
  const queryClient = useQueryClient();

  // Warm what a course-row click needs — the heavy appData query (video
  // URLs, quizzes) and the CourseDetail chunk — while the learner is still
  // browsing, so the detail page opens instantly even on slow networks.
  useEffect(() => {
    const warm = () => {
      queryClient.prefetchQuery({
        queryKey: ['appData'],
        queryFn: loadAppData,
        staleTime: 5 * 60 * 1000,
      });
      import('./CourseDetail').catch(() => {});
    };
    const idle = (window as any).requestIdleCallback || ((fn) => setTimeout(fn, 300));
    const handle = idle(warm);
    return () => {
      const cancel = (window as any).cancelIdleCallback || clearTimeout;
      cancel(handle);
    };
  }, [queryClient]);
  const [filter, setFilter] = useState('all');
  const [subject, setSubject] = useState('all');

  /**
   * Offline is its own state, not an error: react-query pauses rather than
   * fails when the browser is offline, so a student with a cached catalog sees
   * a page that looks perfectly fresh. We say what is actually usable instead.
   */
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  const enrolledCourses = useStore((s) => s.enrolledCourses);
  const grade = useStore((s) => s.grade);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  /** Local FR/Kreyòl pairs for strings this page owns (see src/utils/i18n.ts
   *  for the shared catalog vocabulary). */
  const L = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
  const { t } = useTranslation();

  const { progress: allProgress } = useAllProgress();
  const progressByCourseId = useMemo(() => {
    const m = new Map();
    for (const p of allProgress || []) if (p?.courseId) m.set(p.courseId, p);
    return m;
  }, [allProgress]);

  // Best-effort progress: prefer cross-device Firestore progress, fall back to
  // the local store so the figures still work while signed out / offline.
  // Returns lesson counts too — the rows show "10/24 leçons" and the resume
  // strip "N% · X leçons restantes", which a bare percentage can't express.
  const courseStats = useCallback((course) => {
    const total = countCourseLessons(course);
    const fp = progressByCourseId.get(course.id);
    if (fp) {
      const completed = Math.min(fp.completedLessons?.length || 0, total || 0);
      return {
        pct: calculateCompletionPercentage(fp, total || 0),
        completed,
        total,
        remaining: Math.max(0, (total || 0) - completed),
      };
    }
    // No local fallback on purpose. There used to be one reading
    // `storeProgress[course.id]` as `{completed, total}`, and it could never
    // fire: the store's `progress` map is keyed by VIDEO id and holds
    // `{completed: boolean, watchTime}` (see its own comment in
    // contexts/store.ts), so `sp.total` was always undefined. It was also
    // unreachable for a second reason — `logout()` clears `progress`, and
    // index.tsx calls it on every signed-out auth callback.
    //
    // §10: "Reuse authoritative state rather than calculating a second
    // contradictory progress model in components." Firestore progress via
    // useAllProgress() is that state, and now it is the only one here.
    return { pct: 0, completed: 0, total, remaining: total };
  }, [progressByCourseId]);

  const coursePercent = useCallback((course) => courseStats(course).pct, [courseStats]);

  const isEnrolled = useCallback(
    (course) => enrolledCourses.some((c) => c.id === course.id),
    [enrolledCourses],
  );

  // Group the catalog by subject — the basis for the Matière → Niveau → Cours flow.
  const subjectGroups = useMemo(() => {
    const map = new Map();
    for (const c of courses) {
      if (!c?.subject) continue;
      if (!map.has(c.subject)) map.set(c.subject, []);
      map.get(c.subject).push(c);
    }
    const list = Array.from(map.entries()).map(([code, items]) => {
      const sorted = [...items].sort(
        (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
      );
      const enrolledItems = sorted.filter(isEnrolled);
      // Aggregate over the whole subject by LESSONS, not by averaging the
      // per-course percentages — 100% of a 4-lesson course and 0% of a
      // 40-lesson one is not "50% of the subject".
      let doneLessons = 0;
      let totalLessons = 0;
      for (const c of sorted) {
        const st = courseStats(c);
        doneLessons += st.completed;
        totalLessons += st.total;
      }
      const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
      const resume = sorted.find((c) => { const p = coursePercent(c); return p > 0 && p < 100; }) || null;
      return {
        code,
        items: sorted,
        accent: sorted[0]?.color || 'var(--primary-500)',
        enrolledCount: enrolledItems.length,
        pct,
        doneLessons,
        totalLessons,
        resume,
        // Whole subject not yet migrated — listed apart as "bientôt", never
        // as a row that looks tappable.
        comingSoon: sorted.length > 0 && sorted.every((c) => c.comingSoon),
      };
    });
    list.sort((a, b) => {
      const ia = SUBJECT_ORDER.indexOf(a.code); const ib = SUBJECT_ORDER.indexOf(b.code);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return list;
  }, [courses, isEnrolled, coursePercent, courseStats]);

  const subjectName = useCallback(
    (code) => t(`subjects.${code}`, { defaultValue: code }),
    [t],
  );

  const goToSubjects = () => { setSubject('all'); };

  if (isLoading) {
    return (
      <section className="section">
        <div className="container">
          {/* Loading keeps the page's real identity — the student can already
              read where they are instead of watching an anonymous grey page.
              Only the list that is genuinely unknown is a skeleton. */}
          <div className="page-header page-header--no-eyebrow courses-header">
            <div className="courses-header__lead">
              <span className="courses-header__eyebrow">{t('nav.learn')}</span>
              <h1 className="courses-header__title">{t('courses.catalog')}</h1>
              <p className="text-muted courses-header__sub" role="status">
                {L('Chargement du catalogue…', 'N ap chaje katalòg la…')}
              </p>
            </div>
          </div>
          {/* Row-shaped skeletons so the loading state has the shape of the
              list it becomes, not of the cards this page no longer uses. */}
          <div className="lrn-rows">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lrn-row lrn-row--skeleton">
                <Skeleton width={40} height={40} radius={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Skeleton width="45%" height={16} style={{ marginBottom: '0.5rem' }} />
                  <Skeleton width="70%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError && courses.length === 0) {
    return (
      <section className="section">
        <div className="container">
          {/* The failure keeps the page's context, so a student knows what did
              not load. ErrorState supplies the plain-language message (and the
              offline variant of it) plus the retry; the second action keeps a
              way forward instead of a dead end. */}
          <div className="page-header page-header--no-eyebrow courses-header">
            <div className="courses-header__lead">
              <span className="courses-header__eyebrow">{t('nav.learn')}</span>
              <h1 className="courses-header__title">{t('courses.catalog')}</h1>
            </div>
          </div>
          <ErrorState
            onRetry={() => refetch()}
            retrying={isFetching}
            action={{ label: t('nav.home'), onClick: () => navigate('/') }}
          />
        </div>
      </section>
    );
  }

  // Selected subject (level view). When none is chosen we show the catalog.
  const activeGroup = subject !== 'all' ? subjectGroups.find((g) => g.code === subject) : null;
  const subjectLabelFull = activeGroup ? subjectName(activeGroup.code) : '';

  // Every level present in the catalog — the filter's options at both depths.
  const allLevels: string[] = [
    ...new Set<string>(courses.map((c) => String(c?.level || '')).filter(Boolean)),
  ].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  const levelsForSubject = activeGroup
    ? [...new Set(activeGroup.items.map((c) => c.level))].sort(
        (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
      )
    : allLevels;

  const matchesFilter = (c) => {
    if (filter === 'enrolled') return isEnrolled(c);
    if (filter.startsWith('NS')) return c.level === filter;
    return true;
  };

  const levelViewCourses = activeGroup ? activeGroup.items.filter(matchesFilter) : [];

  // ── The student's own class leads ──────────────────────────────────────
  // Their grade comes from the store (set at first run / in the profile) and
  // maps onto exactly one catalog level. Nothing is inferred: with no grade
  // we ask, and with a grade we have no courses for we say so.
  const myLevel = grade ? GRADE_TO_LEVEL[grade] : undefined;
  const myGradeLabel = grade
    ? (() => {
        const g = GRADES.find((x) => x.code === grade);
        return g ? (isCreole ? g.labelHt : g.label) : grade;
      })()
    : '';
  const myCourses = myLevel
    ? courses.filter((c) => c.level === myLevel && !c.comingSoon)
    : [];
  // A grade we can't serve with courses still has a real next step — read it
  // off gradeProfile() rather than inventing one.
  const gradeFallback = (() => {
    if (!grade || myCourses.length > 0) return null;
    const lead = gradeProfile(grade).lead.find((s) => s !== 'cours' && SURFACE_ROUTES[s]);
    if (!lead) return null;
    const labels: Partial<Record<HomeSurface, string>> = {
      exams: L('Voir les examens', 'Gade egzamen yo'),
      prefac: L('Voir les concours', 'Gade konkou yo'),
      quiz: L('Faire un quiz', 'Fè yon quiz'),
      trivia: L('Jouer', 'Jwe'),
      readiness: L('Voir mon tableau de bord', 'Gade tablodbò mwen'),
    };
    return { label: labels[lead] as string, to: SURFACE_ROUTES[lead] as string };
  })();

  // ── Filter applied from the toolbar with no subject picked ─────────────
  // The filter has to do something at the depth where it is offered, so it
  // flattens the catalog instead of waiting for a subject.
  const catalogFilterActive = !activeGroup && filter !== 'all';
  const filteredCatalog = catalogFilterActive ? courses.filter(matchesFilter) : [];

  // In-progress courses leading the page. Built from the authoritative
  // progress map as well as the enrolled list, so a student who has watched
  // lessons on another device still gets their resume row.
  const resumeCourses = (() => {
    const seen = new Set<string>();
    const pool: any[] = [];
    for (const c of enrolledCourses) {
      const full = courses.find((x) => x.id === c.id) || c;
      if (full?.id && !seen.has(full.id)) { seen.add(full.id); pool.push(full); }
    }
    for (const c of courses) {
      if (c?.id && !seen.has(c.id) && progressByCourseId.has(c.id)) { seen.add(c.id); pool.push(c); }
    }
    return pool
      .map((c) => ({ course: c, stats: courseStats(c) }))
      .filter(({ stats }) => stats.pct > 0 && stats.pct < 100)
      .sort((a, b) => b.stats.pct - a.stats.pct)
      .slice(0, 1);
  })();

  const availableGroups = subjectGroups.filter((g) => !g.comingSoon);
  const soonGroups = subjectGroups.filter((g) => g.comingSoon);
  const hasAnyEnrolled = enrolledCourses.length > 0;

  const searchButton = (
    <button
      type="button"
      className="lrn-search"
      onClick={() => setSearchOpen(true)}
      aria-label={t('courses.searchLabel')}
    >
      <Search size={16} aria-hidden="true" />
      <span className="lrn-search__text">
        {L('Rechercher un cours, une leçon…', 'Chèche yon kou, yon leson…')}
      </span>
      <kbd className="lrn-search__kbd" aria-hidden="true">⌘K</kbd>
    </button>
  );

  return (
    <section className="section">
      <div className="container">
        {/* Header — adapts to the active view (catalog / level) */}
        <div className="page-header page-header--no-eyebrow courses-header">
          <div className="courses-header__lead">
            <span className="courses-header__eyebrow">{t('nav.learn')}</span>
            {activeGroup ? (
              <>
                <button type="button" className="courses-breadcrumb" onClick={goToSubjects}>
                  <ChevronLeft size={16} /> {t('courses.backToSubjects')}
                </button>
                <h1 className="courses-header__title" style={{ color: activeGroup.accent }}>
                  {subjectLabelFull}
                </h1>
                <button
                  type="button"
                  className="button button--ghost button--sm courses-header__practice"
                  onClick={() => navigate(`/quizzes?course=${activeGroup.code}`)}
                >
                  <Target size={15} /> {t('courses.practiceCta')}
                </button>
              </>
            ) : myCourses.length > 0 ? (
              <>
                <h1 className="courses-header__title">{L('Vos cours', 'Kou ou yo')}</h1>
                <p className="text-muted courses-header__sub">
                  {L(
                    `Nous commençons par ${levelLabel(myLevel)}, votre classe. Tout le catalogue reste juste en dessous.`,
                    `Nou kòmanse ak ${levelLabel(myLevel)}, klas ou a. Tout katalòg la rete anba a.`,
                  )}
                </p>
              </>
            ) : (
              <>
                <h1 className="courses-header__title">{t('courses.chooseSubject')}</h1>
                <p className="text-muted courses-header__sub">{t('courses.chooseSubjectSubtitle')}</p>
              </>
            )}
          </div>
        </div>

        {/* Toolbar — search + level filter, one compact line, at every depth */}
        <div className="lrn-toolbar">
          {searchButton}
          <LevelFilter
            value={filter}
            onChange={setFilter}
            levels={levelsForSubject}
            hasEnrolled={activeGroup ? activeGroup.enrolledCount > 0 : hasAnyEnrolled}
            t={t}
            L={L}
          />
        </div>

        {/* Offline with a catalog on hand. The app-wide NetworkStatus banner
            already announces "hors ligne", so this line does not repeat it: it
            says what this page can still do and what needs the network. No
            promise of offline lessons, because none is implemented. */}
        {!online && courses.length > 0 && (
          <p className="lrn-stale lrn-stale--offline" role="status">
            <WifiOff size={15} aria-hidden="true" />
            <span>
              {L(
                'Catalogue enregistré : vous pouvez parcourir les cours. La mise à jour de la liste et les vidéos des leçons demandent une connexion.',
                'Katalòg ki sere a : ou ka gade kou yo. Mizajou lis la ak videyo leson yo mande koneksyon.',
              )}
            </span>
          </p>
        )}

        {/* Cached catalog with a failed refresh — say so rather than passing
            stale content off as fresh. */}
        {online && isError && courses.length > 0 && (
          <p className="lrn-stale" role="status">
            <span>
              {L(
                'Catalogue affiché depuis la copie enregistrée — la mise à jour a échoué.',
                'Katalòg la soti nan kopi ki sere a — mizajou a pa mache.',
              )}
            </span>
            <button type="button" className="lrn-stale__retry" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={14} aria-hidden="true" />
              {isFetching ? L('Mise à jour…', 'N ap mete ajou…') : L('Réessayer', 'Eseye ankò')}
            </button>
          </p>
        )}

        {/* Content */}
        {activeGroup ? (
          levelViewCourses.length > 0 ? (
            <div className="lrn-rows">
              {levelViewCourses.map((course) => (
                <CatalogCourseRow
                  key={course.id}
                  course={course}
                  stats={courseStats(course)}
                  lead="level"
                  enrolled={isEnrolled(course)}
                  t={t}
                  L={L}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t('courses.noCoursesTitle')}
              message={t('courses.noCoursesSubtitle')}
              action={{ label: t('courses.resetFilters'), onClick: () => setFilter('all') }}
            />
          )
        ) : catalogFilterActive ? (
          /* Toolbar filter with no subject chosen — a flat list across the
             whole catalog, so the filter is useful where it is offered. */
          filteredCatalog.length > 0 ? (
            <>
              <h2 className="lrn-section__title lrn-section__title--flat">
                {filter === 'enrolled'
                  ? t('courses.myCourses')
                  : L(`Cours de ${levelLabel(filter)}`, `Kou ${levelLabel(filter)}`)}
                <span className="lrn-count">{filteredCatalog.length}</span>
              </h2>
              <div className="lrn-rows">
                {filteredCatalog.map((course) => (
                  <CatalogCourseRow
                    key={course.id}
                    course={course}
                    stats={courseStats(course)}
                    lead="subject"
                    enrolled={isEnrolled(course)}
                    t={t}
                    L={L}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title={t('courses.noCoursesTitle')}
              message={t('courses.noCoursesSubtitle')}
              action={{ label: t('courses.resetFilters'), onClick: () => setFilter('all') }}
            />
          )
        ) : (
          <>
            {resumeCourses.length > 0 && (
              <div className="courses-resume courses-resume--lead" data-reveal>
                <h2 className="courses-resume__title">{t('courses.resumeTitle')}</h2>
                <div className="courses-resume__list">
                  {resumeCourses.map(({ course, stats }) => (
                    /* The whole row stays the click target (it always was),
                       so the CTA is a styled span rather than a nested
                       <button> — nesting interactive elements here would be
                       invalid markup and give screen readers two controls
                       for one destination. */
                    <button
                      key={course.id}
                      type="button"
                      className="resume-course"
                      style={{ '--course-accent': course.color || 'var(--primary-500)' } as React.CSSProperties}
                      onClick={() => navigate(`/courses/${course.id}`)}
                    >
                      {SUBJECT_COVERS[course.subject] && (
                        <img
                          className="resume-course__thumb"
                          src={SUBJECT_COVERS[course.subject]}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <span className="resume-course__info">
                        <span className="resume-course__name">{course.name || course.title}</span>
                        <span className="resume-course__meta">
                          {subjectName(course.subject)} · {levelLabel(course.level)}
                        </span>
                        <span className="progress-bar resume-course__bar">
                          <span className="progress-bar__fill" style={{ width: `${stats.pct}%` }} />
                        </span>
                        <span className="resume-course__remaining">
                          {stats.pct}%
                          {stats.remaining > 0
                            ? ` · ${t('courses.lessonsRemaining', { count: stats.remaining })}`
                            : ''}
                        </span>
                      </span>
                      <span className="resume-course__cta">
                        {L('Reprendre', 'Kontinye')} <ArrowRight size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── The student's class, first and named as theirs ── */}
            {myCourses.length > 0 && (
              <section className="lrn-section lrn-section--mine" aria-labelledby="lrn-mine">
                <h2 className="lrn-section__title" id="lrn-mine">
                  {L('Pour votre classe', 'Pou klas ou')}
                  <span className="lrn-badge">{levelLabel(myLevel)}</span>
                </h2>
                <div className="lrn-rows lrn-rows--flush">
                  {myCourses.map((course) => (
                    <CatalogCourseRow
                      key={course.id}
                      course={course}
                      stats={courseStats(course)}
                      lead="subject"
                      enrolled={isEnrolled(course)}
                      t={t}
                      L={L}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* No grade yet → ask once, honestly, and never block the catalog */}
            {!grade && (
              <section className="lrn-ask" aria-labelledby="lrn-ask-title">
                <h2 className="lrn-ask__title" id="lrn-ask-title">
                  <GraduationCap size={18} aria-hidden="true" />
                  {L('Vous êtes en quelle classe ?', 'Ki klas ou ye ?')}
                </h2>
                <p className="lrn-ask__sub">
                  {L(
                    'Nous mettrons vos cours en premier. Tout le catalogue reste visible en dessous.',
                    'N ap mete kou ou yo an premye. Tout katalòg la ap rete vizib anba a.',
                  )}
                </p>
                <div className="lrn-ask__chips">
                  {GRADES_WITH_COURSES.map((g) => (
                    <button
                      key={g.code}
                      type="button"
                      className="lrn-ask__chip"
                      onClick={() => { setGrade(g.code); setGradeChosen(true); }}
                    >
                      {isCreole ? g.labelHt : g.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Grade known, but the catalog has nothing at that level yet */}
            {grade && myCourses.length === 0 && (
              <section className="lrn-ask lrn-ask--none" aria-labelledby="lrn-none-title">
                {/* The grade is a badge, not part of the sentence: inlining it
                    produced "pour la Après le Bac (Préfac)" for the grades
                    whose label is not a feminine noun. */}
                <h2 className="lrn-ask__title" id="lrn-none-title">
                  <GraduationCap size={18} aria-hidden="true" />
                  {L('Pas encore de cours pour votre classe', 'Poko gen kou pou klas ou')}
                  <span className="lrn-badge">{myGradeLabel}</span>
                </h2>
                <p className="lrn-ask__sub">
                  {L(
                    'Le catalogue couvre pour l’instant le Nouveau Secondaire. Vous pouvez tout consulter ci-dessous.',
                    'Katalòg la kouvri Nouvo Segondè pou kounye a. Ou ka gade tout bagay anba a.',
                  )}
                </p>
                {gradeFallback && (
                  <button
                    type="button"
                    className="button button--sm lrn-ask__go"
                    onClick={() => navigate(gradeFallback.to)}
                  >
                    {gradeFallback.label} <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </section>
            )}

            {/* ── Everything else — always reachable, never filtered away ── */}
            <section className="lrn-section" aria-labelledby="lrn-all">
              <h2 className="lrn-section__title" id="lrn-all">
                {myCourses.length > 0
                  ? L('Tout le catalogue', 'Tout katalòg la')
                  : L('Toutes les matières', 'Tout matyè yo')}
              </h2>
              {availableGroups.length > 0 ? (
                <div className="lrn-rows">
                  {availableGroups.map((g) => (
                    <CatalogSubjectRow
                      key={g.code}
                      group={g}
                      label={subjectName(g.code)}
                      lessons={g.items.reduce((sum, c) => sum + countCourseLessons(c), 0)}
                      onOpen={() => setSubject(g.code)}
                      t={t}
                      L={L}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={L('Le catalogue est vide pour l’instant', 'Katalòg la vid pou kounye a')}
                  message={L(
                    'Aucune matière n’est encore publiée. Vous pouvez vous entraîner avec les quiz en attendant.',
                    'Pa gen matyè ki pibliye ankò. Ou ka pratike ak quiz yo pandan n ap tann.',
                  )}
                  action={{ label: t('courses.practiceCta'), onClick: () => navigate('/quizzes') }}
                />
              )}

              {/* Unavailable subjects: listed so they are not a surprise, but
                  visibly secondary and never dressed up as a link. */}
              {soonGroups.length > 0 && (
                <div className="lrn-soon">
                  <span className="lrn-soon__label">{L('Bientôt disponible', 'Byento disponib')}</span>
                  <ul className="lrn-soon__list">
                    {soonGroups.map((g) => (
                      <li key={g.code} className="lrn-soon__item">
                        <span className="lrn-soon__name">{subjectName(g.code)}</span>
                        <span className="lrn-soon__note">
                          {L('cours en préparation', 'kou a ap prepare')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
