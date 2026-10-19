import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isOtherAccountDraft } from '../../shared/examDraft';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from '../components/icons';
import useStore from '../contexts/store';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex } from '../utils/examUtils';
import { examTopicTags } from '../../shared/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { URL_LEVEL_TO_RAW, LEVEL_SLUG_LABELS } from '../utils/examLevels';
import { Skeleton } from '../components/Skeleton';
import { durationLabel } from './examHubParts';
import './examPremium.css';

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
function localDraftProgress(uid?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  const PREFIX = 'edlight-exam-draft-';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d?.status === 'submitted' || isOtherAccountDraft(d, uid)) continue;
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
  const [query, setQuery] = useState('');
  // In-progress drafts, read once from the synchronous localStorage mirror
  // ExamTake writes. Signed-out students have no draft at all (ExamTake's save
  // effect needs a uid), so an absent key honestly means "not started here".
  const drafts = useMemo(() => localDraftProgress(userId), [userId]);

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

  const levelLabel = LEVEL_SLUG_LABELS[level || '']?.[ht ? 'ht' : 'fr'] || level;
  const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = fold(query.trim());
  const shown = q
    ? visible.filter((e: any) => fold([e.year, e.exam_title, e._session, ...(Array.isArray(e.topics) ? e.topics : [])].join(' ')).includes(q))
    : visible;

  // Rows grouped under their year, newest first — the year is what a student
  // scans for ("le sujet de 2023").
  const byYear = useMemo(() => {
    const out: Array<{ year: string; list: any[] }> = [];
    for (const e of shown) {
      const y = /^\d{4}$/.test(String(e.year)) ? String(e.year) : L('Sans année', 'San ane');
      const last = out[out.length - 1];
      if (last && last.year === y) last.list.push(e);
      else out.push({ year: y, list: [e] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, ht]);

  const frame = (children: React.ReactNode) => (
    <div className="xp"><div className="xp-page xp-page--narrow">{children}</div></div>
  );

  if (isPending) {
    return frame(
      <div className="xp-skel" aria-busy="true">
        <Skeleton width={220} height={16} radius={999} />
        <Skeleton width="40%" height={40} radius={12} />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={84} radius={18} />)}
      </div>,
    );
  }

  // A failed fetch is not an empty catalog — say so, and offer a retry rather
  // than the misleading "aucune épreuve" below (§8: truthful states). Offline
  // is a third state: the service worker keeps this index in DATA_CACHE, so
  // after one online load the list really is available offline.
  if (isError) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return frame(
      <section className="xp-empty">
        <h1 className="xp-h2">{offline ? L('Hors ligne', 'Pa sou entènèt') : L('Catalogue indisponible', 'Katalòg la pa disponib')}</h1>
        <p>
          {offline
            ? L('La liste des épreuves n’est pas encore enregistrée sur cet appareil. Connecte-toi une fois pour la charger : ensuite elle reste consultable hors ligne.',
              'Lis egzamen yo poko anrejistre sou aparèy sa a. Konekte yon fwa pou chaje l : apre sa ou ka gade l san entènèt.')
            : L('Nous n’avons pas pu charger les épreuves. Vérifie ta connexion, puis réessaie.',
              'Nou pa t ka chaje egzamen yo. Tcheke koneksyon ou, epi eseye ankò.')}
        </p>
        <button type="button" className="xp-btn" onClick={() => { void refetch(); }}>{L('Réessayer', 'Eseye ankò')}</button>
      </section>,
    );
  }

  if (exams.length === 0) {
    return frame(
      <section className="xp-empty">
        <h1 className="xp-h2">{L('Aucune épreuve pour cette matière', 'Pa gen egzamen pou matyè sa a')}</h1>
        <p>{L('Le catalogue évolue régulièrement, reviens bientôt.', 'Katalòg la ap grandi souvan, tounen talè.')}</p>
        <button type="button" className="xp-btn" onClick={() => navigate(`/exams/${level}`)}>{L('Toutes les matières', 'Tout matyè yo')}</button>
      </section>,
    );
  }

  return frame(
    <>
      <header className="xp-head">
        <div>
          <nav className="xp-crumbs" aria-label={L('Fil d’Ariane', 'Chemen')}>
            <Link to="/exams">{L('Examens', 'Egzamen')}</Link>
            <span aria-hidden>›</span>
            <Link to={`/exams/${level}`}>{levelLabel}</Link>
          </nav>
          <h1 className="xp-title">{subject}</h1>
          <p className="xp-lede">
            {exams.length} {L(exams.length > 1 ? 'sujets' : 'sujet', 'sijè')}
            {yearRange(exams) ? ` · ${yearRange(exams)}` : ''}
            {doneCount > 0 ? ` · ${doneCount} ${L(doneCount > 1 ? 'terminés' : 'terminé', 'fini')}` : ''}
            {best >= 0 ? ` · ${L('meilleur score', 'pi bon nòt')} ${best} %` : ''}
          </p>
          {/* Whether a result is kept, said once for the list. ExamTake's save
              effect returns early without a uid, so signed out it is not. */}
          {!userId && (
            <p className="xp-meta" style={{ marginTop: 6 }}>
              {L('Tes résultats ne sont pas enregistrés sans compte.', 'Rezilta ou pa anrejistre san kont.')}{' '}
              <button type="button" className="xp-link" onClick={() => setShowAuthModal(true)}>{L('Se connecter', 'Konekte')}</button>
            </p>
          )}
        </div>
        <div className="xp-tools">
          {/* Counts are real (attempt records), never estimated. */}
          <div className="xp-seg" role="group" aria-label={L('Filtrer par statut', 'Filtre dapre eta')}>
            {([
              ['', L('Tous', 'Tout'), exams.length],
              ['todo', L('À faire', 'Pou fè'), exams.length - doneCount],
              ['done', L('Terminés', 'Fini'), doneCount],
            ] as const).map(([value, label, count]) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatusFilter(value as any)}
                aria-pressed={statusFilter === value}
                disabled={count === 0 && statusFilter !== value}
              >
                {label} <b>{count}</b>
              </button>
            ))}
          </div>
          <label className="xp-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)}
              placeholder={L('Année, notion…', 'Ane, nosyon…')}
              aria-label={L('Chercher dans les sujets', 'Chèche nan sijè yo')} />
          </label>
        </div>
      </header>

      {byYear.map((g) => (
        <section key={g.year} className="xp-yeargroup" aria-labelledby={`xp-y-${g.year}`}>
          <div className="xp-yeargroup__head">
            <h2 id={`xp-y-${g.year}`} className="xp-yeargroup__year">{g.year}</h2>
            <span className="xp-yeargroup__count">{g.list.length} {L(g.list.length > 1 ? 'sujets' : 'sujet', 'sijè')}</span>
          </div>
          <ul className="xp-rows">
            {g.list.map((e: any) => {
              const key = keyOf(e);
              const name = sessionRowName(e, ht ? 'ht' : 'fr');
              const attempt = attempts[key];
              const pct = attempt?.percentage ?? null;
              const diff = DIFFICULTY_DOT[e.difficulty as number];
              const answered = drafts[key];
              // What is actually IN this paper: without the topics, eleven
              // 2025 maths papers read identically (`tracks` is ['ALL']).
              const topicTags = examTopicTags(e.topics);
              const inProgress = !attempt && answered !== undefined;
              const meta = [
                name.subtitle,
                seriesLabel(e, ht),
                e._questionCount ? `${e._questionCount} ${L('questions', 'kesyon')}` : '',
                durationLabel(e.duration_minutes, ht),
                diff ? (ht ? diff.ht : diff.fr) : '',
              ].filter(Boolean).join(' · ');
              return (
                <li key={key}>
                  <Link className="xp-row" to={`/exams/${level}/${key}`}>
                    <span className="xp-row__body">
                      <span className="xp-row__title">{name.title}</span>
                      <span className="xp-row__meta">{meta}</span>
                      {topicTags.length > 0 && (
                        <span className="xp-row__tags">
                          {topicTags.map((tag) => <span key={tag} className="xp-row__tag">{tag}</span>)}
                        </span>
                      )}
                      {/* An unfinished draft is never labelled "À faire". */}
                      {attempt ? (
                        <span className="xp-pill xp-pill--mint xp-row__status">
                          {pct != null ? L(`Score ${pct} %`, `Nòt ${pct} %`) : L('Fait', 'Fèt')}
                        </span>
                      ) : inProgress ? (
                        <span className="xp-pill xp-row__status">
                          {answered > 0 ? L(`En cours · ${answered} rép.`, `Ap fèt · ${answered} rep.`) : L('En cours', 'Ap fèt')}
                        </span>
                      ) : null}
                    </span>
                    <span className="xp-row__end">
                      <span className="xp-btn xp-btn--tonal xp-btn--sm" aria-hidden="true">{L('Voir', 'Wè')}</span>
                      <ChevronRight size={18} className="xp-row__chev" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {shown.length === 0 && (
        <p className="xp-meta">
          {q
            ? L('Aucun sujet ne correspond à ta recherche.', 'Okenn sijè pa koresponn ak rechèch ou.')
            : statusFilter === 'done'
              ? L('Aucune épreuve terminée pour le moment.', 'Poko gen egzamen fini.')
              : L('Tout est terminé. Bravo !', 'Tout bagay fini. Bravo !')}
        </p>
      )}
    </>,
  );
}
