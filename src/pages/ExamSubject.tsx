import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CheckCircle2, PlayCircle, Clock, Save, LogIn } from 'lucide-react';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, subjectColor } from '../utils/examUtils';
import { examTopicTags } from '../../shared/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { URL_LEVEL_TO_RAW, LEVEL_SLUG_LABELS } from '../utils/examLevels';
import CardCover from '../components/CardCover';
import { SUBJECT_GLYPHS } from '../utils/subjectGlyphs';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/StateViews';
import './ExamOverview.css'; // shared .exam-overview__crumbs
import './ExamSubject.css';

/**
 * ExamSubject — /exams/:level/matiere/:subject
 *
 * One subject's exam bank as a clean, Coursera-style session list. The
 * browse grid sells the SUBJECT (one card each); this page is where the
 * years live — chronological rows with human names ("Session de juillet
 * 2025", not the records-office title), difficulty, and the student's
 * own status per paper. Rows open the exam overview page.
 */

const DIFFICULTY_DOT: Record<number, { fr: string; ht: string; cls: string }> = {
  1: { fr: 'Facile', ht: 'Fasil', cls: 'easy' },
  2: { fr: 'Facile', ht: 'Fasil', cls: 'easy' },
  3: { fr: 'Moyen', ht: 'Mwayen', cls: 'medium' },
  4: { fr: 'Difficile', ht: 'Difisil', cls: 'hard' },
  5: { fr: 'Difficile', ht: 'Difisil', cls: 'hard' },
};

/**
 * The filière/série a paper was set for — the distinguisher that was on the
 * floor.
 *
 * Eleven maths papers rendered as identical rows because `sessionRowName`
 * looks at `tracks`, and `tracks` is `['ALL']` on essentially every catalog
 * entry. `_series` (parsed off the records-office title by `buildExamIndex`)
 * is what actually separates same-session papers: "SVT, MATH" vs "SES, MATH"
 * vs "SMP, MATH" for the four July 2025 maths sujets. Only shown when `tracks`
 * carries nothing, so the two never repeat each other.
 */
function seriesLabel(exam: any, ht: boolean): string {
  const tracks = (Array.isArray(exam?.tracks) ? exam.tracks : []).filter(
    (tr: string) => tr && tr !== 'ALL',
  );
  if (tracks.length > 0) return '';
  const raw = String(exam?._series || '').trim();
  if (!raw) return '';
  const parts = [...new Set(
    raw.split(/[,·/]+/).map((x) => x.trim().toUpperCase()).filter(Boolean),
  )].slice(0, 3);
  if (parts.length === 0) return '';
  const label = ht ? 'Seri' : parts.length > 1 ? 'Séries' : 'Série';
  return `${label} ${parts.join(' · ')}`;
}

function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
  });
}

/** examId → answers saved so far, from ExamTake's local draft mirror.
 *  Read-only: the rows still open the overview, which owns the resume action.
 *  Submitted / empty drafts are ignored so "en cours" is never a lie. */
function localDraftProgress(): Record<string, number> {
  const out: Record<string, number> = {};
  const PREFIX = 'edlight-exam-draft-';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d?.status === 'submitted') continue;
      const answered = d?.answers ? Object.keys(d.answers).length : 0;
      if (answered === 0 && !(d?.currentQ > 0)) continue;
      out[k.slice(PREFIX.length)] = answered;
    }
  } catch { /* localStorage unavailable (private mode / blocked) */ }
  return out;
}

export default function ExamSubject() {
  const { level, subject: subjectParam } = useParams();
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const userId = useStore((s) => s.user?.uid);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);

  const subject = decodeURIComponent(subjectParam || '');
  const { data: allExams, isPending, isError, refetch } = useExamCatalog();
  const attempts = useExamAttempts();
  const [statusFilter, setStatusFilter] = useState<'' | 'todo' | 'done'>('');
  // In-progress drafts, read once from the synchronous localStorage mirror
  // ExamTake writes. Signed-out students have no draft at all (ExamTake's save
  // effect needs a uid), so an absent key honestly means "not started here".
  const drafts = useMemo(() => localDraftProgress(), []);

  const exams = useMemo(() => {
    if (!allExams) return [];
    const rawLevel = URL_LEVEL_TO_RAW[level || ''] || level;
    return buildExamIndex(allExams).exams
      .filter((e: any) => e._level === rawLevel || e.level === rawLevel)
      .filter((e: any) => (e._subject || e.subject) === subject)
      .sort((a: any, b: any) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  }, [allExams, level, subject]);

  const keyOf = (e: any) => String(e.exam_id ?? e._idx);
  const doneCount = exams.filter((e) => attempts[keyOf(e)]).length;
  const best = exams.reduce((mx, e) => {
    const p = attempts[keyOf(e)]?.percentage;
    return typeof p === 'number' && p > mx ? p : mx;
  }, -1);

  const visible = exams.filter((e) => {
    if (!statusFilter) return true;
    const done = !!attempts[keyOf(e)];
    return statusFilter === 'done' ? done : !done;
  });

  const color = subjectColor(subject);
  const glyph = SUBJECT_GLYPHS[subject] || 'book';
  const levelLabel = LEVEL_SLUG_LABELS[level || '']?.[ht ? 'ht' : 'fr'] || level;

  if (isPending) {
    return (
      <section className="section exam-subject">
        <div className="container exam-subject__container" aria-busy="true">
          <Skeleton width={220} height={16} radius={999} style={{ marginBottom: '1.2rem' }} />
          <Skeleton width="100%" height={120} radius={20} style={{ marginBottom: '1.5rem' }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={64} radius={14} style={{ marginBottom: '0.7rem' }} />
          ))}
        </div>
      </section>
    );
  }

  // A failed fetch is not an empty catalog — say so, and offer a retry rather
  // than the misleading "aucune épreuve" below (§8: truthful states).
  if (isError) {
    return (
      <section className="section exam-subject">
        <div className="container exam-subject__container">
          <EmptyState
            title={L('Catalogue indisponible', 'Katalòg la pa disponib')}
            message={L(
              'Nous n’avons pas pu charger les épreuves. Vérifiez votre connexion, puis réessayez.',
              'Nou pa t ka chaje egzamen yo. Tcheke koneksyon ou, epi eseye ankò.',
            )}
            action={{ label: L('Réessayer', 'Eseye ankò'), onClick: () => { void refetch(); } }}
          />
        </div>
      </section>
    );
  }

  if (exams.length === 0) {
    return (
      <section className="section exam-subject">
        <div className="container exam-subject__container">
          <EmptyState
            title={L('Aucune épreuve pour cette matière', 'Pa gen egzamen pou matyè sa a')}
            message={L('Le catalogue évolue régulièrement — revenez bientôt.', 'Katalòg la ap grandi souvan — tounen talè.')}
            action={{ label: L('Toutes les matières', 'Tout matyè yo'), onClick: () => navigate(`/exams/${level}`) }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="section exam-subject" style={{ '--exam-accent': color } as React.CSSProperties}>
      <div className="container exam-subject__container">
        <nav className="exam-overview__crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
          <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
          <span aria-hidden>›</span>
          <Link to={`/exams/${level}`}>{levelLabel}</Link>
          <span aria-hidden>›</span>
          <span>{subject}</span>
        </nav>

        {/* Subject hero */}
        <header className="exam-subject__hero">
          <CardCover className="exam-subject__cover" glyph={glyph} color={color} />
          <div className="exam-subject__hero-body">
            <h1 className="exam-subject__title">{subject}</h1>
            <p className="exam-subject__meta">
              {levelLabel} · {exams.length} {exams.length === 1 ? L('épreuve officielle', 'egzamen ofisyèl') : L('épreuves officielles', 'egzamen ofisyèl')}
              {yearRange(exams) ? ` · ${yearRange(exams)}` : ''}
            </p>
            {doneCount > 0 && (
              <p className="exam-subject__progress">
                <CheckCircle2 size={15} aria-hidden />
                {doneCount}/{exams.length} {L('terminées', 'fini')}
                {best >= 0 ? ` · ${L('meilleur score', 'pi bon nòt')} ${best}%` : ''}
              </p>
            )}
          </div>
        </header>

        {/* What these rows are, and what happens to a result — stated once for
            the list rather than repeated on every row (§6.4). Both lines are
            read from real behaviour: each row prints its own duration or says
            it has none, and ExamTake's save effect returns early without a
            uid, so a signed-out attempt genuinely is not kept. */}
        <p className="exam-subject__terms">
          <Clock size={14} aria-hidden />
          {L(
            'Épreuves officielles complètes — chaque ligne indique sa durée, ou qu’elle n’est pas chronométrée.',
            'Epwèv ofisyèl konplè — chak liy montre dire li, oswa li di li pa gen kwonomèt.',
          )}
          {userId ? <Save size={14} aria-hidden /> : <LogIn size={14} aria-hidden />}
          {userId
            ? L('Vos résultats sont enregistrés.', 'Rezilta ou yo anrejistre.')
            : L('Résultats non enregistrés hors connexion.', 'Rezilta pa anrejistre si ou pa konekte.')}
          {!userId && (
            <button type="button" className="exam-subject__terms-link" onClick={() => setShowAuthModal(true)}>
              {L('Se connecter', 'Konekte')}
            </button>
          )}
        </p>

        {/* Status filter — the same segmented control as the level browser, so
            the two steps of the path read as one screen family. Counts are
            real (attempt records), never estimated. */}
        <div className="exam-subject__filters" role="group" aria-label={L('Filtrer par statut', 'Filtre dapre eta')}>
          {([
            ['', L('Toutes', 'Tout'), exams.length],
            ['todo', L('À faire', 'Pou fè'), exams.length - doneCount],
            ['done', L('Terminées', 'Fini'), doneCount],
          ] as const).map(([value, label, count]) => (
            <button
              key={value || 'all'}
              type="button"
              className={`exam-subject__chip${statusFilter === value ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(value as any)}
              aria-pressed={statusFilter === value}
              disabled={count === 0 && statusFilter !== value}
            >
              {label} <span className="exam-subject__chip-count">{count}</span>
            </button>
          ))}
        </div>

        {/* Session list */}
        <ol className="exam-subject__list">
          {visible.map((e: any) => {
            const key = keyOf(e);
            const name = sessionRowName(e, ht ? 'ht' : 'fr');
            const attempt = attempts[key];
            const pct = attempt?.percentage ?? null;
            const tone = pct == null ? '' : pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'low';
            const diff = DIFFICULTY_DOT[e.difficulty as number];
            const answered = drafts[key];
            const topicTags = examTopicTags(e.topics);
            const inProgress = !attempt && answered !== undefined;
            return (
              <li key={key}>
                <Link
                  className={`exam-session${inProgress ? ' exam-session--resume' : ''}`}
                  to={`/exams/${level}/${key}`}
                >
                  <span className="exam-session__body">
                    <span className="exam-session__title">{name.title}</span>
                    <span className="exam-session__meta">
                      {[
                        name.subtitle,
                        seriesLabel(e, ht),
                        e._questionCount ? `${e._questionCount} ${L('questions', 'kesyon')}` : '',
                        e.duration_minutes
                          ? `${e.duration_minutes} min`
                          : L('non chronométré', 'san kwonomèt'),
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {/*
                      * What is actually IN this paper.
                      *
                      * Without it a session's papers are indistinguishable:
                      * eleven Baccalauréat 2025 maths papers all render as
                      * "Session de juillet 2025 · 13 questions · 180 min", and
                      * `tracks` is `['ALL']` on every one. The topics are the
                      * only thing that differs, filtered by `examTopicTags`
                      * because the raw list mixes real subject areas with the
                      * paper's own section instructions.
                      */}
                    {topicTags.length > 0 && (
                      <span className="exam-session__topics">
                        {topicTags.map((tag) => (
                          <span key={tag} className="exam-session__topic">{tag}</span>
                        ))}
                      </span>
                    )}
                  </span>
                  {diff && (
                    <span className={`exam-session__diff exam-session__diff--${diff.cls}`}>
                      {ht ? diff.ht : diff.fr}
                    </span>
                  )}
                  {/* An unfinished draft must not be labelled "À faire" — the
                      student expects to resume, not to start over (§6.4). */}
                  {attempt ? (
                    <span className={`exam-session__score exam-session__score--${tone}`}>
                      {pct != null ? `${pct}%` : '✓'}
                    </span>
                  ) : inProgress ? (
                    <span className="exam-session__resume">
                      <PlayCircle size={14} aria-hidden />
                      {answered > 0
                        ? L(`En cours · ${answered} rép.`, `Ap fèt · ${answered} repons`)
                        : L('En cours', 'Ap fèt')}
                    </span>
                  ) : (
                    <span className="exam-session__todo">{L('À faire', 'Pou fè')}</span>
                  )}
                  <ChevronRight size={17} className="exam-session__chevron" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>

        {visible.length === 0 && (
          <p className="text-muted exam-subject__none">
            {statusFilter === 'done'
              ? L('Aucune épreuve terminée pour le moment.', 'Poko gen egzamen fini.')
              : L('Tout est terminé — bravo !', 'Tout bagay fini — bravo !')}
          </p>
        )}
      </div>
    </section>
  );
}
