import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, ArrowRight, Target, Check, Search, X, SlidersHorizontal,
  Sigma, Atom, FlaskConical, LineChart, BookOpen, GraduationCap, RefreshCw, WifiOff,
  Layers, PlayCircle, Library,
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
import '../styles/pf.css';
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

/**
 * Facets — subject × level, visible and persistent rather than hidden behind
 * a popover. The catalogue genuinely has two axes and the strongest version
 * of this in the mockups is a standing sidebar, so on desktop that is what it
 * is; under 900px it collapses to one "Filtres" disclosure so it never eats
 * the first screen on a phone.
 *
 * Every count is computed from the loaded catalogue against the *other*
 * facet, so a number here can never promise courses a click will not produce.
 */
function Facets({
  subject, level, mine, onSubject, onLevel, onMine, subjectCounts, levelCounts,
  subjects, levels, hasEnrolled, activeCount, onReset, t, L,
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="lrn-facets" aria-label={L('Filtres du catalogue', 'Filtè katalòg la')}>
      <button
        type="button"
        className="lrn-facets__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        {L('Filtres', 'Filtè')}
        {activeCount > 0 && <span className="lrn-count">{activeCount}</span>}
        <ChevronDown size={16} className="lrn-facets__chev" aria-hidden="true" />
      </button>

      <div className={`lrn-facets__body pf-card${open ? ' lrn-facets__body--open' : ''}`}>
        {/* The mockups' rail header: what this panel is, and the one control
            that undoes it, side by side. */}
        <div className="pf-head lrn-facets__head">
          <div className="pf-head__text">
            <span className="pf-eyebrow">{L('Catalogue', 'Katalòg')}</span>
            <h2 className="pf-head__title">{L('Filtres', 'Filtè')}</h2>
          </div>
          {activeCount > 0 && (
            <button type="button" className="pf-link lrn-facets__reset" onClick={onReset}>
              <X size={13} aria-hidden="true" />
              {t('courses.resetFilters')}
            </button>
          )}
        </div>

        <div className="lrn-facet">
          <h2 className="lrn-facet__title pf-eyebrow">{L('Matière', 'Matyè')}</h2>
          <ul className="lrn-facet__list">
            <li>
              <button
                type="button"
                className={`lrn-facet__opt${subject === 'all' ? ' lrn-facet__opt--on' : ''}`}
                aria-pressed={subject === 'all'}
                onClick={() => onSubject('all')}
              >
                <span className="pf-tile pf-tile--sm pf-tile--slate" aria-hidden="true">
                  <Library size={15} strokeWidth={1.9} />
                </span>
                <span className="lrn-facet__name">{L('Toutes les matières', 'Tout matyè yo')}</span>
                <span className="lrn-facet__n">{subjectCounts.live.all}</span>
              </button>
            </li>
            {subjects.map((s) => {
              const n = subjectCounts.live[s.code] || 0;
              const soon = subjectCounts.pending[s.code] || 0;
              return (
                <li key={s.code}>
                  {/* A facet with nothing behind it at all is disabled rather
                      than offered. One whose courses are merely unreleased
                      stays clickable — the list has something to say about
                      them — but it is labelled, not numbered. */}
                  <button
                    type="button"
                    className={`lrn-facet__opt${subject === s.code ? ' lrn-facet__opt--on' : ''}`}
                    aria-pressed={subject === s.code}
                    disabled={n === 0 && soon === 0 && subject !== s.code}
                    onClick={() => onSubject(s.code)}
                  >
                    <SubjectTile code={s.code} size="sm" />
                    <span className="lrn-facet__name">{s.label}</span>
                    {n > 0
                      ? <span className="lrn-facet__n">{n}</span>
                      : <span className="lrn-facet__n lrn-facet__n--soon">{L('bientôt', 'talè')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lrn-facet">
          <h2 className="lrn-facet__title pf-eyebrow">{L('Niveau', 'Nivo')}</h2>
          <ul className="lrn-facet__list">
            <li>
              <button
                type="button"
                className={`lrn-facet__opt${level === 'all' ? ' lrn-facet__opt--on' : ''}`}
                aria-pressed={level === 'all'}
                onClick={() => onLevel('all')}
              >
                <span className="lrn-facet__name">{L('Tous les niveaux', 'Tout nivo yo')}</span>
                <span className="lrn-facet__n">{levelCounts.live.all}</span>
              </button>
            </li>
            {levels.map((lv) => {
              const n = levelCounts.live[lv] || 0;
              const soon = levelCounts.pending[lv] || 0;
              return (
                <li key={lv}>
                  <button
                    type="button"
                    className={`lrn-facet__opt${level === lv ? ' lrn-facet__opt--on' : ''}`}
                    aria-pressed={level === lv}
                    disabled={n === 0 && soon === 0 && level !== lv}
                    onClick={() => onLevel(lv)}
                  >
                    <LevelPill level={lv} />
                    {n > 0
                      ? <span className="lrn-facet__n">{n}</span>
                      : <span className="lrn-facet__n lrn-facet__n--soon">{L('bientôt', 'talè')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {hasEnrolled && (
          <div className="lrn-facet">
            <button
              type="button"
              className={`lrn-facet__opt${mine ? ' lrn-facet__opt--on' : ''}`}
              aria-pressed={mine}
              onClick={() => onMine(!mine)}
            >
              <span className="lrn-facet__name">{t('courses.myCourses')}</span>
              {mine && <Check size={15} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Courses — a grade-led, faceted catalog.
 *
 * A returning student's own class leads (their level's courses, labelled as
 * theirs); the complete catalog stays open right below, so leading never
 * means filtering things away. Below that the catalog can be read along
 * either of the two axes the data actually has — by subject or by level — and
 * every course opens in place to show its real modules.
 *
 * Search and the facets live in the URL, so a filtered catalog survives a
 * reload, the back button and being shared.
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

  const coursePercent = useCallback((course) => courseStats(course).pct, [courseStats]);

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

  // Facet counts: each axis counts against the OTHER axis (plus search), the
  // standard faceted behaviour — so a number is always the number of courses
  // that clicking it will actually show.
  //
  // Published and pending are counted apart. Counting them together put "13"
  // in the rail beside a results note reading "9 cours publiés", and offered
  // "Physique 4" as though four courses were there to take — they are all
  // `coming_soon`. A facet whose only courses are pending now says so instead
  // of quoting a number the page contradicts two inches away.
  const subjectCounts = useMemo(() => {
    const out: Record<string, number> = { all: 0 };
    const pending: Record<string, number> = { all: 0 };
    for (const c of searchedCourses) {
      if (!matchesMine(c)) continue;
      if (level !== 'all' && courseLevel(c) !== level) continue;
      const bucket = c.comingSoon ? pending : out;
      bucket.all += 1;
      bucket[c.subject] = (bucket[c.subject] || 0) + 1;
    }
    return { live: out, pending };
  }, [searchedCourses, level, matchesMine]);

  const levelCounts = useMemo(() => {
    const out: Record<string, number> = { all: 0 };
    const pending: Record<string, number> = { all: 0 };
    for (const c of searchedCourses) {
      if (!matchesMine(c)) continue;
      if (subject !== 'all' && c.subject !== subject) continue;
      const lv = courseLevel(c);
      const bucket = c.comingSoon ? pending : out;
      bucket.all += 1;
      bucket[lv] = (bucket[lv] || 0) + 1;
    }
    return { live: out, pending };
  }, [searchedCourses, subject, matchesMine]);

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

  // ── The catalogue's real size, counted from the catalogue ───────────────
  // Every figure below is derived from the courses actually loaded, so the
  // page can never advertise content it does not have. `coming_soon` courses
  // are excluded from the lesson and module totals and reported separately.
  const totals = useMemo(() => {
    const live = courses.filter((c) => !c.comingSoon);
    const liveSubjects = new Set(live.map((c) => c.subject));
    const soonSubjects = new Set(
      courses.filter((c) => c.comingSoon && !liveSubjects.has(c.subject)).map((c) => c.subject),
    );
    const liveLevels: string[] = [...new Set<string>(live.map(courseLevel).filter(Boolean))]
      .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
    return {
      subjects: liveSubjects.size,
      soonSubjects: soonSubjects.size,
      courses: live.length,
      levels: liveLevels,
      units: live.reduce((n, c) => n + (c.modules?.length || 0), 0),
      lessons: live.reduce((n, c) => n + countCourseLessons(c), 0),
    };
  }, [courses]);

  /**
   * The hero's figures — the catalogue measuring itself. `totals` counts only
   * the courses this page renders (dataService already drops the `hidden`
   * ones, and `coming_soon` courses are excluded above), so the day Chimie
   * NS II–IV are unhidden these numbers move on their own.
   */
  const catalogFigures = useMemo(() => ([
    { key: 'subjects', icon: Library, tone: 'azure', value: totals.subjects, label: L('Matières', 'Matyè') },
    { key: 'levels', icon: Layers, tone: 'violet', value: totals.levels.length, label: L('Niveaux', 'Nivo') },
    { key: 'units', icon: BookOpen, tone: 'emerald', value: totals.units, label: L('Modules', 'Modil') },
    { key: 'lessons', icon: PlayCircle, tone: 'amber', value: totals.lessons, label: L('Leçons', 'Leson') },
  ].filter((f) => f.value > 0)), [totals, L]);

  /** "du NS I au NS IV" — the span the catalogue actually covers. */
  const levelSpan = useMemo(() => {
    const lv = totals.levels;
    if (lv.length === 0) return '';
    if (lv.length === 1) return levelLabel(lv[0]);
    const first = levelLabel(lv[0]);
    const last = levelLabel(lv[lv.length - 1]);
    return L(`du ${first} au ${last}`, `depi ${first} rive ${last}`);
  }, [totals, L]);

  // Example queries are read off the catalogue — the biggest module in each
  // subject — so every suggestion is guaranteed to return a result. Nothing
  // here is typed by hand.
  const suggestions = useMemo(() => {
    const best = new Map<string, { title: string; n: number }>();
    for (const c of courses) {
      if (c.comingSoon) continue;
      for (const u of c.modules || []) {
        const n = u.lessons?.length || 0;
        const prev = best.get(c.subject);
        if (u.title && (!prev || n > prev.n)) best.set(c.subject, { title: u.title, n });
      }
    }
    return SUBJECT_ORDER.map((s) => best.get(s)?.title).filter(Boolean).slice(0, 3) as string[];
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
    ? courses.filter((c) => courseLevel(c) === myLevel && !c.comingSoon)
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

  const hasAnyEnrolled = enrolledCourses.length > 0;
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

  const crumbs = [
    { label: L('Accueil', 'Akèy'), to: '/' },
    { label: t('courses.catalog'), to: filtering ? '/courses' : null },
    ...(subject !== 'all' ? [{ label: subjectName(subject), to: null }] : []),
    ...(level !== 'all' ? [{ label: levelLabel(level), to: null }] : []),
  ];

  return (
    <section className="section pf lrn">
      <div className="container">
        {/* Breadcrumb — where this page sits, and one click back out of a
            filtered view. */}
        <nav className="lrn-crumbs" aria-label={L('Fil d’Ariane', 'Chemen an')}>
          <ol>
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                {c.to && i < crumbs.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => (c.to === '/courses' ? resetFacets() : navigate(c.to as string))}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight size={13} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </nav>

        {/* Header — the mockups' hero: a dotted caps eyebrow, a two-tone
            title, and the catalogue's own size beside it. Every figure in
            `catalogFigures` is counted from the loaded catalogue, so the
            panel self-corrects the day a hidden subject is unhidden. */}
        {/* A page header, not a hero.
            It WAS a hero: a 384px card (346px on a phone) with an eyebrow, a
            display title, a lede and a 2×2 panel of figures. That pushed the
            search field to 560px and the filter rail to 928px — below the fold
            on both sizes, so a student could not narrow the catalogue without
            scrolling past a card that only described the page.

            Ted, on seeing it: "the hero is too big - i want people to start
            taking action as soon as they are on the page".

            So: one line of title, the same real figures inline beside it, and
            the lede dropped — it said "filtrez par matière et par niveau, ou
            cherchez…", which is what the controls directly underneath already
            show. The <h1> stays; it is the page's only one. */}
        <header className="lrn-head">
          <div className="lrn-head__line">
            {myCourses.length > 0 && !filtering ? (
              <h1 className="lrn-head__title">
                {L('Vos cours', 'Kou ou yo')}
                {myLevel && <span className="lrn-head__accent">{levelLabel(myLevel)}</span>}
              </h1>
            ) : (
              <h1 className="lrn-head__title">
                {t('courses.catalog')}
                {/* The range is read off the levels the catalogue actually
                    has — not a "NS I → NS IV" typed into the page. */}
                {levelSpan && <span className="lrn-head__accent">{levelSpan}</span>}
              </h1>
            )}

            {catalogFigures.length > 0 && (
              <dl className="lrn-tally">
                {catalogFigures.map((f) => (
                  <div key={f.key} className="lrn-tally__item">
                    <dd className="lrn-tally__value">{f.value}</dd>
                    <dt className="lrn-tally__label">{f.label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </header>

        {/* Toolbar — a real search field over the catalogue, plus the axis
            toggle. Search matches course names, module titles and lesson
            titles; ⌘K still opens the app-wide overlay for everything else. */}
        <div className="lrn-panel pf-card">
        <div className="lrn-toolbar">
          <div className="lrn-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              className="lrn-search__input"
              value={query}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder={L('Rechercher un cours, un module, une leçon…', 'Chèche yon kou, yon modil, yon leson…')}
              aria-label={t('courses.searchLabel')}
            />
            {query && (
              <button
                type="button"
                className="lrn-search__clear"
                onClick={() => setParam('q', null)}
                aria-label={L('Effacer la recherche', 'Efase rechèch la')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="lrn-axis" role="group" aria-label={L('Organiser le catalogue', 'Òganize katalòg la')}>
            <button
              type="button"
              className={`lrn-axis__btn${axis === 'subject' ? ' lrn-axis__btn--on' : ''}`}
              aria-pressed={axis === 'subject'}
              onClick={() => setParam('vue', null)}
            >
              {L('Par matière', 'Pa matyè')}
            </button>
            <button
              type="button"
              className={`lrn-axis__btn${axis === 'level' ? ' lrn-axis__btn--on' : ''}`}
              aria-pressed={axis === 'level'}
              onClick={() => setParam('vue', 'niveau')}
            >
              {L('Par niveau', 'Pa nivo')}
            </button>
          </div>
        </div>

        {/* Suggestions are module titles taken from the catalogue itself, so
            each one is guaranteed to return something. The mockups' "sujets
            fréquents" row — same content, the caps micro-label instead of a
            sentence. */}
        {!query && suggestions.length > 0 && (
          <p className="lrn-tries">
            <span className="pf-eyebrow">{L('Sujets fréquents', 'Sijè souvan')}</span>
            {suggestions.map((s) => (
              <button key={s} type="button" className="lrn-try" onClick={() => setParam('q', s)}>
                {s}
              </button>
            ))}
          </p>
        )}
        </div>{/* .lrn-panel */}

        {/* Offline with a catalog on hand. The app-wide NetworkStatus banner
            already announces "hors ligne", so this line does not repeat it: it
            says what this page can still do and what needs the network. No
            promise of offline lessons, because none is implemented. */}
        {!online && courses.length > 0 && (
          <p className="lrn-stale lrn-stale--offline" role="status">
            <WifiOff size={15} aria-hidden="true" />
            <span>
              {L(
                'Catalogue enregistré : vous pouvez parcourir les cours et leurs modules. La mise à jour de la liste et les vidéos des leçons demandent une connexion.',
                'Katalòg ki sere a : ou ka gade kou yo ak modil yo. Mizajou lis la ak videyo leson yo mande koneksyon.',
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

        {resumeCourses.length > 0 && !filtering && (
          <div className="courses-resume courses-resume--lead" data-reveal>
            <h2 className="courses-resume__title">{t('courses.resumeTitle')}</h2>
            <div className="courses-resume__list">
              {resumeCourses.map(({ course, stats }) => (
                /* The whole row stays the click target (it always was), so
                   the CTA is a styled span rather than a nested <button> —
                   nesting interactive elements here would be invalid markup
                   and give screen readers two controls for one destination. */
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
                      {subjectName(course.subject)} · {levelLabel(courseLevel(course))}
                    </span>
                    <Meter
                      pct={stats.pct}
                      label={`${stats.pct}%`}
                    />
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
        {myCourses.length > 0 && !filtering && (
          <section className="lrn-section lrn-section--mine pf-card" aria-labelledby="lrn-mine">
            <div className="pf-head">
              <div className="pf-head__text">
                <span className="pf-eyebrow">{myGradeLabel || levelLabel(myLevel)}</span>
                <h2 className="pf-head__title" id="lrn-mine">
                  {L('Pour votre classe', 'Pou klas ou')}
                </h2>
              </div>
              <LevelPill level={myLevel} />
            </div>
            <div className="lrn-rows lrn-rows--flush">
              {myCourses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  stats={courseStats(course)}
                  progress={progressByCourseId.get(course.id)}
                  lead="subject"
                  enrolled={isEnrolled(course)}
                  onOpenLesson={openLesson}
                  t={t}
                  L={L}
                />
              ))}
            </div>
          </section>
        )}

        {/* No grade yet → ask once, honestly, and never block the catalog */}
        {!grade && !filtering && (
          <section className="lrn-ask pf-card" aria-labelledby="lrn-ask-title">
            <h2 className="lrn-ask__title" id="lrn-ask-title">
              <span className="pf-tile pf-tile--md pf-tile--azure" aria-hidden="true">
                <GraduationCap size={20} strokeWidth={1.9} />
              </span>
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
        {grade && myCourses.length === 0 && !filtering && (
          <section className="lrn-ask lrn-ask--none pf-card" aria-labelledby="lrn-none-title">
            {/* The grade is a badge, not part of the sentence: inlining it
                produced "pour la Après le Bac (Préfac)" for the grades
                whose label is not a feminine noun. */}
            <h2 className="lrn-ask__title" id="lrn-none-title">
              <span className="pf-tile pf-tile--md pf-tile--slate" aria-hidden="true">
                <GraduationCap size={20} strokeWidth={1.9} />
              </span>
              {L('Pas encore de cours pour votre classe', 'Poko gen kou pou klas ou')}
              <span className="pf-pill pf-pill--azure lrn-badge">{myGradeLabel}</span>
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
        <div className="lrn-layout">
          <Facets
            subject={subject}
            level={level}
            mine={mine}
            onSubject={(v) => setParam('matiere', v)}
            onLevel={(v) => setParam('niveau', v)}
            onMine={(v) => setParam('mes', v ? '1' : null)}
            subjectCounts={subjectCounts}
            levelCounts={levelCounts}
            subjects={subjectOptions}
            levels={levelOptions}
            hasEnrolled={hasAnyEnrolled}
            activeCount={activeFacets}
            onReset={resetFacets}
            t={t}
            L={L}
          />

          <div className="lrn-results">
            <div className="lrn-results__head pf-head">
              <div className="pf-head__text">
                <span className="pf-eyebrow">{L('Catalogue', 'Katalòg')}</span>
                <h2 className="pf-head__title" id="lrn-all">
                  {filtering
                    ? L('Résultats', 'Rezilta')
                    : myCourses.length > 0
                      ? L('Tout le catalogue', 'Tout katalòg la')
                      : L('Toutes les matières', 'Tout matyè yo')}
                </h2>
                {/* Counted from the catalogue that is loaded — never a figure
                    typed into the page. The hero above carries the rest. */}
                {!filtering && totals.courses > 0 && (
                  <p className="lrn-results__note">
                    {L(
                      `${totals.courses} cours publiés`,
                      `${totals.courses} kou pibliye`,
                    )}
                    {totals.soonSubjects > 0 && L(
                      ` — et ${totals.soonSubjects} matière en préparation`,
                      ` — ak ${totals.soonSubjects} matyè k ap prepare`,
                    )}
                  </p>
                )}
              </div>
              <span className="pf-pill pf-pill--slate lrn-count">{visible.length}</span>
            </div>

            {visible.length > 0 ? (
              <>
                {liveGroups.map((g) => (
                  <section
                    key={g.key}
                    className="lrn-group"
                    aria-labelledby={`grp-${g.key}`}
                    data-reveal
                  >
                    <div className="lrn-group__head">
                      {axis === 'subject'
                        ? <SubjectTile code={g.key} size="lg" />
                        : (
                          <span className="pf-tile pf-tile--lg pf-tile--azure" aria-hidden="true">
                            <Layers size={24} strokeWidth={1.9} />
                          </span>
                        )}
                      <div className="lrn-group__lead">
                        <h3 className="lrn-group__title" id={`grp-${g.key}`}>{groupLabel(g.key)}</h3>
                        <p className="lrn-group__meta pf-eyebrow">
                          {[
                            axis === 'subject'
                              ? t('courses.levelCount', { count: g.items.length })
                              : `${g.items.length} ${g.items.length > 1 ? L('cours', 'kou') : L('cours', 'kou')}`,
                            g.units > 0 ? t('courses.modulesCount', { count: g.units }) : '',
                            g.lessons > 0 ? t('courses.lessonsCount', { count: g.lessons }) : '',
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {axis === 'subject' && !g.allSoon && (
                        <button
                          type="button"
                          className="button button--ghost button--sm lrn-group__practice"
                          onClick={() => navigate(`/quizzes?course=${g.key}`)}
                        >
                          <Target size={15} aria-hidden="true" /> {t('courses.practiceCta')}
                        </button>
                      )}
                    </div>
                    <div className="lrn-rows">
                      {g.items.map((course) => (
                        <CourseRow
                          key={course.id}
                          course={course}
                          stats={courseStats(course)}
                          progress={progressByCourseId.get(course.id)}
                          lead={axis === 'subject' ? 'level' : 'subject'}
                          enrolled={isEnrolled(course)}
                          units={unitsFor(course.id)}
                          forceOpen={Boolean(query.trim() && unitsFor(course.id))}
                          onOpenLesson={openLesson}
                          t={t}
                          L={L}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                {/* Unavailable subjects: listed so they are not a surprise, but
                    visibly secondary and never dressed up as a link. */}
                {soonGroups.length > 0 && (
                  <div className="lrn-soon">
                    <span className="pf-eyebrow lrn-soon__label">{L('Bientôt disponible', 'Byento disponib')}</span>
                    <ul className="lrn-soon__list">
                      {soonGroups.map((g) => (
                        <li key={g.key} className="lrn-soon__item">
                          <SubjectTile code={g.key} size="sm" />
                          <span className="lrn-soon__name">{groupLabel(g.key)}</span>
                          {/* The level count is real (the documents exist and
                              are flagged `coming_soon`); no lesson count is
                              shown, because none of it is published yet. */}
                          <span className="lrn-soon__note">
                            {t('courses.levelCount', { count: g.items.length })}
                            {L(' en préparation', ' k ap prepare')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : filtering ? (
              /* Empty says which filter emptied it and undoes exactly that. */
              <EmptyState
                title={query.trim()
                  ? L(`Aucun résultat pour « ${query.trim()} »`, `Pa gen rezilta pou « ${query.trim()} »`)
                  : t('courses.noCoursesTitle')}
                message={L(
                  'Nous cherchons dans les noms de cours, les titres de modules et les titres de leçons du catalogue.',
                  'N ap chèche nan non kou yo, tit modil yo ak tit leson yo nan katalòg la.',
                )}
                action={{ label: t('courses.resetFilters'), onClick: resetFacets }}
                secondaryAction={{
                  label: L('Chercher dans toute l’app', 'Chèche nan tout app la'),
                  onClick: () => setSearchOpen(true),
                }}
              />
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
          </div>
        </div>
      </div>
    </section>
  );
}
