import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, ClipboardList, AlertTriangle, PlayCircle,
} from '../../components/icons';
import { videoThumb, firstThumb } from '../../utils/videoThumb';
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
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const uid = user?.uid || null;

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
    const from = Math.floor(all.length / 3);
    return firstThumb([...all.slice(from), ...all.slice(0, from)], 'hq')?.src || null;
  };

  return (
    <div className="lws lws--premium">

      <div className="lws-grid">
        <div className="lws-main">
          {/* ── Subjects: each opens on a frame of its next lesson ─────────── */}
          <section className="lws-section" aria-labelledby="lws-subjects">
            <div className="lws-section__head">
              <h2 id="lws-subjects">{L('Tes matières', 'Matyè ou yo')}</h2>
              <span className="lws-pill">{myLevel ? levelLabel(myLevel) : L('Programme MENFP', 'Pwogram MENFP')}</span>
            </div>
            <div className="lws-subjects">
              {subjects.map(({ code, course, stats, nextUnit, unitsDone, unitsTotal }) => {
                const frame = frameFor(course, nextUnit, stats.completed > 0);
                const r = 20;
                const circ = 2 * Math.PI * r;
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
                        <span className="lws-ring" aria-label={`${stats.pct}%`}>
                          <svg viewBox="0 0 48 48" aria-hidden="true">
                            <circle cx="24" cy="24" r={r} />
                            <circle className={`lws-ring__arc lws-stroke--${code}`} cx="24" cy="24" r={r}
                              strokeDasharray={circ} strokeDashoffset={circ * (1 - stats.pct / 100)} />
                          </svg>
                          <b>{stats.pct}%</b>
                        </span>
                      </span>
                      {nextUnit
                        ? <span className="lws-subj__next"><em>{L('Prochaine étape', 'Pwochen etap')}</em>{nextUnit.title}</span>
                        : <span className="lws-subj__next"><em>{L('Bravo', 'Bravo')}</em>{L('Toutes les unités sont terminées.', 'Tout inite yo fini.')}</span>}
                      <span className="lws-subj__meta">
                        {L(`${stats.completed}/${stats.total} leçons · ${unitsDone}/${unitsTotal} unités`, `${stats.completed}/${stats.total} leson · ${unitsDone}/${unitsTotal} inite`)}
                      </span>
                      <span className="lws-subj__cta">
                        {stats.completed > 0 ? L('Continuer', 'Kontinye') : L('Commencer', 'Kòmanse')} <ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── Exams ────────────────────────────────────────────────────── */}
          <section className="lws-section" aria-labelledby="lws-exams">
            <div className="lws-section__head">
              <h2 id="lws-exams"><ClipboardList size={20} aria-hidden="true" /> {L('Tes examens blancs', 'Egzamen blan ou yo')}</h2>
              <Link to="/exams" className="lws-link">{L('Tous les sujets', 'Tout sijè yo')} <ChevronRight size={14} aria-hidden="true" /></Link>
            </div>
            {examRows.length === 0 ? (
              <div className="lws-card lws-empty">
                <p>{L('Aucune épreuve commencée. Les vrais sujets du Bac t’attendent, avec leur durée officielle.', 'Ou poko kòmanse okenn eprèv. Vrè sijè Bak yo ap tann ou, ak dire ofisyèl yo.')}</p>
                <Link to="/exams" className="lws-btn lws-btn--primary">{L('Choisir un sujet', 'Chwazi yon sijè')}</Link>
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
                    <span className={`lws-btn ${row.submitted ? 'lws-btn--soft' : 'lws-btn--primary'}`}>{row.cta}</span>
                  </button>
                ))}
              </div>
            )}
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
