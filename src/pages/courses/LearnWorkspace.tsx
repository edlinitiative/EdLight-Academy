import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PlayCircle, ChevronRight, ClipboardList, AlertTriangle,
} from '../../components/icons';
import useStore from '../../contexts/store';
import { listRecentExamAttempts } from '../../services/userActivity';
import { loadReviewMap } from '../../services/reviewService';
import { dueQuestionIds } from '../../utils/review';
import { normalizeExamCatalog } from '../../utils/examCatalog';
import { buildExamIndex, displayStoredExamTitle } from '../../utils/examUtils';
import { sessionRowName } from '../../utils/examNaming';
import { useExamAttempts } from '../../hooks/useExamAttempts';
import ExamCountdown from '../../components/ExamCountdown';
import DailyQuests from '../../components/DailyQuests';
import MySchoolCard from '../../components/MySchoolCard';

/**
 * The Apprendre tab's workspace — Ted's "Espace de travail" mockup, wired to
 * the student's own data and nothing else:
 *
 *   command bar   who they are (class, school) + two real shortcuts
 *   resume card   the last lesson they touched (store.lastActivity), else the
 *                 course they are furthest into (Firestore progress)
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
  courses, courseStats, courseLevel, subjectName, levelLabel, myLevel, progressByCourseId, SubjectTile, L,
}: {
  courses: any[];
  courseStats: (c: any) => Stats;
  courseLevel: (c: any) => string;
  subjectName: (code: string) => string;
  levelLabel: (lv: string) => string;
  myLevel?: string;
  progressByCourseId: Map<string, any>;
  SubjectTile: React.ComponentType<{ code: string; size?: string }>;
  L: (fr: string, ht: string) => string;
}) {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const lastActivity = useStore((s) => s.lastActivity);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const uid = user?.uid || null;

  // ── Resume ────────────────────────────────────────────────────────────────
  const live = useMemo(() => courses.filter((c) => !c.comingSoon), [courses]);
  const furthest = useMemo(() => live
    .filter((c) => progressByCourseId.has(c.id))
    .map((c) => ({ course: c, stats: courseStats(c) }))
    .filter(({ stats }) => stats.pct > 0 && stats.pct < 100)
    .sort((a, b) => b.stats.pct - a.stats.pct)[0] || null, [live, progressByCourseId, courseStats]);
  const lessonResume = lastActivity && lastActivity.type === 'lesson' ? lastActivity : null;

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
  const { data: attempts = [] } = useQuery({
    queryKey: ['dashboard-exam-attempts', uid],
    queryFn: () => listRecentExamAttempts(uid, 25),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
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

  // ── Weak spots: missed questions still due, grouped by subject + unit ─────
  const [weak, setWeak] = useState<{ code: string; unitNo?: number; count: number }[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadReviewMap(uid).then((map) => {
      if (!alive) return;
      const groups = new Map<string, { code: string; unitNo?: number; count: number }>();
      for (const id of dueQuestionIds(map)) {
        const e = map[id];
        const code = e?.subjectCode || '';
        const key = `${code}:${e?.unitNo ?? ''}`;
        const g = groups.get(key) || { code, unitNo: e?.unitNo, count: 0 };
        g.count += 1;
        groups.set(key, g);
      }
      setWeak([...groups.values()].sort((a, b) => b.count - a.count).slice(0, 3));
    }).catch(() => { if (alive) setWeak([]); });
    return () => { alive = false; };
  }, [uid]);
  const weakTotal = (weak || []).reduce((n, w) => n + w.count, 0);

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

  const resumePath = lessonResume?.path || (furthest ? `/courses/${furthest.course.id}` : '');

  return (
    <div className="lws">
      <div className="lws-grid">
        <div className="lws-main">
          {/* ── Resume ───────────────────────────────────────────────────── */}
          {resumePath ? (
            <section className="lws-card lws-resume">
              <span className="lws-eyebrow lws-eyebrow--live">
                <span className="lws-dot" aria-hidden="true" />
                {L('Reprendre où tu en étais', 'Kontinye kote ou te ye a')}
              </span>
              {furthest && (
                <span className="lws-pill lws-pill--azure">
                  {subjectName(furthest.course.subject)} · {levelLabel(courseLevel(furthest.course))}
                </span>
              )}
              <h2 className="lws-resume__title">{lessonResume?.title || furthest?.course.name}</h2>
              {(lessonResume?.subtitle || furthest) && (
                <p className="lws-resume__sub">
                  {lessonResume?.subtitle && <>{lessonResume.subtitle}</>}
                  {lessonResume?.subtitle && furthest && ' · '}
                  {furthest && L(
                    `${furthest.stats.completed}/${furthest.stats.total} leçons · ${furthest.stats.remaining} restantes`,
                    `${furthest.stats.completed}/${furthest.stats.total} leson · ${furthest.stats.remaining} rete`,
                  )}
                </p>
              )}
              {furthest && (
                <div className="lws-meter" aria-hidden="true">
                  <span style={{ width: `${furthest.stats.pct}%` }} />
                </div>
              )}
              <button type="button" className="lws-btn lws-btn--primary" onClick={() => navigate(resumePath)}>
                <PlayCircle size={18} aria-hidden="true" /> {L('Reprendre la leçon', 'Kontinye leson an')}
              </button>
            </section>
          ) : null}

          {/* ── Subjects ─────────────────────────────────────────────────── */}
          <section className="lws-section" aria-labelledby="lws-subjects">
            <div className="lws-section__head">
              <h2 id="lws-subjects">{L('Ta progression par matière', 'Pwogrè ou pa matyè')}</h2>
              <span className="lws-pill">{myLevel ? levelLabel(myLevel) : L('Programme MENFP', 'Pwogram MENFP')}</span>
            </div>
            <div className="lws-subjects">
              {subjects.map(({ code, course, stats, nextUnit, unitsDone, unitsTotal }) => (
                <article key={code} className="lws-card lws-subject">
                  <div className="lws-subject__top">
                    <SubjectTile code={code} size="md" />
                    <div className="lws-subject__name">
                      <h3>{subjectName(code)}</h3>
                      <span>{levelLabel(courseLevel(course))}</span>
                    </div>
                    <strong className={`lws-subject__pct lws-tone--${code}`}>{stats.pct}%</strong>
                  </div>
                  <div className="lws-meter lws-meter--thin" aria-hidden="true">
                    <span className={`lws-fill--${code}`} style={{ width: `${stats.pct}%` }} />
                  </div>
                  <dl className="lws-subject__facts">
                    <div><dt>{L('Leçons', 'Leson')}</dt><dd>{stats.completed} / {stats.total}</dd></div>
                    <div><dt>{L('Unités terminées', 'Inite fini')}</dt><dd>{unitsDone} / {unitsTotal}</dd></div>
                  </dl>
                  {nextUnit && (
                    <p className="lws-subject__next">
                      <span>{L('Prochaine étape', 'Pwochen etap')}</span>
                      {nextUnit.title}
                    </p>
                  )}
                  <Link to={`/courses/${course.id}`} className="lws-btn lws-btn--soft">
                    {stats.completed > 0 ? L('Continuer', 'Kontinye') : L('Commencer', 'Kòmanse')}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          {/* ── Exams ────────────────────────────────────────────────────── */}
          <section className="lws-section" aria-labelledby="lws-exams">
            <div className="lws-section__head">
              <h2 id="lws-exams"><ClipboardList size={20} aria-hidden="true" /> {L('Tes examens blancs', 'Egzamen blan ou yo')}</h2>
              <Link to="/exams" className="lws-link">{L('Tous les sujets', 'Tout sijè yo')} <ChevronRight size={14} aria-hidden="true" /></Link>
            </div>
            <div className="lws-card lws-exams">
              {attempts.length === 0 ? (
                <div className="lws-empty">
                  <p>{L('Aucune épreuve commencée. Les vrais sujets du Bac t’attendent, avec leur durée officielle.', 'Ou poko kòmanse okenn eprèv. Vrè sijè Bak yo ap tann ou, ak dire ofisyèl yo.')}</p>
                  <Link to="/exams" className="lws-btn lws-btn--primary">{L('Choisir un sujet', 'Chwazi yon sijè')}</Link>
                </div>
              ) : attempts.slice(0, 4).map((a: any, i: number) => {
                const submitted = a?.status === 'submitted';
                const ex = a?.exam_id ? examByKey.get(String(a.exam_id)) : null;
                const named = ex ? sessionRowName(ex, isCreole ? 'ht' : 'fr') : null;
                const title = named
                  ? `${ex._subject ? `${ex._subject} · ` : ''}${named.title}`
                  : displayStoredExamTitle(a?.exam_title || a?.examTitle, a, L('Examen', 'Egzamen'));
                const lvl = levelToUrl(a?.level);
                const pct = best[String(a?.exam_id)]?.percentage;
                const open = () => {
                  if (!a?.exam_id || !lvl) return navigate('/exams');
                  if (submitted) return navigate(`/exams/${lvl}/${a.exam_id}/results`);
                  return navigate(`/exams/${lvl}/${a.exam_id}/take`, { state: { autostart: true, resume: true } });
                };
                return (
                  <div key={`${a?.exam_id || 'x'}-${i}`} className="lws-exam">
                    <div className="lws-exam__body">
                      <h4>{title}</h4>
                      <p>
                        {submitted
                          ? (typeof pct === 'number'
                            ? <span className="lws-exam__score">{L(`Meilleur score : ${Math.round(pct)} %`, `Pi bon nòt : ${Math.round(pct)} %`)}</span>
                            : L('Terminé', 'Fini'))
                          : <span className="lws-exam__open">{L('En cours — tes réponses sont enregistrées', 'An kou — repons ou yo anrejistre')}</span>}
                      </p>
                    </div>
                    <button type="button" className={`lws-btn ${submitted ? 'lws-btn--soft' : 'lws-btn--primary'}`} onClick={open}>
                      {submitted ? L('Voir le corrigé', 'Wè koreksyon an') : L('Reprendre', 'Kontinye')}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="lws-side">
          <ExamCountdown />

          <section className="lws-card lws-weak" aria-labelledby="lws-weak">
            <div className="lws-section__head">
              <h3 id="lws-weak"><AlertTriangle size={18} aria-hidden="true" /> {L('Points faibles', 'Pwen fèb')}</h3>
              <span className="lws-muted">{L('D’après tes erreurs', 'Selon erè ou yo')}</span>
            </div>
            {weak === null ? (
              <p className="lws-muted">{L('Chargement…', 'N ap chaje…')}</p>
            ) : weak.length === 0 ? (
              <p className="lws-muted">{L('Aucune erreur à revoir. Chaque question ratée dans un quiz apparaîtra ici.', 'Pa gen erè pou revize. Chak kesyon ou rate nan yon quiz ap parèt isit la.')}</p>
            ) : (
              <ul className="lws-weak__list">
                {weak.map((w) => (
                  <li key={`${w.code}-${w.unitNo}`}>
                    <div>
                      <strong>{w.code ? weakName(w.code) : L('Divers', 'Divès')}{w.unitNo ? ` · ${L('Unité', 'Inite')} ${w.unitNo}` : ''}</strong>
                      {unitTitle(w.code, w.unitNo) && <span>{unitTitle(w.code, w.unitNo)}</span>}
                    </div>
                    <span className="lws-weak__count">{w.count} {w.count === 1 ? L('question', 'kesyon') : L('questions', 'kesyon')}</span>
                  </li>
                ))}
              </ul>
            )}
            {weakTotal > 0 && (
              <Link to="/revision" className="lws-btn lws-btn--primary lws-btn--block">
                {L('Réviser maintenant', 'Revize kounye a')}
              </Link>
            )}
          </section>

          <div className="lws-quests"><DailyQuests /></div>

          <MySchoolCard where="courses" />
        </aside>
      </div>
    </div>
  );
}
