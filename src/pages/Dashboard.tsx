import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Target, ClipboardList, BookOpen, ChevronRight, PlayCircle } from 'lucide-react';
import { subjectCover } from '../utils/subjectCovers';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex } from '../utils/examUtils';
import { sessionRowName } from '../utils/examNaming';
import { useCourses } from '../hooks/useData';
import { useAllProgress, calculateCompletionPercentage } from '../hooks/useProgress';
import { useLeaderboard } from '../hooks/useLeaderboard';
import DashHeroStrip from '../components/DashHeroStrip';
import useStore from '../contexts/store';
import SmartSuggestion from '../components/SmartSuggestion';
import ReviewBanner from '../components/ReviewBanner';
import WelcomeGradeModal from '../components/WelcomeGradeModal';
import { StatTile, StatTileRow } from '../components/StatTile';
import Leaderboard from '../components/Leaderboard';
import { ErrorState } from '../components/StateViews';
import { listRecentExamAttempts, listRecentQuizAttempts } from '../services/userActivity';
import { getFirstName } from '../utils/shared';
import './Dashboard.css';

const SUBJECT_CODES = ['PHYS', 'CHEM', 'MATH', 'ECON'] as const;
function subjectCode(subject) {
  const v = String(subject || '').toLowerCase();
  if (v.startsWith('chim') || v.includes('chem')) return 'CHEM';
  if (v.startsWith('math') || v.includes('matemat')) return 'MATH';
  if (v.startsWith('econ') || v.includes('ekonomi')) return 'ECON';
  if (SUBJECT_CODES.includes(String(subject).toUpperCase() as any)) return String(subject).toUpperCase();
  return 'PHYS';
}
function subjectInitial(subject) {
  return (String(subject || '?').trim()[0] || '?').toUpperCase();
}

// Turn a raw quiz id like "CHEM-NSI-U1-L2" into a readable title
// ("Chimie · NS1 · Unité 1 · Leçon 2"). Falls back to the raw id / "Quiz".
const QUIZ_SUBJECT_NAMES = {
  MATH: { fr: 'Mathématiques', ht: 'Matematik' },
  PHYS: { fr: 'Physique', ht: 'Fizik' },
  CHEM: { fr: 'Chimie', ht: 'Chimi' },
  ECON: { fr: 'Économie', ht: 'Ekonomi' },
};
function humanizeQuizId(quizId, isCreole) {
  if (!quizId || typeof quizId !== 'string') return 'Quiz';
  const parts = quizId.split('-');
  const bits = [];
  const subj = QUIZ_SUBJECT_NAMES[(parts[0] || '').toUpperCase()];
  if (subj) bits.push(isCreole ? subj.ht : subj.fr);
  for (const p of parts.slice(1)) {
    const ns = p.match(/^NS(\w+)$/i);
    if (ns) { bits.push(`NS${ns[1]}`); continue; }
    const u = p.match(/^U(\d+)$/i);
    if (u) { bits.push(`${isCreole ? 'Inite' : 'Unité'} ${u[1]}`); continue; }
    const l = p.match(/^L(\d+)$/i);
    if (l) { bits.push(`${isCreole ? 'Leson' : 'Leçon'} ${l[1]}`); continue; }
  }
  return bits.length ? bits.join(' · ') : quizId;
}

function countCourseLessons(course) {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const lessonsCount = units.reduce((sum, unit) => sum + (unit?.lessons?.length || 0), 0);
  return lessonsCount || units.length || course?.videoCount || 0;
}

function levelToUrl(levelLabel) {
  const s = String(levelLabel || '').toLowerCase();
  if (s.includes('baccala')) return 'terminale';
  if (s.includes('9')) return '9e';
  if (s.includes('univers')) return 'university';
  return '';
}

function formatShortDate(msOrDate, locale) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: courses, isLoading, isError, isFetching, refetch } = useCourses();
  const { user, enrolledCourses, quizAttempts, language, setShowAuthModal } = useStore();
  const isCreole = language === 'ht';
  const locale = isCreole ? 'fr-HT' : 'fr-FR';

  const { progress: allProgress, loading: progressLoading } = useAllProgress();

  const progressByCourseId = React.useMemo(() => {
    const m = new Map();
    for (const p of allProgress || []) {
      if (!p?.courseId) continue;
      m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

  // Surface the most useful "next" course: the least-complete enrolled course,
  // falling back to the first catalog entry for brand-new learners. This was
  // computed and then never rendered — it now drives the resume hero, which
  // is the page's lead action (Coursera's "Continue learning").
  const resume = React.useMemo(() => {
    let course = null;
    if (enrolledCourses.length) {
      let bestPct = Infinity;
      for (const c of enrolledCourses) {
        const total = countCourseLessons(c);
        const p = progressByCourseId.get(c.id) || null;
        const pct = calculateCompletionPercentage(p, total || 0);
        if (pct < bestPct) { bestPct = pct; course = c; }
      }
    }
    const isEnrolled = !!course;
    if (!course) course = (courses && courses[0]) || null;
    if (!course) return null;

    const total = countCourseLessons(course);
    const p = progressByCourseId.get(course.id) || null;
    const done = p?.completedLessons?.length || 0;
    return {
      course,
      isEnrolled,
      total,
      done,
      percent: calculateCompletionPercentage(p, total || 0),
      remaining: Math.max(0, (total || 0) - done),
    };
  }, [enrolledCourses, progressByCourseId, courses]);

  const { data: recentQuizAttempts = [], isPending: quizLoading } = useQuery({
    queryKey: ['dashboard-quiz-attempts', user?.uid],
    queryFn: () => listRecentQuizAttempts(user.uid, 50),
    enabled: !!user?.uid,
    staleTime: 60 * 1000,
  });

  // Attempt docs don't always carry exam_title — three of four rows rendered as
  // a bare "Examen". The slim catalog index (same react-query key the exam
  // pages use, so this is a cache hit) gives every attempt a real name.
  const { data: examCatalog } = useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
  });

  const examByKey = React.useMemo(() => {
    const m = new Map();
    for (const e of examCatalog ? buildExamIndex(examCatalog).exams : []) {
      m.set(String(e.exam_id ?? e._idx), e);
    }
    return m;
  }, [examCatalog]);

  const { data: recentExamAttempts = [], isPending: examLoading } = useQuery({
    queryKey: ['dashboard-exam-attempts', user?.uid],
    queryFn: () => listRecentExamAttempts(user.uid, 25),
    enabled: !!user?.uid,
    staleTime: 60 * 1000,
  });

  // Quiz stats: prefer Firestore attempts (cross-device), fallback to local attempts.
  const fallbackQuizAttemptsList = Object.entries(quizAttempts)
    .flatMap(([quizId, attempts]) => (attempts || []).map((attempt) => ({ ...attempt, quizId })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const quizAttemptsForStats = recentQuizAttempts.length
    ? recentQuizAttempts.map((a) => ({
        quizId: a.quizId,
        courseId: a.courseId,
        percentage: typeof a.percentage === 'number' ? a.percentage : null,
        attemptedAtMs: a.attemptedAtMs,
      }))
    : fallbackQuizAttemptsList.map((a) => ({
        quizId: a.quizId,
        courseId: null,
        percentage: typeof a.score === 'number' ? a.score * 100 : null,
        attemptedAtMs: a.date ? new Date(a.date).getTime() : null,
      }));

  const quizzesTaken = quizAttemptsForStats.length;
  // Average only over attempts that actually have a numeric score. Dividing by
  // every attempt (incl. ungraded short-answer / local fallbacks with no
  // percentage) treated those as 0% and dragged the average down.
  const gradedAttempts = quizAttemptsForStats.filter((a) => typeof a.percentage === 'number');
  const avgScore = gradedAttempts.length
    ? Math.round(
        gradedAttempts.reduce((sum, a) => sum + a.percentage, 0) / gradedAttempts.length
      )
    : 0;

  const recentQuizActivityRows = React.useMemo(() => {
    if (recentQuizAttempts.length) return recentQuizAttempts.slice(0, 5);
    return fallbackQuizAttemptsList.slice(0, 5).map((a) => ({
      quizId: a.quizId,
      courseId: null,
      percentage: typeof a.score === 'number' ? a.score * 100 : 0,
      attemptedAtMs: a.date ? new Date(a.date).getTime() : Date.now(),
    }));
  }, [recentQuizAttempts, fallbackQuizAttemptsList]);

  const examSummary = React.useMemo(() => {
    const attempts = Array.isArray(recentExamAttempts) ? recentExamAttempts : [];
    const inProgress = attempts.filter((a) => a?.status === 'in_progress').length;
    const submitted = attempts.filter((a) => a?.status === 'submitted').length;
    const last = attempts.find((a) => a?.updated_at_ms || a?.submitted_at_ms) || null;
    const lastMs = last?.updated_at_ms || last?.submitted_at_ms || null;
    return { inProgress, submitted, lastMs };
  }, [recentExamAttempts]);

  const currentStreak = React.useMemo(
    () => (allProgress || []).reduce((m, p) => Math.max(m, p?.currentStreak || 0), 0),
    [allProgress]
  );

  const { myRank } = useLeaderboard(50);

  const firstName = getFirstName(user);

  if (!user?.uid && !isLoading) {
    return (
      <section className="section">
        <div className="container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
            {isCreole
              ? 'Konekte pou ou ka gen aksè ak tablodbò ou.'
              : 'Connectez-vous pour accéder à votre tableau de bord.'}
          </p>
          <button type="button" className="button button--primary" onClick={() => setShowAuthModal(true)}>
            {isCreole ? 'Konekte' : 'Se connecter'}
          </button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="section">
        <div className="container dash">
          <div className="dash__header">
            <div style={{ flex: 1 }}>
              <div className="dash-skel" style={{ height: 14, width: 120, marginBottom: 12 }} />
              <div className="dash-skel" style={{ height: 28, width: '45%', marginBottom: 10 }} />
              <div className="dash-skel" style={{ height: 14, width: '60%' }} />
            </div>
          </div>
          <div className="home-widgets">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dash-skel" style={{ height: 104, borderRadius: 16 }} />
            ))}
          </div>
          <div className="dash__body">
            <div className="dash__main">
              <div className="dash-skel" style={{ height: 200, borderRadius: 18 }} />
              <div className="dash-skel" style={{ height: 260, borderRadius: 18 }} />
            </div>
            <div className="dash__side">
              <div className="dash-kpis">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="dash-skel" style={{ height: 96, borderRadius: 14 }} />
                ))}
              </div>
              <div className="dash-skel" style={{ height: 220, borderRadius: 18 }} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (isError && !courses) {
    return (
      <section className="section">
        <div className="container">
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      {/* One-time grade prompt — self-gates on hydrated + signed-in + !gradeChosen */}
      <WelcomeGradeModal />
      <div className="container dash dash--st">
        {/* Greeting — one quiet line. The action below is the headline, not
            this; the old version paired it with an "Explorer le catalogue"
            button that duplicated the courses panel's own "Tous les cours". */}
        <header className="dash__header">
          <h1 className="dash__title">
            {isCreole ? 'Bonjou, ' : 'Bonjour, '}<b>{firstName || (isCreole ? 'zanmi' : 'à vous')}</b>.
          </h1>
        </header>

        {/* ── Lead action: resume where you left off (Coursera's pattern) ──
            Five separate blocks used to sit between the greeting and anything
            a student could act on. This is now the first thing on the page. */}
        {resume && (
          <section className="dash-resume" aria-label={isCreole ? 'Kontinye' : 'Reprendre'}>
            {subjectCover(resume.course.subject) ? (
              <img
                className="dash-resume__cover"
                src={subjectCover(resume.course.subject)}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="dash-resume__cover dash-resume__cover--glyph" aria-hidden="true">
                <BookOpen size={28} strokeWidth={1.7} />
              </span>
            )}
            <div className="dash-resume__body">
              <span className="dash-resume__eyebrow">
                {resume.isEnrolled
                  ? (isCreole ? 'Kontinye kote ou te ye a' : 'Reprenez où vous en étiez')
                  : (isCreole ? 'Kòmanse aprann' : 'Commencez à apprendre')}
              </span>
              <h2 className="dash-resume__title">{resume.course.name || resume.course.title}</h2>
              {resume.isEnrolled && resume.total > 0 && (
                <>
                  <span className="dash-resume__bar" aria-hidden="true">
                    <span style={{ width: `${resume.percent}%` }} />
                  </span>
                  <span className="dash-resume__meta">
                    {progressLoading
                      ? (isCreole ? 'Ap chaje…' : 'Chargement…')
                      : (isCreole
                        ? `${resume.percent}% · ${resume.remaining} leson rete`
                        : `${resume.percent}% · ${resume.remaining} leçon${resume.remaining === 1 ? '' : 's'} restante${resume.remaining === 1 ? '' : 's'}`)}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              className="button button--primary dash-resume__cta"
              onClick={() => navigate(`/courses/${resume.course.id}`)}
            >
              <PlayCircle size={17} aria-hidden="true" />
              {resume.isEnrolled
                ? (isCreole ? 'Kontinye' : 'Continuer')
                : (isCreole ? 'Kòmanse' : 'Commencer')}
            </button>
          </section>
        )}

        {/* ── "What's next" region ──
            Three components that all answer the same question used to stack as
            three unrelated banners. They still self-hide independently (each
            returns null), so this wrapper carries no chrome of its own — it
            collapses to nothing when they all opt out. Ordered most-concrete
            first: questions actually waiting, then a contextual nudge, then
            ambient countdown/readiness. */}
        <div className="dash__next">
          <ReviewBanner />
          <SmartSuggestion />
          <DashHeroStrip />
        </div>

        <div className="dash__body">
          {/* ───────────── MAIN COLUMN ───────────── */}
          <div className="dash__main">

            {/* Continue learning */}
            <section className="dash-panel">
              <div className="dash-panel__head">
                <h2 className="dash-panel__title">
                  <BookOpen size={18} /> {isCreole ? 'Kontinye aprann' : "Continuer l'apprentissage"}
                  {enrolledCourses.length > 0 && <span className="dash-panel__count">{enrolledCourses.length}</span>}
                </h2>
                <button className="dash-panel__link" onClick={() => navigate('/courses')} type="button">
                  {isCreole ? 'Tout kou' : 'Tous les cours'} <ChevronRight size={15} />
                </button>
              </div>

              {enrolledCourses.length > 0 ? (
                <div className="dash-courses">
                  {enrolledCourses.slice(0, 4).map((course) => {
                    const totalLessons = countCourseLessons(course);
                    const p = progressByCourseId.get(course.id) || null;
                    const completedLessons = p?.completedLessons?.length || 0;
                    const percent = calculateCompletionPercentage(p, totalLessons || 0);
                    const remaining = Math.max(0, (totalLessons || 0) - completedLessons);

                    return (
                      <button
                        key={course.id}
                        type="button"
                        className="dash-course"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        aria-label={course.name || course.title || course.id}
                      >
                        <span className="dash-course__badge" data-subject={subjectCode(course.subject)}>
                          {subjectInitial(course.subject)}
                        </span>
                        <span className="dash-course__body">
                          <span className="dash-course__top">
                            <span className="dash-course__name">{course.name || course.title}</span>
                            <span className="dash-course__pct">{progressLoading ? '—' : `${percent}%`}</span>
                          </span>
                          <span className="dash-course__bar" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </span>
                          <span className="dash-course__meta">
                            {progressLoading
                              ? (isCreole ? 'Ap chaje…' : 'Chargement…')
                              : (isCreole
                                ? `${completedLessons}/${totalLessons || 0} leson · ${remaining} rete`
                                : `${completedLessons}/${totalLessons || 0} leçons · ${remaining} restantes`)}
                          </span>
                        </span>
                        <ChevronRight size={18} className="dash-course__chev" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="dash-empty">
                  <p>
                    {isCreole
                      ? 'Ou poko gen kou. Gade katalòg la pou enskri nan premye kou ou.'
                      : 'Aucun cours pour le moment. Explorez le catalogue pour vous inscrire à votre premier cours.'}
                  </p>
                  <button className="button button--primary" onClick={() => navigate('/courses')}>
                    {isCreole ? 'Eksplore kou yo' : 'Explorer les cours'}
                  </button>
                </div>
              )}
            </section>

            {/* Recent activity — quiz + exams side by side */}
            <div className="dash-activity-cols">
              <section className="dash-panel">
                <div className="dash-panel__head">
                  <h2 className="dash-panel__title"><Target size={18} /> Quiz</h2>
                  <button className="dash-panel__link" onClick={() => navigate('/quizzes')} type="button">
                    {isCreole ? 'Wè' : 'Voir'} <ChevronRight size={15} />
                  </button>
                </div>

                {(quizLoading && user?.uid) ? (
                  <div className="dash-empty"><p>{isCreole ? 'Ap chaje…' : 'Chargement…'}</p></div>
                ) : quizzesTaken > 0 ? (
                  <div className="dash-activity">
                    {recentQuizActivityRows.slice(0, 4).map((a, idx) => {
                      const pct = typeof a.percentage === 'number' ? Math.round(a.percentage) : 0;
                      const good = pct >= 80;
                      const courseName = a.courseId ? (courses?.find((c) => c.id === a.courseId)?.name || '') : '';
                      const label = humanizeQuizId(a.quizId, isCreole);
                      const dateMs = a.attemptedAtMs || a.attemptedAt_ms || a.date || Date.now();
                      return (
                        <div key={`${a.quizId || 'quiz'}-${idx}`} className="dash-activity__row">
                          <div className="dash-activity__meta">
                            <span className="dash-activity__title">{label}{courseName ? ` · ${courseName}` : ''}</span>
                            <span className="dash-activity__date">{formatShortDate(dateMs, locale)}</span>
                          </div>
                          <span className={`dash-activity__tag ${good ? 'dash-activity__tag--success' : 'dash-activity__tag--error'}`}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dash-empty">
                    <p>{isCreole ? 'Fè premye quiz ou pou swiv pèfòmans ou.' : 'Faites votre premier quiz pour suivre votre performance.'}</p>
                    <button className="button button--primary button--sm" onClick={() => navigate('/quizzes')} type="button">
                      {isCreole ? 'Kòmanse yon quiz' : 'Commencer un quiz'}
                    </button>
                  </div>
                )}
              </section>

              <section className="dash-panel">
                <div className="dash-panel__head">
                  <h2 className="dash-panel__title">
                    <ClipboardList size={18} /> {isCreole ? 'Egzamen' : 'Examens'}
                    {examSummary.submitted > 0 && (
                      <span className="dash-panel__count">{examSummary.submitted} {isCreole ? 'soumèt' : 'soumis'}</span>
                    )}
                  </h2>
                  <button className="dash-panel__link" onClick={() => navigate('/exams')} type="button">
                    {isCreole ? 'Wè' : 'Voir'} <ChevronRight size={15} />
                  </button>
                </div>

                {(examLoading && user?.uid) ? (
                  <div className="dash-empty"><p>{isCreole ? 'Ap chaje…' : 'Chargement…'}</p></div>
                ) : (recentExamAttempts.length > 0) ? (
                  <div className="dash-activity">
                    {recentExamAttempts.slice(0, 4).map((a, idx) => {
                      const status = a?.status || '';
                      const isSubmitted = status === 'submitted';
                      const tagClass = isSubmitted ? 'dash-activity__tag--success' : 'dash-activity__tag--neutral';
                      const catalogExam = a?.exam_id ? examByKey.get(String(a.exam_id)) : null;
                      const named = catalogExam ? sessionRowName(catalogExam, isCreole ? 'ht' : 'fr') : null;
                      const title = named
                        ? `${catalogExam._subject ? `${catalogExam._subject} · ` : ''}${named.title}`
                        : (a?.exam_title || a?.examTitle || (isCreole ? 'Egzamen' : 'Examen'));
                      const dateMs = a?.updated_at_ms || a?.submitted_at_ms || a?.started_at_ms || Date.now();
                      const urlLevel = levelToUrl(a?.level);
                      const ctaLabel = isSubmitted ? (isCreole ? 'Rezilta' : 'Résultats') : (isCreole ? 'Kontinye' : 'Reprendre');
                      const onOpen = () => {
                        if (!a?.exam_id || !urlLevel) return navigate('/exams');
                        if (isSubmitted) return navigate(`/exams/${urlLevel}/${a.exam_id}/results`);
                        return navigate(`/exams/${urlLevel}/${a.exam_id}/take`, { state: { autostart: true } });
                      };
                      return (
                        <div key={`${a?.exam_id || 'exam'}-${idx}`} className="dash-activity__row">
                          <div className="dash-activity__meta">
                            <span className="dash-activity__title">{title}</span>
                            <span className="dash-activity__date">{formatShortDate(dateMs, locale)}</span>
                          </div>
                          <button type="button" className={`dash-activity__tag ${tagClass}`} onClick={onOpen}>
                            {ctaLabel} <ChevronRight size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dash-empty">
                    <p>{isCreole ? 'Fè yon egzamen blan pou jenere nòt preparasyon ou.' : 'Passez un examen blanc pour générer votre score de préparation.'}</p>
                    <button className="button button--primary button--sm" onClick={() => navigate('/exams')} type="button">
                      {isCreole ? 'Kòmanse yon egzamen' : 'Commencer un examen'}
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* ───────────── SIDE COLUMN ───────────── */}
          <aside className="dash__side">
            {/* Weekly leaderboard */}
            <Leaderboard variant="compact" />

            {/* Study plan CTA */}
            <section className="dash-panel dash-studyplan">
              <div className="dash-panel__head">
                <h2 className="dash-panel__title">
                  <ClipboardList size={18} /> {isCreole ? 'Plan Etid' : "Plan d'étude"}
                </h2>
              </div>
              <p className="dash-studyplan__text">
                {isCreole
                  ? 'Jwenn yon plan etid pèsonalize ak revizyon espase pou prepare bak ou.'
                  : "Obtenez un plan d'étude personnalisé avec révision espacée pour préparer votre bac."}
              </p>
              <button className="dash-studyplan__btn" onClick={() => navigate('/study-plan')} type="button">
                {isCreole ? 'Wè plan an' : 'Voir le plan'} <ChevronRight size={15} />
              </button>
            </section>
          </aside>
        </div>

        {/* ── Your numbers, last ──
            Four stat tiles used to sit above the fold, so the page opened as a
            status report you couldn't act on. Stats are for looking back;
            they belong after the learning content. */}
        <section className="dash__tiles" aria-label={isCreole ? 'Pwogrè ou' : 'Votre progression'}>
          <h2 className="dash__tiles-title">{isCreole ? 'Pwogrè ou' : 'Votre progression'}</h2>
          <StatTileRow>
            <StatTile
              label={isCreole ? 'Seri' : 'Série'}
              value={currentStreak}
              unit={isCreole ? 'jou' : 'j'}
              tone={currentStreak > 0 ? 'good' : 'muted'}
              delta={isCreole ? 'jou youn dèyè lòt' : 'jours consécutifs'}
            />
            <StatTile
              label={isCreole ? 'Quiz fini' : 'Quiz faits'}
              value={quizzesTaken}
              tone="accent"
              delta={isCreole ? 'total' : 'au total'}
            />
            <StatTile
              label={isCreole ? 'Mwayèn' : 'Score moyen'}
              value={quizzesTaken ? `${avgScore}` : '—'}
              unit={quizzesTaken ? '%' : undefined}
              tone={avgScore >= 70 ? 'good' : avgScore >= 50 ? 'warn' : 'muted'}
              delta={isCreole ? 'sou tout quiz yo' : 'sur tous les quiz'}
            />
            <StatTile
              label={isCreole ? 'Klasman' : 'Rang · classe'}
              value={myRank ? `#${myRank}` : '—'}
              tone="accent"
              delta={isCreole ? 'semèn sa a' : 'cette semaine'}
            />
          </StatTileRow>
        </section>
      </div>
    </section>
  );
}