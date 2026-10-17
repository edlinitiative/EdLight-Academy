import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, ClipboardList, RotateCcw, PlayCircle,
} from '../../components/icons';
import { videoThumb, firstThumb } from '../../utils/videoThumb';
import { courseCover } from '../../utils/courseCovers';
import useStore from '../../contexts/store';
import { listRecentExamAttempts } from '../../services/userActivity';
import { loadReviewMap } from '../../services/reviewService';
import { dueQuestionIds } from '../../utils/review';
import { normalizeExamCatalog } from '../../utils/examCatalog';
import { buildExamIndex, displayStoredExamTitle, subjectColor } from '../../utils/examUtils';
import { sessionRowName } from '../../utils/examNaming';
import { useExamAttempts } from '../../hooks/useExamAttempts';
import ExamCountdown from '../../components/ExamCountdown';
import DailyQuests from '../../components/DailyQuests';
import MySchoolCard from '../../components/MySchoolCard';
import { useCourseMastery } from '../../hooks/useMastery';
import HomeContinuation from '../../components/journey/home/HomeContinuation';
import ProgressSummary, { type SummaryRow } from '../../components/journey/home/ProgressSummary';
import {
  resolveContinuation, summarizeCourse, readResumeSeconds, parseLessonPath,
} from '../../components/journey/home/homeJourney';
import type { HomePreview } from '../../components/journey/home/homePreview';
import { evidenceLabel } from '../../utils/learningJourney';
import type { ReviewMap } from '../../utils/review';
import '../../components/journey/home/journeyHome.css';

/**
 * The Apprendre tab's workspace — Ted's "Espace de travail" mockup, wired to
 * the student's own data and nothing else:
 *
 *   command bar   who they are (class, school) + two real shortcuts
 *   subject cards per subject: the course at their level (else the one they
 *                 have progress in), its real completion, the next unfinished
 *                 unit as "prochaine étape"
 *   exams list    their real attempts (users/{uid}/examAttempts), named from
 *                 the catalogue index, best score from useExamAttempts
 *   sidebar       the real exam countdown, today's quests, weak spots from the
 *                 Revizyon map (missed questions grouped by subject + unit),
 *                 and the school card
 *
 * The mockup's offline manager, PDF memo sheets, sync button, coefficients and
 * audio explanations are not features the app has, so they are not drawn.
 * Signed-out visitors never reach this component (the catalogue below it is
 * theirs).
 *
 * Learning journey (docs/design/2026-10-17-learning-journey-prd.md):
 *   continuation  LJ-01 — ONE row naming the exact lesson (or unfinished exam)
 *                 the button opens; new accounts get a real first lesson of
 *                 their class; uncovered classes are told so (LJ-02)
 *   progress      LJ-10 — evidence words with real denominators, per course
 *   à revoir      due review explained as spacing, not failure
 * Each section loads and fails on its own: a catalogue failure never takes
 * the exams or the review list down with it.
 */

type Stats = { pct: number; completed: number; total: number; remaining: number };

const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'ECON'];
const LEVEL_ORDER = ['NSI', 'NSII', 'NSIII', 'NSIV'];

function levelToUrl(levelLabel?: string) {
  const s = String(levelLabel || '').toLowerCase();
  if (s.includes('baccala')) return 'terminale';
  if (s.includes('9')) return '9e';
  if (s.includes('univers')) return 'university';
  return '';
}

export default function LearnWorkspace({
  courses, courseLevel, subjectName, levelLabel, myLevel: myLevelProp, progressByCourseId: realProgress, SubjectTile, L,
  coursesLoading = false, coursesFailed = false, onRetryCourses, retryingCourses = false, progressLoading = false, preview = null,
}: {
  courses: any[];
  /** Kept for the caller's signature; stats are computed here from the same progress. */
  courseStats?: (c: any) => Stats;
  courseLevel: (c: any) => string;
  subjectName: (code: string) => string;
  levelLabel: (lv: string) => string;
  myLevel?: string;
  progressByCourseId: Map<string, any>;
  SubjectTile: React.ComponentType<{ code: string; size?: string }>;
  L: (fr: string, ht: string) => string;
  coursesLoading?: boolean;
  coursesFailed?: boolean;
  onRetryCourses?: () => void;
  retryingCourses?: boolean;
  progressLoading?: boolean;
  /** Dev-only fixtures (/dashboard?preview=…); never set in production. */
  preview?: HomePreview | null;
}) {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const language = useStore((s) => s.language);
  const storeGrade = useStore((s) => s.grade);
  const storeGradeChosen = useStore((s) => s.gradeChosen);
  const storeLastActivity = useStore((s) => s.lastActivity);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const isCreole = language === 'ht';
  const uid = preview ? null : (user?.uid || null);

  // Preview fixtures replace the student's records; the catalogue stays real.
  const grade = preview ? preview.grade : storeGrade;
  const gradeChosen = preview ? preview.gradeChosen : storeGradeChosen;
  const lastActivity = preview ? preview.lastActivity : storeLastActivity;
  const myLevel = preview ? ({ NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV' } as Record<string, string>)[preview.grade || ''] : myLevelProp;
  const progressByCourseId = useMemo(() => {
    if (!preview) return realProgress;
    const m = new Map<string, any>();
    for (const p of preview.progress) m.set(p.courseId, p);
    return m;
  }, [preview, realProgress]);
  const { mastery: realMastery, loading: masteryLoading } = useCourseMastery(null);
  const mastery = preview ? preview.mastery : realMastery;
  const [classSkipped, setClassSkipped] = useState(false);

  const courseStats = useCallback((course: any): Stats => {
    const total = (course?.modules || []).reduce((n: number, u: any) => n + (u?.lessons?.length || 0), 0);
    const done = Math.min(progressByCourseId.get(course.id)?.completedLessons?.length || 0, total);
    return { pct: total ? Math.round((done / total) * 100) : 0, completed: done, total, remaining: Math.max(0, total - done) };
  }, [progressByCourseId]);

  const live = useMemo(() => courses.filter((c) => !c.comingSoon), [courses]);

  // ── Subjects: one card per subject the catalogue actually has ────────────
  const subjects = useMemo(() => {
    const bySubject = new Map<string, any[]>();
    for (const c of live) {
      if (!bySubject.has(c.subject)) bySubject.set(c.subject, []);
      bySubject.get(c.subject)!.push(c);
    }
    return [...bySubject.entries()]
      .sort((a, b) => SUBJECT_ORDER.indexOf(a[0]) - SUBJECT_ORDER.indexOf(b[0]))
      .map(([code, list]) => {
        const sorted = [...list].sort((a, b) => LEVEL_ORDER.indexOf(courseLevel(a)) - LEVEL_ORDER.indexOf(courseLevel(b)));
        const atLevel = myLevel ? sorted.find((c) => courseLevel(c) === myLevel) : null;
        const withProgress = sorted
          .filter((c) => progressByCourseId.has(c.id))
          .sort((a, b) => courseStats(b).pct - courseStats(a).pct)[0];
        const course = atLevel || withProgress || sorted[0];
        const stats = courseStats(course);
        const done = new Set<string>(progressByCourseId.get(course.id)?.completedLessons || []);
        const units = Array.isArray(course.modules) ? course.modules : [];
        const nextUnit = units.find((u) => (u?.lessons || []).some((l) => !done.has(l.id)));
        return { code, course, stats, nextUnit, unitsDone: units.filter((u) => (u?.lessons || []).length > 0 && (u.lessons).every((l) => done.has(l.id))).length, unitsTotal: units.length };
      });
  }, [live, myLevel, progressByCourseId, courseStats, courseLevel]);

  // ── Exams: the student's attempts, named from the catalogue ───────────────
  const { data: realAttempts = [], isError: attemptsFailed, refetch: refetchAttempts } = useQuery({
    queryKey: ['dashboard-exam-attempts', uid],
    queryFn: () => listRecentExamAttempts(uid, 25),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
  const attempts = preview ? preview.attempts : realAttempts;
  const { data: examCatalog } = useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
  });
  const examByKey = useMemo(() => {
    const m = new Map();
    for (const e of examCatalog ? buildExamIndex(examCatalog).exams : []) m.set(String(e.exam_id ?? e._idx), e);
    return m;
  }, [examCatalog]);
  const best = useExamAttempts();

  // ── Due review: missed questions still due, grouped by subject + unit ────
  // null = loading, 'failed' = the review map could not be read (its own
  // section says so; nothing else on the page waits for it).
  const [weak, setWeak] = useState<{ code: string; unitNo?: number; count: number }[] | null | 'failed'>(null);
  const [reviewTry, setReviewTry] = useState(0);
  useEffect(() => {
    const group = (map: ReviewMap) => {
      const groups = new Map<string, { code: string; unitNo?: number; count: number }>();
      for (const id of dueQuestionIds(map)) {
        const e = map[id];
        const code = e?.subjectCode || '';
        const key = `${code}:${e?.unitNo ?? ''}`;
        const g = groups.get(key) || { code, unitNo: e?.unitNo, count: 0 };
        g.count += 1;
        groups.set(key, g);
      }
      return [...groups.values()].sort((a, b) => b.count - a.count);
    };
    if (preview) { setWeak(preview.reviewMap === 'failed' ? 'failed' : group(preview.reviewMap)); return undefined; }
    if (!uid) return undefined;
    let alive = true;
    setWeak(null);
    loadReviewMap(uid).then((map) => {
      if (alive) setWeak(group(map));
    }).catch(() => { if (alive) setWeak('failed'); });
    return () => { alive = false; };
  }, [uid, preview, reviewTry]);
  const weakList = Array.isArray(weak) ? weak : [];
  const dueCount = Array.isArray(weak) ? weakList.reduce((n, w) => n + w.count, 0) : null;
  const weakTotal = dueCount || 0;

  // Review entries store a course code like "MATH-NSI"; students see
  // "Mathématiques NS I · Unité 1 — <the unit's title>", never the code.
  const splitCode = (code: string) => {
    const [sub = '', lvl = ''] = String(code || '').split('-');
    return { sub, lvl: lvl.toUpperCase() };
  };
  const weakName = (code: string) => {
    const { sub, lvl } = splitCode(code);
    return `${subjectName(sub)}${lvl ? ` ${levelLabel(lvl)}` : ''}`;
  };
  const unitTitle = (code: string, unitNo?: number) => {
    if (!unitNo) return '';
    const { sub, lvl } = splitCode(code);
    const c = courses.find((x) => String(x.subject || '').toUpperCase() === sub.toUpperCase()
      && String(courseLevel(x) || '').replace(/\s+/g, '').toUpperCase() === lvl)
      || subjects.find((x) => x.code === sub)?.course;
    const m = (c?.modules || []).find((u) => Number(u?.unit_no) === Number(unitNo));
    return m?.title || '';
  };

  // ── Exams: one row per paper (the newest attempt wins), named from the
  // catalogue; a paper the catalogue cannot name is called by its level,
  // never a bare « Examen ».
  const examRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const a of attempts as any[]) {
      const id = String(a?.exam_id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const submitted = a?.status === 'submitted';
      const ex = examByKey.get(id);
      const named = ex ? sessionRowName(ex, isCreole ? 'ht' : 'fr') : null;
      const stored = displayStoredExamTitle(a?.exam_title || a?.examTitle, a, '');
      const levelName = /univers/i.test(String(a?.level)) ? L('Concours université', 'Konkou inivèsite')
        : /9/.test(String(a?.level)) ? L('Examen de 9ᵉ AF', 'Egzamen 9yèm AF') : L('Épreuve du Bac', 'Eprèv Bak');
      const title = named ? `${ex._subject ? `${ex._subject} · ` : ''}${named.title}` : (stored && stored !== 'Examen' ? stored : levelName);
      const lvl = levelToUrl(a?.level);
      const pct = best[id]?.percentage;
      const answered = a?.answers ? Object.keys(a.answers).length : 0;
      rows.push({
        key: id,
        title,
        year: ex?.year && /^\d{4}$/.test(String(ex.year)) ? String(ex.year) : '',
        color: ex?._subject ? subjectColor(ex._subject) : '#1B6FE0',
        submitted,
        status: submitted
          ? (typeof pct === 'number' ? L(`Meilleur score : ${Math.round(pct)} %`, `Pi bon nòt : ${Math.round(pct)} %`) : L('Terminé', 'Fini'))
          : L(`En cours · ${answered} réponse${answered > 1 ? 's' : ''} enregistrée${answered > 1 ? 's' : ''}`, `An kou · ${answered} repons anrejistre`),
        cta: submitted ? L('Corrigé', 'Koreksyon') : L('Reprendre', 'Kontinye'),
        open: () => {
          if (!lvl) return navigate('/exams');
          if (submitted) return navigate(`/exams/${lvl}/${id}/results`);
          return navigate(`/exams/${lvl}/${id}/take`, { state: { autostart: true, resume: true } });
        },
      });
      if (rows.length === 3) break;
    }
    return rows;
  }, [attempts, examByKey, best, isCreole, L, navigate]);

  // Started: a frame of the next lesson. Not started: a frame a third of the
  // way in — first lessons often open on a title card or an app screen.
  const frameFor = (course: any, nextUnit: any, started: boolean) => {
    const all = (course?.modules || []).flatMap((m: any) => m?.lessons || []);
    if (started) {
      const next = nextUnit?.lessons?.find((l: any) => videoThumb(l?.videoUrl)) || null;
      if (next) return videoThumb(next.videoUrl, 'hq');
    }
    const chosen = courseCover(course?.id);
    if (chosen) return chosen;
    const from = Math.floor(all.length / 3);
    return firstThumb([...all.slice(from), ...all.slice(0, from)], 'hq')?.src || null;
  };

  // ── LJ-01: the one continuation ─────────────────────────────────────────
  const recordsLoading = preview ? !!preview.loading : (progressLoading || masteryLoading);
  const catalogLoading = preview ? !!preview.loading : (coursesLoading && courses.length === 0);
  const catalogFailed = preview ? !!preview.coursesFailed : (coursesFailed && courses.length === 0);
  const continuation = useMemo(() => {
    if (catalogLoading || catalogFailed || recordsLoading) return null;
    return resolveContinuation({
      courses,
      courseLevel,
      lastActivity,
      progressByCourseId,
      mastery,
      grade,
      classSkipped: classSkipped || (gradeChosen && !grade),
      readPosition: (cid, lid) => {
        // A position is promised only for the lesson THIS account last had
        // open (lastActivity is cleared on logout); the browser store itself
        // is per device, not per account.
        const last = parseLessonPath(lastActivity?.type === 'lesson' ? lastActivity.path : null);
        if (!last || last.courseId !== cid || last.lessonId !== lid) return 0;
        return preview ? (preview.positionSec || 0) : readResumeSeconds(cid, lid);
      },
    });
  }, [catalogLoading, catalogFailed, recordsLoading, courses, courseLevel, lastActivity, progressByCourseId, mastery, grade, classSkipped, gradeChosen, preview]);

  const examAnswered = useMemo(() => {
    if (continuation?.kind !== 'exam') return null;
    const id = /\/exams\/[^/]+\/([^/]+)\/take/.exec(continuation.path)?.[1];
    const a = (attempts as any[]).find((x) => String(x?.exam_id) === id && x?.status !== 'submitted');
    return a?.answers ? Object.keys(a.answers).length : null;
  }, [continuation, attempts]);

  // ── LJ-10: evidence per course the student has actually worked in ────────
  const summaryRows: SummaryRow[] = useMemo(() => {
    if (catalogLoading || catalogFailed || recordsLoading) return [];
    const focus = continuation?.kind === 'lesson' ? continuation.course.id : null;
    return live
      .map((course) => ({ course, summary: summarizeCourse(course, progressByCourseId.get(course.id), mastery) }))
      .filter((r) => r.summary.opened > 0)
      .sort((a, b) => (a.course.id === focus ? -1 : b.course.id === focus ? 1 : 0)
        || b.summary.opened - a.summary.opened)
      .slice(0, 4);
  }, [catalogLoading, catalogFailed, recordsLoading, continuation, live, progressByCourseId, mastery]);

  return (
    <div className="lws lws--premium">

      <div className="lws-grid">
        <div className="lws-main">
          {/* ── The one next action (LJ-01) ─────────────────────────────── */}
          <HomeContinuation
            state={continuation}
            loading={catalogLoading || (!catalogFailed && recordsLoading)}
            failed={catalogFailed}
            onRetry={() => onRetryCourses?.()}
            retrying={retryingCourses}
            dueCount={dueCount}
            examAnswered={examAnswered}
            grade={grade}
            onSkipClass={() => { setClassSkipped(true); if (!preview) setGradeChosen(true); }}
            subjectName={subjectName}
            levelLabel={levelLabel}
            courseLevel={courseLevel}
            L={L}
          />

          {/* ── Subjects: each opens on a frame of its next lesson ─────────── */}
          <section className="lws-section" aria-labelledby="lws-subjects">
            <div className="lws-section__head">
              <h2 id="lws-subjects">{L('Tes matières', 'Matyè ou yo')}</h2>
              <span className="lws-pill">{myLevel ? levelLabel(myLevel) : L('Programme MENFP', 'Pwogram MENFP')}</span>
            </div>
            {catalogLoading ? (
              <div className="lws-subjects" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => <span key={i} className="lws-subj jh-subj-skel"><span className="jh-subj-skel__cover skeleton" /><span className="jh-subj-skel__body"><span className="skeleton" /><span className="skeleton" /></span></span>)}
              </div>
            ) : catalogFailed ? (
              <p className="jh-section-note">{L('Les matières s’afficheront quand le catalogue sera chargé.', 'Matyè yo ap parèt lè katalòg la chaje.')}</p>
            ) : (
            <div className="lws-subjects">
              {subjects.map(({ code, course, stats, nextUnit, unitsDone, unitsTotal }) => {
                const frame = frameFor(course, nextUnit, stats.completed > 0);
                const r = 20;
                const circ = 2 * Math.PI * r;
                const ev = summarizeCourse(course, progressByCourseId.get(course.id), mastery);
                const word = (e: 'completed' | 'mastered', n: number) => {
                  const w = evidenceLabel(e, isCreole).toLowerCase();
                  return !isCreole && n > 1 ? `${w}s` : w;
                };
                return (
                  <Link key={code} to={`/courses/${course.id}`} className="lws-subj">
                    <span className="lws-subj__cover">
                      {frame ? <img src={frame} alt="" loading="lazy" /> : <span className="lws-subj__blank"><SubjectTile code={code} size="lg" /></span>}
                      <span className="lws-subj__level">{levelLabel(courseLevel(course))}</span>
                      <span className="lws-subj__play" aria-hidden="true"><PlayCircle size={26} /></span>
                    </span>
                    <span className="lws-subj__body">
                      <span className="lws-subj__row">
                        <strong>{subjectName(code)}</strong>
                        <span className="lws-ring" aria-label={L(`${stats.completed} leçons terminées sur ${stats.total}`, `${stats.completed} leson fini sou ${stats.total}`)}>
                          <svg viewBox="0 0 48 48" aria-hidden="true">
                            <circle cx="24" cy="24" r={r} />
                            <circle className={`lws-ring__arc lws-stroke--${code}`} cx="24" cy="24" r={r}
                              strokeDasharray={circ} strokeDashoffset={circ * (1 - stats.pct / 100)} />
                          </svg>
                          <b aria-hidden="true" className="jh-ring-frac">{stats.completed}/{stats.total}</b>
                        </span>
                      </span>
                      {nextUnit
                        ? <span className="lws-subj__next"><em>{L('Prochaine étape', 'Pwochen etap')}</em>{nextUnit.title}</span>
                        : <span className="lws-subj__next"><em>{L('Bravo', 'Bravo')}</em>{L('Toutes les unités sont terminées.', 'Tout inite yo fini.')}</span>}
                      <span className="lws-subj__meta">
                        {stats.completed > 0 || ev.mastered > 0
                          ? [
                            L(`${stats.completed} ${word('completed', stats.completed)} sur ${stats.total}`, `${stats.completed} ${word('completed', stats.completed)} sou ${stats.total}`),
                            ev.mastered > 0 ? `${ev.mastered} ${word('mastered', ev.mastered)}` : '',
                          ].filter(Boolean).join(' · ')
                          : L(`${stats.total} leçons · ${unitsTotal} unités`, `${stats.total} leson · ${unitsTotal} inite`)}
                        {unitsDone > 0 ? L(` · ${unitsDone}/${unitsTotal} unités`, ` · ${unitsDone}/${unitsTotal} inite`) : ''}
                      </span>
                      <span className="lws-subj__cta">
                        {stats.completed > 0 ? L('Continuer', 'Kontinye') : L('Commencer', 'Kòmanse')} <ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            )}
          </section>

          {/* ── Exams ────────────────────────────────────────────────────── */}
          <section className="lws-section" aria-labelledby="lws-exams">
            <div className="lws-section__head">
              <h2 id="lws-exams"><ClipboardList size={20} aria-hidden="true" /> {L('Tes examens blancs', 'Egzamen blan ou yo')}</h2>
              <Link to="/exams" className="lws-link">{L('Tous les sujets', 'Tout sijè yo')} <ChevronRight size={14} aria-hidden="true" /></Link>
            </div>
            {attemptsFailed && !preview ? (
              <div className="lws-card lws-empty">
                <p>{L('Tes épreuves n’ont pas pu se charger. Les sujets restent ouverts.', 'Eprèv ou yo pa t ka chaje. Sijè yo toujou louvri.')}</p>
                <button type="button" className="lws-btn lws-btn--soft" onClick={() => refetchAttempts()}>{L('Réessayer', 'Eseye ankò')}</button>
              </div>
            ) : examRows.length === 0 ? (
              <div className="lws-card lws-empty">
                <p>{L('Aucune épreuve commencée. Les vrais sujets du Bac t’attendent, avec leur durée officielle.', 'Ou poko kòmanse okenn eprèv. Vrè sijè Bak yo ap tann ou, ak dire ofisyèl yo.')}</p>
                <Link to="/exams" className="lws-btn lws-btn--soft">{L('Choisir un sujet', 'Chwazi yon sijè')}</Link>
              </div>
            ) : (
              <div className="lws-exams2">
                {examRows.map((row) => (
                  <button key={row.key} type="button" className="lws-ex" onClick={row.open}>
                    <span className="lws-ex__year" style={{ '--sub': row.color } as React.CSSProperties}>{row.year || '—'}</span>
                    <span className="lws-ex__body">
                      <strong>{row.title}</strong>
                      <span className={row.submitted ? 'lws-ex__done' : 'lws-ex__open'}>{row.status}</span>
                    </span>
                    <span className="lws-btn lws-btn--soft">{row.cta}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="lws-side">
          <ProgressSummary
            rows={summaryRows}
            loading={catalogLoading || (!catalogFailed && recordsLoading)}
            failed={catalogFailed}
            onRetry={() => onRetryCourses?.()}
            subjectName={subjectName}
            levelLabel={levelLabel}
            courseLevel={courseLevel}
            L={L}
          />

          <ExamCountdown />

          {/* Due review, explained as what it is: spacing, not a grade. */}
          <section className="lws-card lws-weak jh-review" aria-labelledby="lws-weak">
            <div className="lws-section__head">
              <h3 id="lws-weak"><RotateCcw size={18} aria-hidden="true" /> {L('À revoir', 'Pou revize')}</h3>
            </div>
            {weak === null ? (
              <p className="lws-muted" role="status">{L('Chargement…', 'N ap chaje…')}</p>
            ) : weak === 'failed' ? (
              <div className="jh-review__fail">
                <p className="lws-muted">{L('Ta liste de révision n’a pas pu se charger.', 'Lis revizyon ou pa t ka chaje.')}</p>
                <button type="button" className="lws-btn lws-btn--soft" onClick={() => setReviewTry((n) => n + 1)}>{L('Réessayer', 'Eseye ankò')}</button>
              </div>
            ) : weakList.length === 0 ? (
              <p className="lws-muted">{L('Rien à revoir pour l’instant. Une question manquée dans un quiz reviendra ici pour que tu la retentes plus tard.', 'Pa gen anyen pou revize kounye a. Yon kesyon ou rate nan yon quiz ap tounen isit la pou w eseye l ankò pita.')}</p>
            ) : (
              <>
                <p className="jh-review__why">
                  {L('Des questions manquées, gardées pour un nouvel essai. Les revoir quelques jours plus tard aide à retenir : ce n’est pas une note.',
                    'Kesyon ou te rate, kenbe pou yon lòt esè. Revize yo kèk jou apre ede w sonje : se pa yon nòt.')}
                </p>
                <ul className="lws-weak__list">
                  {weakList.slice(0, 3).map((w) => (
                    <li key={`${w.code}-${w.unitNo}`}>
                      <div>
                        <strong>{w.code ? weakName(w.code) : L('Divers', 'Divès')}{w.unitNo ? ` · ${L('Unité', 'Inite')} ${w.unitNo}` : ''}</strong>
                        {unitTitle(w.code, w.unitNo) && <span>{unitTitle(w.code, w.unitNo)}</span>}
                      </div>
                      <span className="lws-weak__count">{w.count} {w.count === 1 ? L('question', 'kesyon') : L('questions', 'kesyon')}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/revision" className="lws-btn lws-btn--soft lws-btn--block">
                  {L(`Revoir ${weakTotal} question${weakTotal > 1 ? 's' : ''}`, `Revize ${weakTotal} kesyon`)}
                </Link>
              </>
            )}
          </section>

          <div className="lws-quests"><DailyQuests /></div>

          <MySchoolCard where="courses" />
        </aside>
      </div>
    </div>
  );
}
