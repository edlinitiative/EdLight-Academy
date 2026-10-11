import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { History, PlayCircle, ChevronRight, Search } from '../components/icons';
import useStore from '../contexts/store';
import { GRADES, gradeProfile, getCoefficient, DEFAULT_SUBJECT_ORDER } from '../config/trackConfig';
import { Skeleton } from '../components/Skeleton';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { levelToSlug } from '../utils/examLevels';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, subjectColor, displayStoredExamTitle } from '../utils/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { HUB_LEVELS, durationLabel, paperKey, PaperAction, StatusPill, type PaperStatus } from './examHubParts';
import { listRecentExamAttempts } from '../services/userActivity';
import './ExamLanding.css';
import './examHub.css';
import './ExamHome.css';

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

interface DraftRow {
  examId: string;
  level: string;
  title: string;
  subject: string;
  answered: number;
  updatedAtMs: number;
}

/** Every local in-progress exam draft (ExamTake's synchronous mirror keys),
 *  newest first. Works signed-out; Firestore drafts are merged in by the
 *  caller for signed-in, cross-device coverage. */
function localDrafts(): DraftRow[] {
  const rows: DraftRow[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('edlight-exam-draft-')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const draft = JSON.parse(raw);
      const answered = draft?.answers ? Object.keys(draft.answers).length : 0;
      const hasProgress = answered > 0 || (draft?.currentQ ?? 0) > 0;
      if (!hasProgress || draft?.status === 'submitted') continue;
      rows.push({
        examId: k.slice('edlight-exam-draft-'.length),
        level: draft?.level || '',
        title: displayStoredExamTitle(draft?.exam_title, draft, draft?.subject || ''),
        subject: draft?.subject || '',
        answered,
        updatedAtMs: draft?.updated_at_ms ?? draft?.started_at_ms ?? 0,
      });
    }
  } catch { /* localStorage unavailable */ }
  return rows;
}

/**
 * /exams — rethought around one question: « what do I practise now? »
 *
 *   header      level switch (Bac · 9ᵉ AF · Université) + one search box
 *   Reprendre   only when a paper is in progress
 *   Matières    one tile per subject: how many real papers, which years, and
 *               the student's own record on them — the way in for most visits
 *   Dernière session  the newest year's papers, start in one tap
 *
 * Gone on purpose: the average calculator (not what a student opens Examens
 * for), the facts sidebar, the five-column table and its three dropdowns, the
 * filière chips and the "other levels" drawer — the level switch covers it.
 */
const ExamLanding = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userTrack = useStore((s) => s.track);
  const grade = useStore((s) => s.grade);
  const userId = useStore((s) => s.user?.uid);
  const language = useStore((s) => s.language);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const ht = language === 'ht';
  const L = (fr: string, k: string) => (ht ? k : fr);

  const { data: catalog, isPending: catalogPending, isError: catalogError, refetch: refetchCatalog } = useExamCatalog();
  const attempts = useExamAttempts();

  // 7ᵉ, 8ᵉ and NS1–NS3 sit below the first national paper: say so, and still
  // let them browse. Never steer them at the Bac.
  const myLevelRaw = gradeProfile(grade).examLevel || null;
  const offLevel = !!grade && !myLevelRaw;
  const gradeLabel = useMemo(() => {
    const g = GRADES.find((x: any) => x.code === grade);
    return g ? (ht ? g.labelHt : g.label) : '';
  }, [grade, ht]);

  const enriched = useMemo(() => (catalog ? buildExamIndex(catalog).exams : []), [catalog]);
  const byKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of enriched) m.set(String(e.exam_id ?? e._idx), e);
    return m;
  }, [enriched]);

  // ── In progress: local drafts + (signed in) remote ones, newest first ──
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  useEffect(() => {
    let alive = true;
    const merged = new Map<string, DraftRow>();
    for (const d of localDrafts()) merged.set(d.examId, d);
    const publish = () => { if (alive) setDrafts([...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 3)); };
    if (!userId) { publish(); return () => { alive = false; }; }
    listRecentExamAttempts(userId, 10).then((remote: any[]) => {
      for (const r of remote) {
        if (r.status === 'submitted') continue;
        const answered = r.answers ? Object.keys(r.answers).length : 0;
        if (!(answered > 0 || (r.currentQ ?? 0) > 0)) continue;
        const existing = merged.get(r.id);
        const remoteMs = r.updated_at_ms ?? 0;
        if (!existing || remoteMs > existing.updatedAtMs) {
          merged.set(r.id, {
            examId: r.id,
            level: r.level || existing?.level || '',
            title: displayStoredExamTitle(r.exam_title, r, existing?.title || r.subject || ''),
            subject: r.subject || existing?.subject || '',
            answered,
            updatedAtMs: remoteMs,
          });
        }
      }
      publish();
    }).catch(publish);
    return () => { alive = false; };
  }, [userId]);

  // ── Level ──
  const [level, setLevel] = useState<string>(myLevelRaw || 'baccalaureat');
  useEffect(() => { if (myLevelRaw) setLevel(myLevelRaw); }, [myLevelRaw]);
  const slug = levelToSlug(level);
  const [query, setQuery] = useState('');

  const levelPapers = useMemo(
    () => enriched.filter((e) => e.level === level).sort((a, b) => {
      const yd = (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      if (yd) return yd;
      const oa = DEFAULT_SUBJECT_ORDER.indexOf(a._subject);
      const ob = DEFAULT_SUBJECT_ORDER.indexOf(b._subject);
      return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
    }),
    [enriched, level],
  );

  const draftById = useMemo(() => new Map(drafts.map((d) => [d.examId, d])), [drafts]);
  const statusOf = (exam: any): PaperStatus => {
    const k = paperKey(exam);
    const d = draftById.get(k);
    if (d) return { kind: 'draft', answered: d.answered };
    const a = attempts[k];
    if (a && a.attempted) return { kind: 'done', pct: a.percentage };
    return { kind: 'new' };
  };

  // ── One tile per subject, with the student's own record on it ──
  const subjects = useMemo(() => {
    const by = new Map<string, any[]>();
    for (const e of levelPapers) {
      const s = e._subject || 'Autre';
      if (!by.has(s)) by.set(s, []);
      by.get(s)!.push(e);
    }
    const rank = (s: string) => {
      if (userTrack) return -(getCoefficient(userTrack, s) || 0);
      const i = DEFAULT_SUBJECT_ORDER.indexOf(s);
      return i === -1 ? 99 : i;
    };
    return [...by.entries()].map(([subject, list]) => {
      let done = 0;
      let sum = 0;
      let scored = 0;
      for (const e of list) {
        const a = attempts[paperKey(e)];
        if (a?.attempted) {
          done += 1;
          if (typeof a.percentage === 'number') { sum += a.percentage; scored += 1; }
        }
      }
      return { subject, count: list.length, years: yearRange(list), done, avg: scored ? Math.round(sum / scored) : null };
    }).sort((a, b) => rank(a.subject) - rank(b.subject) || b.count - a.count);
  }, [levelPapers, attempts, userTrack]);

  // ── The newest session: the latest year's paper in each subject ──
  const latest = useMemo(() => {
    const y = levelPapers.find((e) => /^\d{4}$/.test(String(e.year)))?.year;
    if (!y) return null;
    // One paper per subject — that year's exam as a student sat it, not eight
    // séries of the same Mathématiques paper in a row.
    const seen = new Set<string>();
    const papers = levelPapers.filter((e) => {
      if (String(e.year) !== String(y) || seen.has(e._subject)) return false;
      seen.add(e._subject);
      return true;
    }).slice(0, 8);
    return { year: String(y), papers };
  }, [levelPapers]);

  const hero = latest?.papers[0] || null;

  const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return null;
    return levelPapers.filter((e) => fold([e._subject, e.exam_title, e.year, ...(Array.isArray(e.topics) ? e.topics : [])].join(' ')).includes(q)).slice(0, 20);
     
  }, [levelPapers, query]);

  const PaperRow = ({ e }: { e: any }) => {
    const name = sessionRowName(e, ht ? 'ht' : 'fr');
    const st = statusOf(e);
    return (
      <li className="exh-paper">
        <span className="exh-year" style={{ '--sub': subjectColor(e._subject) } as React.CSSProperties}>{/^\d{4}$/.test(String(e.year)) ? e.year : '—'}</span>
        <span className="exh-paper__body">
          <strong>{e._subject}</strong>
          <span>{[name.title, name.subtitle, durationLabel(e.duration_minutes, ht)].filter(Boolean).join(' · ')}</span>
        </span>
        {st.kind !== 'new' && <StatusPill status={st} ht={ht} />}
        <PaperAction exam={e} status={st} ht={ht} navigate={navigate} />
      </li>
    );
  };

  return (
    <div className="exh container">
      {/* The hero: what this page is, with the real newest paper drawn as an
          exam sheet beside it — subject, session, duration, questions. */}
      <header className="exh-hero">
        <div className="exh-hero__copy">
          <p className="exh-over">{L('Examens officiels du MENFP', 'Egzamen ofisyèl MENFP')}</p>
          <h1 className="exh-head__title">{L('Entraîne-toi sur les vrais sujets.', 'Pratike sou vrè sijè yo.')}</h1>
          <p className="exh-head__lede">
            {L('Chronomètre officiel, correction à la fin, ton score gardé.', 'Kwonomèt ofisyèl, korije nan fen, nòt ou kenbe.')}
            {!userId && (
              <> {' '}
                <button type="button" className="exh-link" onClick={() => setShowAuthModal(true)}>
                  {L('Connecte-toi', 'Konekte')}
                </button>
                {L(' pour garder tes résultats.', ' pou w kenbe rezilta ou.')}
              </>
            )}
          </p>
          {levelPapers.length > 0 && (
            <dl className="exh-facts">
              <div><dt>{L('sujets', 'sijè')}</dt><dd>{levelPapers.length}</dd></div>
              <div><dt>{L('matières', 'matyè')}</dt><dd>{subjects.length}</dd></div>
              {yearRange(levelPapers) && <div><dt>{L('années', 'ane')}</dt><dd>{yearRange(levelPapers).replace(' – ', '–')}</dd></div>}
            </dl>
          )}
          <div className="exh-head__tools">
            <div className="exam-hub__seg exh-seg" role="group" aria-label={L('Niveau', 'Nivo')}>
              {HUB_LEVELS.map((l) => (
                <button key={l.raw} type="button" aria-pressed={level === l.raw}
                  className={level === l.raw ? 'is-on' : ''} onClick={() => { setLevel(l.raw); setQuery(''); }}>
                  {ht ? l.ht : l.fr}
                </button>
              ))}
            </div>
            <Link to="/exams/resultats" className="exh-results-link">
              <History size={16} aria-hidden="true" /> {t('examLanding.myResults')}
            </Link>
          </div>
          <label className="exam-hub__search exh-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={L('Chercher une matière, une année, une notion…', 'Chèche yon matyè, yon ane, yon nosyon…')}
              aria-label={L('Rechercher', 'Chèche')} />
          </label>
        </div>

        {hero && (
          <Link to={`/exams/${slug}/${paperKey(hero)}`} className="exh-sheet" aria-label={`${hero._subject} — ${sessionRowName(hero, ht ? 'ht' : 'fr').title}`}>
            <span className="exh-sheet__back exh-sheet__back--2" aria-hidden="true" />
            <span className="exh-sheet__back exh-sheet__back--1" aria-hidden="true" />
            <span className="exh-sheet__paper">
              <span className="exh-sheet__top">
                <span>{L('République d’Haïti · MENFP', 'Repiblik d Ayiti · MENFP')}</span>
                <span>{(HUB_LEVELS.find((l) => l.raw === level) || HUB_LEVELS[0])[ht ? 'ht' : 'fr']}</span>
              </span>
              <span className="exh-sheet__subject" style={{ color: subjectColor(hero._subject) }}>{hero._subject}</span>
              <span className="exh-sheet__session">{sessionRowName(hero, ht ? 'ht' : 'fr').title}</span>
              <span className="exh-sheet__lines" aria-hidden="true">
                <i /><i /><i className="is-short" /><i /><i className="is-short" />
              </span>
              <span className="exh-sheet__foot">
                <span className="exh-sheet__chip">{durationLabel(hero.duration_minutes, ht)}</span>
                {hero._questionCount > 0 && <span className="exh-sheet__chip">{hero._questionCount} {L('questions', 'kesyon')}</span>}
                <span className="exh-sheet__go">{L('Commencer', 'Kòmanse')} <ChevronRight size={16} aria-hidden="true" /></span>
              </span>
              <span className="exh-sheet__stamp" aria-hidden="true">{L('Examen blanc', 'Egzamen blan')}</span>
            </span>
          </Link>
        )}
      </header>

      {offLevel && (
        <section className="exh-note">
          <strong>{L('Pas encore d’examen national pour ta classe', 'Poko gen egzamen nasyonal pou klas ou')}</strong>
          <span>
            {L(`${gradeLabel ? `En ${gradeLabel}, ` : ''}les quiz et les cours sont plus utiles pour l’instant. Les sujets restent ouverts si tu veux voir à quoi ils ressemblent.`,
              `${gradeLabel ? `Nan ${gradeLabel}, ` : ''}kiz ak kou yo pi itil pou kounye a. Sijè yo rete louvri si w vle wè jan yo ye.`)}
          </span>
          <Link to="/courses" className="exam-hub__btn exam-hub__btn--line">{L('Mes cours', 'Kou mwen yo')}</Link>
        </section>
      )}

      {drafts.length > 0 && !results && (
        <section className="exh-section" aria-labelledby="exh-resume">
          <h2 id="exh-resume" className="exh-section__title">{t('examLanding.sectionInProgress')}</h2>
          <div className="exh-resume">
            {drafts.map((d) => {
              const exam = byKey.get(d.examId);
              const name = exam ? sessionRowName(exam, ht ? 'ht' : 'fr') : { title: d.title, subtitle: d.subject };
              const subject = exam?._subject || d.subject;
              return (
                <button key={d.examId} type="button" className="exh-resume__card"
                  onClick={() => navigate(`/exams/${levelToSlug(exam?.level || d.level)}/${d.examId}/take`, { state: { autostart: true, resume: true } })}>
                  <span className="exh-year" style={{ '--sub': subjectColor(subject) } as React.CSSProperties}>{exam?.year && /^\d{4}$/.test(String(exam.year)) ? exam.year : '—'}</span>
                  <span className="exh-resume__body">
                    <strong>{subject}</strong>
                    <span>{[name.title, d.answered > 0 ? t('examLanding.resumeAnswered', { count: d.answered }) : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="exh-resume__cta"><PlayCircle size={18} aria-hidden="true" /> {t('examLanding.resume')}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {catalogError && (
        <section className="exh-note">
          <span>
            {typeof navigator !== 'undefined' && navigator.onLine === false
              ? L('Tu es hors ligne et la liste des examens n’est pas encore enregistrée sur cet appareil.', 'Ou pa sou entènèt e lis egzamen yo poko anrejistre sou aparèy sa a.')
              : L('Impossible de charger la liste des examens.', 'Nou pa t ka chaje lis egzamen yo.')}
          </span>
          <button className="exam-hub__btn exam-hub__btn--primary" type="button" onClick={() => { void refetchCatalog(); }}>
            {L('Réessayer', 'Eseye ankò')}
          </button>
        </section>
      )}

      {catalogPending && (
        <div className="exh-subjects" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={132} radius={20} />)}
        </div>
      )}

      {results && (
        <section className="exh-section" aria-labelledby="exh-results">
          <h2 id="exh-results" className="exh-section__title">
            {results.length
              ? L(`${results.length} sujet${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`, `${results.length} sijè jwenn`)
              : L('Aucun sujet ne correspond.', 'Okenn sijè pa koresponn.')}
          </h2>
          {results.length > 0 && <ul className="exh-papers">{results.map((e) => <PaperRow key={paperKey(e)} e={e} />)}</ul>}
        </section>
      )}

      {!results && !catalogPending && !catalogError && (
        <>
          <section className="exh-section" aria-labelledby="exh-subjects">
            <div className="exh-section__head">
              <h2 id="exh-subjects" className="exh-section__title">{L('Choisis une matière', 'Chwazi yon matyè')}</h2>
              <span className="exh-section__meta">{levelPapers.length} {L('sujets officiels', 'sijè ofisyèl')}</span>
            </div>
            <div className="exh-subjects">
              {subjects.map((s) => {
                const color = subjectColor(s.subject);
                return (
                  <Link key={s.subject} to={`/exams/${slug}/matiere/${encodeURIComponent(s.subject)}`}
                    className="exh-subject" style={{ '--sub': color } as React.CSSProperties}>
                    <span className="exh-subject__count">
                      <b>{s.count}</b> {L(s.count > 1 ? 'sujets' : 'sujet', 'sijè')}
                    </span>
                    <span className="exh-subject__body">
                      <strong>{s.subject}</strong>
                      {s.years && <span>{s.years}</span>}
                    </span>
                    <span className="exh-subject__foot">
                      {s.done > 0 ? (
                        <>
                          <span className="exh-subject__meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (s.done / s.count) * 100)}%` }} /></span>
                          <span className="exh-subject__stat">
                            {L(`${s.done} fait${s.done > 1 ? 's' : ''}`, `${s.done} fèt`)}{s.avg != null ? ` · ${s.avg}%` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="exh-subject__stat exh-subject__stat--go">{L('Commencer', 'Kòmanse')} <ChevronRight size={16} aria-hidden="true" /></span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {latest && (
            <section className="exh-section" aria-labelledby="exh-latest">
              <div className="exh-section__head">
                <h2 id="exh-latest" className="exh-section__title">{L(`Session ${latest.year}`, `Sesyon ${latest.year}`)}</h2>
                <Link to={`/exams/${slug}`} className="exh-link">{L('Tous les sujets', 'Tout sijè yo')} <ChevronRight size={16} aria-hidden="true" /></Link>
              </div>
              <ul className="exh-papers">{latest.papers.map((e) => <PaperRow key={paperKey(e)} e={e} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ExamLanding;
