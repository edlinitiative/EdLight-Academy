import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import LearnSwitch from '../components/LearnSwitch';
import {
  ChevronRight, ChevronDown, ArrowRight, Check, Search, X,
  Sigma, Atom, FlaskConical, LineChart, BookOpen, RefreshCw, WifiOff, PlayCircle,
} from '../components/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useCourses } from '../hooks/useData';
import { loadAppData } from '../services/dataService';
import { useAllProgress, calculateCompletionPercentage } from '../hooks/useProgress';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Skeleton } from '../components/Skeleton';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';
import { SUBJECT_COVERS } from '../utils/subjectCovers';
import { firstThumb } from '../utils/videoThumb';
import { courseCover } from '../utils/courseCovers';
import '../styles/pf.css';
import './Courses.css';
import LearnWorkspace from './courses/LearnWorkspace';

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

const ID_TO_LEVEL: Record<string, string> = {
  ns1: 'NSI', ns2: 'NSII', ns3: 'NSIII', ns4: 'NSIV',
};

/** The numeral a level card wears in its tile — the mockups open every row
 *  with one, and the catalogue's levels are already Roman. */
const LEVEL_NUMERAL: Record<string, string> = {
  NSI: 'I', NSII: 'II', NSIII: 'III', NSIV: 'IV',
};

/**
 * The course ID is the trustworthy source of a course's level.
 *
 * The live Firestore document for `math-ns4` carries `level_id: 'ns3'` — a
 * data bug. dataService already sidesteps it (it parses `course.id` to build
 * `course.level`), and this page grouping by level depends on that being
 * true: read `level_id` anywhere and Mathématiques renders two identical
 * "NS III" pills and loses NS IV entirely. So we re-derive from the ID here
 * too and only fall back to `course.level` for an ID we don't recognise.
 * Flagged separately as a data fix; the UI must not depend on it landing.
 */
function courseLevel(course): string {
  const fromId = ID_TO_LEVEL[String(course?.id || '').split('-')[1]?.toLowerCase()];
  return fromId || String(course?.level || '');
}

/** Cover artwork per subject lives in utils/subjectCovers. */

/**
 * One pf tone per subject. The mockups gave each discipline its own pastel
 * icon tile, and pf.css already ships six measured tone pairs — so the
 * subject picks a tone rather than a new hue, and the page introduces no
 * colour the design system has not already measured at AA in both themes.
 */
const SUBJECT_TONE: Record<string, string> = {
  MATH: 'azure', PHYS: 'violet', CHEM: 'emerald', ECON: 'amber',
};
const toneFor = (code) => SUBJECT_TONE[code] || 'slate';

/** The mockups' pastel icon tile, per subject. */
function SubjectTile({ code, size = 'md' }) {
  const Icon = SUBJECT_ICONS[code] || BookOpen;
  const px = size === 'lg' ? 24 : size === 'sm' ? 15 : 20;
  return (
    <span className={`pf-tile pf-tile--${size} pf-tile--${toneFor(code)}`} aria-hidden="true">
      <Icon size={px} strokeWidth={1.9} />
    </span>
  );
}

/**
 * A pf meter that grows from zero on mount rather than arriving full — a bar
 * that is already full reads as a rule, not as progress. The animation is the
 * 700ms width transition pf.css declares (and drops under
 * prefers-reduced-motion); this only supplies the "from".
 */
function Meter({ pct, tone = 'azure', label = undefined as string | undefined }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span
      className={`pf-meter pf-meter--${tone}`}
      role="img"
      aria-label={label}
    >
      <span className="pf-meter__fill" style={{ width: `${grown ? pct : 0}%` }} />
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

/** Accent-insensitive, case-insensitive haystack — "interet" finds "Intérêt". */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * LevelPill — the level, encoded by how much of the one azure fills it.
 *
 * NS I → NS IV get progressively heavier washes of --primary-500 rather than
 * four different hues: the app has exactly one accent colour, and four hues
 * would invent a colour language the rest of Estil Klè does not speak. The
 * mix percentages stay low enough that --primary-700 label text clears AA on
 * the resulting background in both the light and the night palette.
 */
function LevelPill({ level, className = '' }) {
  return (
    <span className={`lrn-lvl ${className}`} data-level={level}>
      {levelLabel(level)}
    </span>
  );
}

/**
 * UnitList — the catalogue's 49 real units, with their real titles and their
 * real lesson counts, read straight off `course.modules`.
 *
 * This is the one thing /courses never showed: it stopped at subject → level,
 * so a student could not see that "Économie NS2" contains "La Monnaie et le
 * Système Bancaire" without opening the course. A unit links to its first
 * unfinished lesson (`?lesson=<id>`, the deep link CourseDetail restores),
 * which is the closest thing to "resume this chapter" the data supports.
 */
function UnitList({ course, units, progress, onOpenLesson, t }) {
  const completed: string[] = progress?.completedLessons || [];
  return (
    <ul className="lrn-units">
      {units.map((unit, i) => {
        const lessons = unit.lessons || [];
        const doneCount = completed.length
          ? lessons.filter((l) => completed.includes(l?.id)).length
          : 0;
        const next = lessons.find((l) => !completed.includes(l?.id)) || lessons[0];
        const full = lessons.length > 0 && doneCount === lessons.length;
        return (
          <li key={unit.id || `${course.id}-u${i}`}>
            <button
              type="button"
              className="lrn-unit"
              onClick={() => onOpenLesson(course, next)}
              aria-label={`${unit.title} — ${t('courses.lessonsCount', { count: lessons.length })}${
                full ? ` · ${t('courses.completed')}` : ''}`}
            >
              {/* Units are a genuine ordered sequence (Firestore stores
                  `order`), so a plain numeral helps scanning. The mockups put
                  that numeral in a tile — done units swap it for the tick, so
                  the state is carried by the same slot. */}
              <span
                className={`pf-tile pf-tile--sm ${full ? 'pf-tile--emerald' : 'pf-tile--azure'} lrn-unit__n`}
                aria-hidden="true"
              >
                {full ? <Check size={14} strokeWidth={2.6} /> : i + 1}
              </span>
              <span className="lrn-unit__body">
                <span className="lrn-unit__title">{unit.title}</span>
                {doneCount > 0 && (
                  /* Only ever shown when this student has real, signed-in
                     progress on this course — never a 0/N on every unit. */
                  <span className="lrn-unit__meta">
                    {`${doneCount}/${lessons.length} ${t('courses.completed').toLowerCase()}`}
                  </span>
                )}
              </span>
              <span className={`pf-pill pf-pill--${full ? 'emerald' : 'slate'} lrn-unit__pill`}>
                {t('courses.lessonsCount', { count: lessons.length })}
              </span>
              <ChevronRight size={15} className="pf-row__chev lrn-unit__go" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * CourseRow — one compact course row used at every depth, now openable.
 *
 * Two controls, never nested: the head opens the unit list in place (the
 * mockups' best idea — you can see what a course contains before committing
 * to it), and the CTA enters the course. `lead` decides whether the subject
 * or the level is the row's name, so neither is printed twice on a screen
 * that already says it.
 *
 * A `comingSoon` course renders inert and labelled instead of looking like a
 * link that goes nowhere.
 */
function CourseRow({
  course, stats = null, lead = 'level', enrolled = false,
  progress = null, units = null, forceOpen = false, onOpenLesson, t, L,
}) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFrench = i18n.language === 'fr';
  const isCreole = i18n.language === 'ht';
  const [open, setOpen] = useState(false);

  const allUnits = course.modules || [];
  // When a search is running the row shows only the units that matched, and
  // opens itself — otherwise the student has to guess which one hit.
  const shownUnits = units || allUnits;
  const expanded = forceOpen || open;

  const lessonsCount = allUnits.reduce((sum, u) => sum + (u.lessons?.length || 0), 0);
  // Progress comes from the parent, which uses Firestore progress only.
  const pct = stats?.pct ?? 0;
  const doneLessons = stats?.completed ?? 0;
  const totalLessons = stats?.total || lessonsCount || allUnits.length || course.videoCount || 0;
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
  const lvl = courseLevel(course);
  const name = lead === 'subject' ? subjectLabel : levelLabel(lvl);
  const accent = { '--accent': course.color || 'var(--primary-500)' } as React.CSSProperties;

  // The lesson total is promoted out of this line into the card's own figure
  // (the mockups' right-hand count), so the line is not a second copy of it.
  const meta = [
    allUnits.length > 0 ? t('courses.modulesCount', { count: allUnits.length }) : '',
    formatDuration(course.duration),
    enrolled ? t('courses.enrolled') : '',
  ].filter(Boolean).join(' · ');

  if (course.comingSoon) {
    return (
      <div className="lrn-row lrn-row--soon" style={accent} aria-disabled="true">
        <SubjectTile code={course.subject} />
        <span className="lrn-row__main">
          <span className="lrn-row__name">
            {name}
            {lead === 'subject' && <LevelPill level={lvl} />}
          </span>
          <span className="lrn-row__meta">{L('Cours en préparation', 'Kou a ap prepare')}</span>
        </span>
        <span className="pf-pill pf-pill--slate lrn-row__soon">
          {L('Bientôt disponible', 'Byento disponib')}
        </span>
      </div>
    );
  }

  const goToCourse = () => navigate(`/courses/${course.id}`);
  const panelId = `units-${course.id}`;
  const hasUnits = shownUnits.length > 0;

  return (
    <article
      className={`lrn-row lrn-row--course${expanded ? ' lrn-row--open' : ''}`}
      style={accent}
    >
      <div className="lrn-row__head">
        {/* The head is a disclosure, the CTA is the navigation. Two siblings,
            so neither control is nested inside the other. */}
        <button
          type="button"
          className="lrn-row__main lrn-row__disclose"
          onClick={() => hasUnits && setOpen((o) => !o)}
          aria-expanded={hasUnits ? expanded : undefined}
          aria-controls={hasUnits ? panelId : undefined}
          disabled={!hasUnits}
        >
          <span className="lrn-row__lead">
            {lead === 'subject' ? (
              <SubjectTile code={course.subject} />
            ) : (
              /* Grouped by subject, the card IS a level — so the tile carries
                 its numeral, the way the mockups open every row with one. */
              <span className="pf-tile pf-tile--md pf-tile--azure lrn-row__roman" aria-hidden="true">
                {LEVEL_NUMERAL[lvl] || levelLabel(lvl)}
              </span>
            )}
            <span className="lrn-row__text">
              <span className="lrn-row__name">
                {name}
                {lead === 'subject' && <LevelPill level={lvl} />}
                {finished && (
                  <span className="pf-pill pf-pill--emerald lrn-row__done">
                    <Check size={12} aria-hidden="true" />
                    {t('courses.completed')}
                  </span>
                )}
              </span>
              {meta && <span className="lrn-row__meta">{meta}</span>}
            </span>
          </span>
          {/* Progress appears once there IS progress. A 0% bar on every row
              reads as failure, so an untouched course just looks neutral. */}
          {pct > 0 && (
            <span className="lrn-row__progress">
              <Meter
                pct={pct}
                label={`${pct}% — ${subjectLabel} ${levelLabel(lvl)}`}
              />
              <span className="lrn-row__pct">
                {pct}%
                {totalLessons > 0 && ` · ${doneLessons}/${t('courses.lessonsCount', { count: totalLessons })}`}
              </span>
            </span>
          )}
          {hasUnits && (
            <span className="lrn-row__toggle">
              <ChevronDown size={14} aria-hidden="true" />
              {expanded
                ? L('Masquer les modules', 'Kache modil yo')
                : L(`Voir les ${shownUnits.length} modules`, `Wè ${shownUnits.length} modil yo`)}
            </span>
          )}
        </button>
        <div className="lrn-row__aside">
          {/* The mockups' right-hand figure. Both numbers are counted off
              `course.modules` — the same array the panel below lists. */}
          {totalLessons > 0 && (
            <span
              className="lrn-row__figure"
              role="img"
              aria-label={t('courses.lessonsCount', { count: totalLessons })}
            >
              <span className="lrn-row__figure-n" aria-hidden="true">{totalLessons}</span>
              <span className="pf-eyebrow lrn-row__figure-label" aria-hidden="true">
                {L(totalLessons > 1 ? 'leçons' : 'leçon', 'leson')}
              </span>
            </span>
          )}
          <button
            type="button"
            className={`lrn-row__cta${started ? ' lrn-row__cta--resume' : ''}`}
            onClick={goToCourse}
            aria-label={`${finished ? L('Revoir', 'Revize') : started ? L('Reprendre', 'Kontinye') : t('courses.startCourse')} — ${subjectLabel} ${levelLabel(lvl)}`}
          >
            {finished
              ? L('Revoir', 'Revize')
              : started ? L('Reprendre', 'Kontinye') : t('courses.startCourse')}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {expanded && hasUnits && (
        <div className="lrn-row__panel" id={panelId}>
          <UnitList
            course={course}
            units={shownUnits}
            progress={progress}
            onOpenLesson={onOpenLesson}
            t={t}
          />
        </div>
      )}
    </article>
  );
}

export default function Courses({ mode = 'catalog' }: { mode?: 'catalog' | 'workspace' } = {}) {
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

  // ── Facet + search state lives in the query string ──────────────────────
  // "Visible and persistent" has to mean it survives a reload and a shared
  // link, not just a re-render.
  const [searchParams, setSearchParams] = useSearchParams();
  const subject = searchParams.get('matiere') || 'all';
  const level = searchParams.get('niveau') || 'all';
  const mine = searchParams.get('mes') === '1';
  const axis = searchParams.get('vue') === 'niveau' ? 'level' : 'subject';
  const query = searchParams.get('q') || '';

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === '' || value === 'all') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const resetFacets = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      ['matiere', 'niveau', 'mes', 'q'].forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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
  const signedIn = useStore((s) => !!s.user?.uid);
  const grade = useStore((s) => s.grade);
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

  // Progress comes from one place. Returns lesson counts too — the rows show
  // "10/24 leçons" and the resume strip "N% · X leçons restantes", which a
  // bare percentage can't express.
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

  const isEnrolled = useCallback(
    (course) => enrolledCourses.some((c) => c.id === course.id),
    [enrolledCourses],
  );

  const subjectName = useCallback(
    (code) => t(`subjects.${code}`, { defaultValue: code }),
    [t],
  );

  /** Open a unit at its first unfinished lesson — CourseDetail restores `?lesson=`. */
  const openLesson = useCallback((course, lesson) => {
    navigate(lesson?.id
      ? `/courses/${course.id}?lesson=${encodeURIComponent(lesson.id)}`
      : `/courses/${course.id}`);
  }, [navigate]);

  // ── Search over course names, module titles and lesson titles ───────────
  // Matching is accent-insensitive so "interet simple" finds "L'Intérêt
  // Simple". A matching course carries its matching modules with it, so the
  // row can open straight onto the module that hit.
  const searched = useMemo(() => {
    const q = norm(query.trim());
    return courses.map((c) => {
      if (!q) return { course: c, units: null as any[] | null, hit: true };
      const units = (c.modules || []).filter((u) =>
        norm(u.title).includes(q)
        || (u.lessons || []).some((l) => norm(l?.title).includes(q)));
      const headline = norm(`${c.name || ''} ${subjectName(c.subject)} ${levelLabel(courseLevel(c))}`);
      const hit = headline.includes(q) || units.length > 0;
      return { course: c, units: units.length > 0 ? units : null, hit };
    }).filter((r) => r.hit);
  }, [courses, query, subjectName]);

  /** Everything the search kept, before the two facets narrow it further. */
  const searchedCourses = useMemo(() => searched.map((r) => r.course), [searched]);
  const unitsFor = useCallback(
    (id) => searched.find((r) => r.course.id === id)?.units || null,
    [searched],
  );

  const matchesMine = useCallback((c) => !mine || isEnrolled(c), [mine, isEnrolled]);

  /** The courses left after search + both facets — what the list renders. */
  const visible = useMemo(() => searchedCourses.filter((c) =>
    matchesMine(c)
    && (subject === 'all' || c.subject === subject)
    && (level === 'all' || courseLevel(c) === level)), [searchedCourses, subject, level, matchesMine]);

  // Facet options come from the catalogue, never from a hardcoded list.
  const subjectOptions = useMemo(() => {
    const codes: string[] = [
      ...new Set<string>(courses.map((c) => String(c?.subject || '')).filter(Boolean)),
    ];
    codes.sort((a, b) => {
      const ia = SUBJECT_ORDER.indexOf(a); const ib = SUBJECT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return codes.map((code) => ({ code, label: subjectName(code) }));
  }, [courses, subjectName]);

  const levelOptions = useMemo(() => {
    const lv: string[] = [...new Set<string>(courses.map(courseLevel).filter(Boolean))];
    return lv.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  }, [courses]);

  if (isLoading) {
    return (
      <section className="section pf lrn">
        <div className="container">
          {/* Loading keeps the page's real identity — the student can already
              read where they are instead of watching an anonymous grey page.
              Only the list that is genuinely unknown is a skeleton. */}
          {/* Same compact header as the loaded page, so the title does not
              resize under the reader when the catalogue arrives. */}
          <header className="lrn-head">
            <div className="lrn-head__line">
              <h1 className="lrn-head__title">{t('courses.catalog')}</h1>
              <p className="lrn-head__note" role="status">
                {L('Chargement du catalogue…', 'N ap chaje katalòg la…')}
              </p>
            </div>
          </header>
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
      <section className="section pf lrn">
        <div className="container">
          {/* The failure keeps the page's context, so a student knows what did
              not load. ErrorState supplies the plain-language message (and the
              offline variant of it) plus the retry; the second action keeps a
              way forward instead of a dead end. */}
          <header className="lrn-head">
            <div className="lrn-head__line">
              <h1 className="lrn-head__title">{t('courses.catalog')}</h1>
            </div>
          </header>
          <ErrorState
            onRetry={() => refetch()}
            retrying={isFetching}
            action={{ label: t('nav.home'), onClick: () => navigate('/') }}
          />
        </div>
      </section>
    );
  }

  // The student's own class, marked « Ta classe » on its course cards.
  const myLevel = grade ? GRADE_TO_LEVEL[grade] : undefined;
  const activeFacets = (subject !== 'all' ? 1 : 0) + (level !== 'all' ? 1 : 0) + (mine ? 1 : 0);
  const filtering = activeFacets > 0 || query.trim().length > 0;

  // ── Grouping: the two axes the catalogue genuinely has ─────────────────
  // Subject and level are both real dimensions of this data, and a student
  // arrives with one or the other in mind ("I need chemistry" / "I'm in
  // NS3"), so the list can be read either way instead of forcing one.
  const groupsFor = (list) => {
    const map = new Map<string, any[]>();
    for (const c of list) {
      const key = axis === 'level' ? courseLevel(c) : c.subject;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const order = axis === 'level' ? LEVEL_ORDER : SUBJECT_ORDER;
    return [...map.entries()]
      .map(([key, items]) => {
        const sorted = [...items].sort((a, b) => (axis === 'level'
          ? (SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject))
          : (LEVEL_ORDER.indexOf(courseLevel(a)) - LEVEL_ORDER.indexOf(courseLevel(b)))));
        const liveItems = sorted.filter((c) => !c.comingSoon);
        return {
          key,
          items: sorted,
          allSoon: sorted.length > 0 && liveItems.length === 0,
          lessons: liveItems.reduce((n, c) => n + countCourseLessons(c), 0),
          units: liveItems.reduce((n, c) => n + (c.modules?.length || 0), 0),
        };
      })
      .sort((a, b) => {
        const ia = order.indexOf(a.key); const ib = order.indexOf(b.key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  };

  const groups = groupsFor(visible);
  // A subject with nothing migrated yet stays visible and inert — listed as
  // "bientôt", never dressed up as a link — unless the student has explicitly
  // asked for it, in which case they get its levels, still inert.
  const liveGroups = groups.filter((g) => !g.allSoon || subject !== 'all' || axis === 'level');
  const soonGroups = (subject === 'all' && axis === 'subject') ? groups.filter((g) => g.allSoon) : [];

  const groupLabel = (key) => (axis === 'level' ? levelLabel(key) : subjectName(key));


  // /dashboard — Ted: "use this [the 'Espace de travail' mockup] to change the
  // dashboard … the actual dashboard /dashboard", while the signed-in home
  // ("/") keeps its own layout. The workspace needs the catalogue helpers this
  // page already computes, so /dashboard renders this page in workspace mode:
  // the student's workspace alone, no catalogue under it.
  if (mode === 'workspace') {
    if (!signedIn) return <Navigate to="/" replace />;
    return (
      <section className="section pf lrn lrn--workspace">
        <div className="container">
          <h1 className="lrn-sr-title">{L('Espace de travail', 'Espas travay')}</h1>
          {courses.length > 0 && (
            <LearnWorkspace
              courses={courses}
              courseStats={courseStats}
              courseLevel={courseLevel}
              subjectName={subjectName}
              levelLabel={levelLabel}
              myLevel={myLevel}
              progressByCourseId={progressByCourseId}
              SubjectTile={SubjectTile as any}
              L={L}
            />
          )}
        </div>
      </section>
    );
  }

  // Course cards open on a real frame of the course's own lessons (YouTube
  // already hosts one for every video); the subject cover is the fallback.
  const coverFor = (course) => {
    const chosen = courseCover(course.id);
    if (chosen) return chosen;
    // A third of the way in: first lessons often open on a title card or an
    // app screen, a few lessons later the frame is the board being worked.
    const lessons = (course.modules || []).flatMap((m) => m?.lessons || []);
    const from = Math.floor(lessons.length / 3);
    return firstThumb([...lessons.slice(from), ...lessons.slice(0, from)], 'hq')?.src || null;
  };
  const durationOf = (course) => {
    const min = (course.modules || []).reduce((n, m) => n + (Number(m?.duration_minutes) || 0), 0)
      || Number(course.duration_minutes) || 0;
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
  };
  const searching = query.trim().length > 0;
  const heroMode = false; // no hero band (Ted): title, search, chips, then the courses
  const liveCourses = courses.filter((c) => !c.comingSoon);
  const liveTotals = {
    courses: liveCourses.length,
    subjects: new Set(liveCourses.map((c) => c.subject)).size,
    lessons: liveCourses.reduce((n, c) => n + countCourseLessons(c), 0),
  };
  // One frame per subject for the hero fan — the first course with a real frame.
  const heroFrames = (() => {
    const out: { course: any; src: string }[] = [];
    const seen = new Set<string>();
    for (const c of [...liveCourses].sort((a, b) => SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject))) {
      if (seen.has(c.subject)) continue;
      const src = coverFor(c);
      if (src) { out.push({ course: c, src }); seen.add(c.subject); }
      if (out.length === 3) break;
    }
    return out;
  })();

  return (
    <section className="section pf lrn lrn--clean">
      <div className="container">
        <LearnSwitch />
        {/* The catalogue only. The signed-in workspace lives on "/" and
            /dashboard; repeating it here made /courses open on the same screen
            as "/". */}
        {/* One title, one search, one row of filters — then the courses. */}
        <header className={`cl-head${heroMode ? ' cl-hero' : ''}`}>
          <div className="cl-hero__copy">
          {heroMode && <p className="cl-over">{L('Programme du MENFP · Nouveau Secondaire', 'Pwogram MENFP · Nouvo Segondè')}</p>}
          <h1 className="cl-head__title">{heroMode ? L('Chaque leçon du programme, en vidéo.', 'Chak leson nan pwogram nan, an videyo.') : L('Cours', 'Kou')}</h1>
          <p className="cl-head__lede">
            {heroMode
              ? L('Chaque notion expliquée au tableau, chapitre par chapitre. Regarde, puis entraîne-toi.', 'Chak nosyon esplike sou tablo a, chapit pa chapit. Gade, epi pratike.')
              : L('Le programme du Nouveau Secondaire, en vidéos, leçon par leçon.', 'Pwogram Nouvo Segondè a, an videyo, leson pa leson.')}
          </p>
          {heroMode && liveTotals.lessons > 0 && (
            <dl className="cl-facts">
              <div><dt>{L('leçons', 'leson')}</dt><dd>{liveTotals.lessons}</dd></div>
              <div><dt>{L('cours', 'kou')}</dt><dd>{liveTotals.courses}</dd></div>
              <div><dt>{L('matières', 'matyè')}</dt><dd>{liveTotals.subjects}</dd></div>
            </dl>
          )}
          <div className="cl-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder={L('Chercher une leçon, un chapitre…', 'Chèche yon leson, yon chapit…')}
              aria-label={t('courses.searchLabel')}
            />
            {query && (
              <button type="button" className="cl-search__clear" onClick={() => setParam('q', null)}
                aria-label={L('Effacer la recherche', 'Efase rechèch la')}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="cl-filters">
            <div className="cl-chips" role="group" aria-label={L('Matière', 'Matyè')}>
              <button type="button" className={`cl-chip${subject === 'all' ? ' is-on' : ''}`} aria-pressed={subject === 'all'}
                onClick={() => setParam('matiere', null)}>{L('Toutes les matières', 'Tout matyè')}</button>
              {subjectOptions.filter(({ code }) => courses.some((c) => c.subject === code && !c.comingSoon)).map(({ code, label }) => (
                <button key={code} type="button" className={`cl-chip${subject === code ? ' is-on' : ''}`} aria-pressed={subject === code}
                  onClick={() => setParam('matiere', subject === code ? null : code)}>{label}</button>
              ))}
            </div>
            <div className="cl-chips" role="group" aria-label={L('Classe', 'Klas')}>
              {levelOptions.map((lv) => (
                <button key={lv} type="button" className={`cl-chip cl-chip--level${level === lv ? ' is-on' : ''}`} aria-pressed={level === lv}
                  onClick={() => setParam('niveau', level === lv ? null : lv)}>{levelLabel(lv)}</button>
              ))}
            </div>
          </div>
          </div>
          {heroMode && heroFrames.length > 0 && (
            <div className="cl-fan" aria-hidden="true">
              {heroFrames.map(({ course, src }, i) => (
                <button key={course.id} type="button" tabIndex={-1} className={`cl-fan__card cl-fan__card--${i}`} onClick={() => navigate(`/courses/${course.id}`)}>
                  <img src={src} alt="" />
                  <span className="cl-fan__label">{subjectName(course.subject)} · {levelLabel(courseLevel(course))}</span>
                  {i === 0 && <span className="cl-fan__play"><PlayCircle size={34} /></span>}
                </button>
              ))}
            </div>
          )}
        </header>

        {!online && courses.length > 0 && (
          <p className="lrn-stale lrn-stale--offline" role="status">
            <WifiOff size={15} aria-hidden="true" />
            <span>
              {L(
                'Catalogue enregistré : tu peux parcourir les cours. Les vidéos des leçons demandent une connexion.',
                'Katalòg ki sere a : ou ka gade kou yo. Videyo leson yo mande koneksyon.',
              )}
            </span>
          </p>
        )}
        {online && isError && courses.length > 0 && (
          <p className="lrn-stale" role="status">
            <span>{L('Catalogue affiché depuis la copie enregistrée — la mise à jour a échoué.', 'Katalòg la soti nan kopi ki sere a — mizajou a pa mache.')}</span>
            <button type="button" className="lrn-stale__retry" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={14} aria-hidden="true" />
              {isFetching ? L('Mise à jour…', 'N ap mete ajou…') : L('Réessayer', 'Eseye ankò')}
            </button>
          </p>
        )}

        {visible.length === 0 ? (
          filtering ? (
            <EmptyState
              title={searching
                ? L(`Aucun résultat pour « ${query.trim()} »`, `Pa gen rezilta pou « ${query.trim()} »`)
                : t('courses.noCoursesTitle')}
              message={L(
                'La recherche couvre les noms de cours, les chapitres et les titres de leçons.',
                'Rechèch la gade non kou yo, chapit yo ak tit leson yo.',
              )}
              action={{ label: t('courses.resetFilters'), onClick: resetFacets }}
              secondaryAction={{ label: L('Chercher dans toute l’app', 'Chèche nan tout app la'), onClick: () => setSearchOpen(true) }}
            />
          ) : (
            <EmptyState
              title={L('Le catalogue est vide pour l’instant', 'Katalòg la vid pou kounye a')}
              message={L('Aucune matière n’est encore publiée.', 'Pa gen matyè ki pibliye ankò.')}
              action={{ label: t('courses.practiceCta'), onClick: () => navigate('/quizzes') }}
            />
          )
        ) : searching ? (
          /* Searching: the rows open on the matching chapters and lessons. */
          <div className="lrn-rows cl-search-results">
            {visible.map((course) => (
              <CourseRow
                key={course.id}
                course={course}
                stats={courseStats(course)}
                progress={progressByCourseId.get(course.id)}
                lead="subject"
                enrolled={isEnrolled(course)}
                units={unitsFor(course.id)}
                forceOpen={Boolean(unitsFor(course.id))}
                onOpenLesson={openLesson}
                t={t}
                L={L}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Fullest subjects first, so a one-course subject closes the
                page instead of punching a hole in the middle of it. */}
            {[...liveGroups].sort((a, b) => b.items.filter((c) => !c.comingSoon).length - a.items.filter((c) => !c.comingSoon).length).map((g) => (
              <section key={g.key} className={`cl-group cl-shelf cl-shelf--${g.key}`} aria-labelledby={`grp-${g.key}`}>
                <div className="cl-shelf__head">
                  <h2 className="cl-group__title" id={`grp-${g.key}`}>
                    <SubjectTile code={g.key} size="md" />
                    {groupLabel(g.key)}
                  </h2>
                  <span className="cl-shelf__meta">
                    {[
                      g.lessons > 0 ? t('courses.lessonsCount', { count: g.lessons }) : '',
                      L(`${g.items.filter((c) => !c.comingSoon).length} classe${g.items.filter((c) => !c.comingSoon).length > 1 ? 's' : ''}`, `${g.items.filter((c) => !c.comingSoon).length} klas`),
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="cl-grid">
                  {g.items.filter((c) => !c.comingSoon).map((course) => {
                    const st = courseStats(course);
                    const lvl = courseLevel(course);
                    const cover = coverFor(course);
                    const mineHere = !!myLevel && lvl === myLevel;
                    const dur = durationOf(course);
                    return (
                      <button key={course.id} type="button" className={`cl-card cl-card--${course.subject}`} onClick={() => navigate(`/courses/${course.id}`)}>
                        <span className="cl-card__cover">
                          {cover
                            ? <img src={cover} alt="" loading="lazy" />
                            : SUBJECT_COVERS[course.subject] ? <img src={SUBJECT_COVERS[course.subject]} alt="" loading="lazy" /> : null}
                          <span className="cl-card__level">{levelLabel(lvl)}</span>
                          {mineHere && <span className="cl-card__mine">{L('Ta classe', 'Klas ou')}</span>}
                          <span className="cl-card__play" aria-hidden="true"><PlayCircle size={22} /></span>
                        </span>
                        <span className="cl-card__body">
                          <strong>{subjectName(course.subject)} {levelLabel(lvl)}</strong>
                          <span>{[t('courses.lessonsCount', { count: st.total || countCourseLessons(course) }), dur].filter(Boolean).join(' · ')}</span>
                          {st.pct > 0 && (
                            <span className="cl-card__progress">
                              <Meter pct={st.pct} label={`${st.pct}%`} />
                              <small>{st.pct >= 100 ? L('Terminé', 'Fini') : `${st.pct}%`}</small>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {soonGroups.length > 0 && (
              <p className="cl-soon">
                {L('Bientôt :', 'Byento :')} {soonGroups.map((g) => groupLabel(g.key)).join(', ')}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
