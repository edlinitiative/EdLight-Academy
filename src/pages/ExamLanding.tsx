import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isOtherAccountDraft } from '../../shared/examDraft';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronRight, Search, ArrowRight } from '../components/icons';
import useStore from '../contexts/store';
import { GRADES, gradeProfile, getCoefficient, DEFAULT_SUBJECT_ORDER } from '../config/trackConfig';
import { Skeleton } from '../components/Skeleton';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { levelToSlug } from '../utils/examLevels';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, displayStoredExamTitle } from '../utils/examUtils';
import { sessionRowName, yearRange } from '../utils/examNaming';
import { HUB_LEVELS, durationLabel, paperKey, type PaperStatus } from './examHubParts';
import { listRecentExamAttempts } from '../services/userActivity';
import './examPremium.css';

// Offline revision packs: its own chunk, loaded after the landing renders.
const OfflinePacksPanel = React.lazy(() => import(/* webpackChunkName: "offline-packs-panel" */ '../components/OfflinePacksPanel'));

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
function localDrafts(uid?: string | null): DraftRow[] {
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
      if (!hasProgress || draft?.status === 'submitted' || isOtherAccountDraft(draft, uid)) continue;
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
    for (const d of localDrafts(userId)) merged.set(d.examId, d);
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

  // The eight subjects with the most papers are tiles (two full rows of
  // four); the rest are a compact row. Order within each keeps the subjects'
  // own order (coefficients / programme order).
  const mainKeys = new Set([...subjects].sort((a, b) => b.count - a.count).slice(0, 8).map((x) => x.subject));
  const mainSubjects = subjects.filter((x) => mainKeys.has(x.subject));
  const otherSubjects = subjects.filter((x) => !mainKeys.has(x.subject)).sort((a, b) => b.count - a.count);

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

  const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return null;
    return levelPapers.filter((e) => fold([e._subject, e.exam_title, e.year, ...(Array.isArray(e.topics) ? e.topics : [])].join(' ')).includes(q)).slice(0, 20);
     
  }, [levelPapers, query]);

  const yearOf = (e: any) => (/^\d{4}$/.test(String(e?.year)) ? String(e.year) : '');

  const PaperRow = ({ e }: { e: any }) => {
    const name = sessionRowName(e, ht ? 'ht' : 'fr');
    const st = statusOf(e);
    const key = paperKey(e);
    const year = yearOf(e);
    const meta = [name.title, name.subtitle, durationLabel(e.duration_minutes, ht)].filter(Boolean).join(' · ');
    const to = st.kind === 'done' ? `/exams/${slug}/${key}/results` : `/exams/${slug}/${key}`;
    return (
      <li>
        <Link to={to} className="xp-row">
          <span className={`xp-row__lead${st.kind === 'done' ? ' xp-row__lead--mint' : ''}`} aria-hidden={!year}>{year || '—'}</span>
          <span className="xp-row__body">
            <span className="xp-row__title">{e._subject}</span>
            <span className="xp-row__meta">{meta}</span>
            {st.kind === 'draft' && (
              <span className="xp-pill xp-row__status">{L(`En cours · ${st.answered} rép.`, `Ap fèt · ${st.answered} rep.`)}</span>
            )}
            {st.kind === 'done' && (
              <span className="xp-pill xp-pill--mint xp-row__status">{st.pct == null ? L('Fait', 'Fèt') : L(`Score ${st.pct} %`, `Nòt ${st.pct} %`)}</span>
            )}
          </span>
          <span className="xp-row__end">
            <span className="xp-btn xp-btn--tonal xp-btn--sm" aria-hidden="true">
              {st.kind === 'done' ? L('Voir', 'Wè') : st.kind === 'draft' ? L('Reprendre', 'Kontinye') : L('Démarrer', 'Kòmanse')}
            </span>
            <ChevronRight size={18} className="xp-row__chev" aria-hidden="true" />
          </span>
        </Link>
      </li>
    );
  };

  const resumeRows = drafts.map((d) => {
    const exam = byKey.get(d.examId);
    const name = exam ? sessionRowName(exam, ht ? 'ht' : 'fr') : { title: d.title, subtitle: '' };
    const subject = exam?._subject || d.subject;
    const total = Number(exam?._questionCount) || 0;
    const levelRaw = exam?.level || d.level;
    const levelName = HUB_LEVELS.find((l) => l.raw === levelRaw);
    return {
      d,
      subject,
      title: [subject, name.title].filter(Boolean).join(' · '),
      total,
      levelLabel: levelName ? (ht ? levelName.ht : levelName.fr) : '',
      href: `/exams/${levelToSlug(levelRaw)}/${d.examId}/take`,
    };
  });
  const [lead, ...moreDrafts] = resumeRows;
  const resumeGo = (href: string) => navigate(href, { state: { autostart: true, resume: true } });

  return (
    <div className="xp">
      <div className="xp-page">
        {/* One title row and its controls, then content. No band. */}
        <header className="xp-head">
          <div>
            <div className="xp-head__row">
              <h1 className="xp-title">{L('Examens', 'Egzamen')}</h1>
              <Link to="/exams/resultats" className="xp-link">
                <History size={16} aria-hidden="true" /> {t('examLanding.myResults')}
              </Link>
            </div>
            <p className="xp-lede">
              {L('Les vrais sujets, en conditions réelles.', 'Vrè sijè yo, nan vrè kondisyon.')}
              {!userId && (
                <>
                  {' '}
                  <button type="button" className="xp-link" onClick={() => setShowAuthModal(true)}>
                    {L('Connecte-toi', 'Konekte')}
                  </button>
                  {L(' pour garder tes résultats.', ' pou w kenbe rezilta ou.')}
                </>
              )}
            </p>
          </div>
          <div className="xp-tools">
            <div className="xp-seg" role="group" aria-label={L('Niveau', 'Nivo')}>
              {HUB_LEVELS.map((l) => (
                <button key={l.raw} type="button" aria-pressed={level === l.raw}
                  onClick={() => { setLevel(l.raw); setQuery(''); }}>
                  {ht ? l.ht : l.fr}
                </button>
              ))}
            </div>
            <label className="xp-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={L('Matière, année, notion…', 'Matyè, ane, nosyon…')}
                aria-label={L('Rechercher un sujet', 'Chèche yon sijè')} />
            </label>
          </div>
        </header>

        {offLevel && (
          <section className="xp-note">
            <div>
              <strong>{L('Pas encore d’examen national pour ta classe', 'Poko gen egzamen nasyonal pou klas ou')}</strong>
              <span>
                {L(`${gradeLabel ? `En ${gradeLabel}, ` : ''}les quiz et les cours sont plus utiles pour l’instant. Les sujets restent ouverts si tu veux voir à quoi ils ressemblent.`,
                  `${gradeLabel ? `Nan ${gradeLabel}, ` : ''}kiz ak kou yo pi itil pou kounye a. Sijè yo rete louvri si w vle wè jan yo ye.`)}
              </span>
            </div>
            <Link to="/courses" className="xp-btn xp-btn--tonal xp-btn--sm">{L('Mes cours', 'Kou mwen yo')}</Link>
          </section>
        )}

        {/* Examen en cours — the page's one solid button lives here, and the
            card is gone when nothing is in progress. */}
        {lead && !results && (
          <section className="xp-card xp-resume" aria-labelledby="xp-resume-title">
            <div className="xp-resume__top">
              <span className="xp-pill">{L('En cours', 'Ap fèt')}</span>
              {lead.levelLabel && <span className="xp-meta">{lead.levelLabel}</span>}
            </div>
            <h2 id="xp-resume-title" className="xp-resume__title">{lead.title}</h2>
            <p className="xp-meta">
              {lead.total > 0
                ? L(`${lead.d.answered} question${lead.d.answered > 1 ? 's' : ''} répondue${lead.d.answered > 1 ? 's' : ''} sur ${lead.total}`,
                  `${lead.d.answered} kesyon reponn sou ${lead.total}`)
                : t('examLanding.resumeAnswered', { count: lead.d.answered })}
            </p>
            {lead.total > 0 && (
              <div className="xp-bar" role="progressbar" aria-label={L('Progression', 'Pwogrè')}
                aria-valuemin={0} aria-valuemax={lead.total} aria-valuenow={Math.min(lead.d.answered, lead.total)}>
                <span style={{ width: `${Math.min(100, Math.round((lead.d.answered / lead.total) * 100))}%` }} />
              </div>
            )}
            <div className="xp-resume__foot">
              <button type="button" className="xp-btn" onClick={() => resumeGo(lead.href)}>
                {L('Reprendre', 'Kontinye')} <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            {moreDrafts.length > 0 && (
              <div className="xp-resume__more">
                <p className="xp-label">{L('Aussi en cours', 'Lòt ki ap fèt')}</p>
                <ul className="xp-rows">
                  {moreDrafts.map((r) => (
                    <li key={r.d.examId}>
                      <button type="button" className="xp-row" onClick={() => resumeGo(r.href)}>
                        <span className="xp-row__lead">{r.d.answered}<small>{r.total ? `/${r.total}` : ''}</small></span>
                        <span className="xp-row__body">
                          <span className="xp-row__title">{r.title}</span>
                          <span className="xp-row__meta">{t('examLanding.resumeAnswered', { count: r.d.answered })}</span>
                        </span>
                        <span className="xp-row__end">
                          <span className="xp-btn xp-btn--tonal xp-btn--sm" aria-hidden="true">{L('Reprendre', 'Kontinye')}</span>
                          <ChevronRight size={18} className="xp-row__chev" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {catalogError && (
          <ErrorState
            headingLevel={2}
            title={L('Liste des examens indisponible', 'Lis egzamen yo pa disponib')}
            message={L('Impossible de charger la liste des examens.', 'Nou pa t ka chaje lis egzamen yo.')}
            offlineMessage={L('Tu es hors ligne et la liste des examens n’est pas encore enregistrée sur cet appareil.', 'Ou pa sou entènèt e lis egzamen yo poko anrejistre sou aparèy sa a.')}
            onRetry={() => { void refetchCatalog(); }}
            retryLabel={L('Réessayer', 'Eseye ankò')}
          />
        )}

        {catalogPending && (
          <LoadingState className="xp-tiles" label={L('Chargement des examens…', 'N ap chaje egzamen yo…')}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={176} radius={20} />)}
          </LoadingState>
        )}

        {results && (
          <section className="xp-section" aria-labelledby="xp-results">
            <h2 id="xp-results" className="xp-h2">
              {results.length
                ? L(`${results.length} sujet${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`, `${results.length} sijè jwenn`)
                : L('Aucun sujet ne correspond.', 'Okenn sijè pa koresponn.')}
            </h2>
            {results.length > 0 && <ul className="xp-rows">{results.map((e) => <PaperRow key={paperKey(e)} e={e} />)}</ul>}
          </section>
        )}

        {!results && !catalogPending && !catalogError && (
          <>
            <section className="xp-section" aria-labelledby="xp-subjects">
              <div className="xp-section__head">
                <h2 id="xp-subjects" className="xp-h2">{L('Choisis une matière', 'Chwazi yon matyè')}</h2>
                <span className="xp-meta">{levelPapers.length} {L(levelPapers.length > 1 ? 'sujets' : 'sujet', 'sijè')}</span>
              </div>
              <div className="xp-tiles">
                {mainSubjects.map((s) => (
                  <Link key={s.subject} to={`/exams/${slug}/matiere/${encodeURIComponent(s.subject)}`} className="xp-tile">
                    <span className="xp-tile__num">{s.count}</span>
                    <span className="xp-tile__unit">{L(s.count > 1 ? 'sujets' : 'sujet', 'sijè')}</span>
                    <span className="xp-tile__name">{s.subject}</span>
                    {s.years && <span className="xp-tile__years">{s.years}</span>}
                    {s.done > 0 && (
                      <span className="xp-tile__foot">
                        <span className="xp-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (s.done / s.count) * 100)}%` }} /></span>
                        <span>{L(`${s.done} fait${s.done > 1 ? 's' : ''}`, `${s.done} fèt`)}{s.avg != null ? ` · ${s.avg} %` : ''}</span>
                      </span>
                    )}
                  </Link>
                ))}
              </div>
              {otherSubjects.length > 0 && (
                <div className="xp-chips">
                  <span className="xp-label">{L('Autres matières', 'Lòt matyè')}</span>
                  {otherSubjects.map((s) => (
                    <Link key={s.subject} to={`/exams/${slug}/matiere/${encodeURIComponent(s.subject)}`} className="xp-chip">
                      {s.subject} <b>{s.count}</b>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {latest && (
              <section className="xp-section" aria-labelledby="xp-latest">
                <div className="xp-section__head">
                  <h2 id="xp-latest" className="xp-h2">{L(`Session ${latest.year}`, `Sesyon ${latest.year}`)}</h2>
                  <Link to={`/exams/${slug}`} className="xp-link">{L('Tous les sujets', 'Tout sijè yo')} <ChevronRight size={16} aria-hidden="true" /></Link>
                </div>
                <ul className="xp-rows">{latest.papers.map((e) => <PaperRow key={paperKey(e)} e={e} />)}</ul>
              </section>
            )}

            <React.Suspense fallback={null}>
              <OfflinePacksPanel level={level} ht={ht} />
            </React.Suspense>
          </>
        )}
      </div>
    </div>
  );
};

export default ExamLanding;
