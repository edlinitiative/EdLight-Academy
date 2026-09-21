import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { History, PlayCircle, ChevronRight, ChevronDown, FileText, Clock, Save, LogIn } from 'lucide-react';
import useStore from '../contexts/store';
import { TRACKS, GRADES, gradeProfile, getCoefficient, DEFAULT_SUBJECT_ORDER } from '../config/trackConfig';
import CardCover from '../components/CardCover';
import { Skeleton } from '../components/Skeleton';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { levelToSlug, RAW_LEVEL_TO_URL, LEVEL_SLUG_LABELS } from '../utils/examLevels';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, subjectColor, displayStoredExamTitle } from '../utils/examUtils';
import { sessionRowName } from '../utils/examNaming';
import { SUBJECT_GLYPHS } from '../utils/subjectGlyphs';
import { listRecentExamAttempts } from '../services/userActivity';
import { useReadiness } from '../hooks/useReadiness';
import { readinessBand } from '../services/readinessService';
import ReviewBanner from '../components/ReviewBanner';
import './ExamLanding.css';

// Level cards are data-driven; the visible strings (heading/description/badge)
// are resolved from i18n via `key` so the whole page localizes cleanly.
const LEVELS = [
  { to: '/exams/9e', glyph: 'book', key: 'grade9', color: '#1B6FE0', raw: '9eme_af' },
  { to: '/exams/terminale', glyph: 'cap', key: 'terminale', color: '#7c3aed', raw: 'baccalaureat' },
  { to: '/exams/university', glyph: 'campus', key: 'university', color: '#0891b2', raw: 'universite' },
];

// gradeProfile().examLevel → the level card route, so a student's grade can
// lead with the relevant path (POSTBAC → université concours, 9e → 9ème,
// else Bac). Mirrors the mobile ExamLanding ordering.
const EXAM_LEVEL_TO_PATH: Record<string, string> = {
  baccalaureat: '/exams/terminale',
  universite: '/exams/university',
  '9eme_af': '/exams/9e',
};

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

/**
 * The facts a row can honestly state about one paper: how many questions it
 * holds and whether it is timed.
 *
 * `duration_minutes` is genuinely absent on 83 of the 530 catalog entries, and
 * ExamTake starts no countdown when it is 0/null (`durationMin || 0`), so an
 * absent duration is reported as "sans chronomètre" — the real behaviour —
 * and never as an invented number.
 */
function examRowFacts(exam: any, ht: boolean): string {
  if (!exam) return '';
  const q = exam._questionCount || 0;
  const dur = exam.duration_minutes || 0;
  const parts: string[] = [];
  if (q > 0) parts.push(`${q} ${ht ? 'kesyon' : q === 1 ? 'question' : 'questions'}`);
  parts.push(dur > 0 ? `${dur} min` : (ht ? 'san kwonomèt' : 'sans chronomètre'));
  return parts.join(' · ');
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

const ExamLanding = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userTrack = useStore((s) => s.track);
  const grade = useStore((s) => s.grade);
  const userId = useStore((s) => s.user?.uid);
  const language = useStore((s) => s.language);
  const setTrack = useStore((s) => s.setTrack);
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const ht = language === 'ht';

  // Lead with the level that matches the student's grade so the relevant path
  // is the top row; everyone else keeps the default order. The Bac (Terminale)
  // row still carries the filière quick-pick wherever it lands.
  const myLevelPath = EXAM_LEVEL_TO_PATH[gradeProfile(grade).examLevel ?? ''] ?? null;
  const orderedLevels = myLevelPath
    ? [...LEVELS].sort((a, b) => (a.to === myLevelPath ? -1 : b.to === myLevelPath ? 1 : 0))
    : LEVELS;

  const pickTrack = (code: string) => {
    setTrack(code);
    setOnboardingCompleted(true);
    navigate('/exams/terminale');
  };

  const { data: catalog, isPending: catalogPending, isError: catalogError, refetch: refetchCatalog } = useExamCatalog();
  const attempts = useExamAttempts();

  // ── Is any national exam relevant to this student's class? ────────────────
  // gradeProfile().examLevel is null for 7ᵉ, 8ᵉ and NS1–NS3: those classes sit
  // below the first national paper (9ᵉ AF). The plan is explicit that exams are
  // then DE-EMPHASIZED — a 7ᵉ student must not be steered at the Bac — so the
  // page stops leading with papers, says why, and points at what does apply.
  // The levels stay one tap away; nothing is hidden.
  const myLevelRaw = gradeProfile(grade).examLevel || null;
  const knowsLevel = !!grade && !!myLevelRaw;
  const offLevel = !!grade && !myLevelRaw;
  const gradeLabel = useMemo(() => {
    const g = GRADES.find((x: any) => x.code === grade);
    return g ? (ht ? g.labelHt : g.label) : '';
  }, [grade, ht]);

  // The full, enriched index — keyed by exam_id so every section (in
  // progress / recommended / recent) resolves the SAME title/subject.
  const enriched = useMemo(() => (catalog ? buildExamIndex(catalog).exams : []), [catalog]);
  const byKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of enriched) m.set(String(e.exam_id ?? e._idx), e);
    return m;
  }, [enriched]);

  // ── "Reprendre" — up to 3 in-progress exams, local + (signed-in) remote ──
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  useEffect(() => {
    let alive = true;
    const local = localDrafts();
    const merged = new Map<string, DraftRow>();
    for (const d of local) merged.set(d.examId, d);

    if (userId) {
      listRecentExamAttempts(userId, 10).then((remote: any[]) => {
        if (!alive) return;
        for (const r of remote) {
          if (r.status === 'submitted') continue;
          const answered = r.answers ? Object.keys(r.answers).length : 0;
          const hasProgress = answered > 0 || (r.currentQ ?? 0) > 0;
          if (!hasProgress) continue;
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
        setDrafts([...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 3));
      }).catch(() => {
        if (alive) setDrafts([...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 3));
      });
    } else {
      setDrafts([...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 3));
    }
    return () => { alive = false; };
  }, [userId]);

  // ── "Recommandé pour vous" — subjects to reinforce, then fresh top-coef ──
  const recommendations = useMemo(() => {
    if (enriched.length === 0) return [];
    // No relevant level for this class → suggest nothing. The previous
    // `examLevel || 'baccalaureat'` fallback pushed Baccalauréat papers at 7ᵉ,
    // 8ᵉ and NS1–NS3 students, which is exactly the steering §6.4 forbids.
    if (offLevel) return [];
    const examLevel = gradeProfile(grade).examLevel || 'baccalaureat';
    const bySubject = new Map<string, any[]>();
    for (const e of enriched) {
      if (e.level !== examLevel) continue;
      const s = e._subject || 'Autre';
      if (!bySubject.has(s)) bySubject.set(s, []);
      bySubject.get(s)!.push(e);
    }
    if (bySubject.size === 0) return [];

    const subjectOrder = userTrack
      ? [...bySubject.keys()].sort((a, b) => (getCoefficient(userTrack, b) || 0) - (getCoefficient(userTrack, a) || 0))
      : [
          ...DEFAULT_SUBJECT_ORDER.filter((s: string) => bySubject.has(s)),
          ...[...bySubject.keys()].filter((s) => !DEFAULT_SUBJECT_ORDER.includes(s)),
        ];

    const statsBySubject = new Map<string, { count: number; avg: number }>();
    for (const [subject, list] of bySubject) {
      let count = 0;
      let sum = 0;
      for (const e of list) {
        const a = attempts[String(e.exam_id ?? e._idx)];
        if (a && typeof a.percentage === 'number') { count += 1; sum += a.percentage; }
      }
      if (count > 0) statsBySubject.set(subject, { count, avg: sum / count });
    }

    const weak = subjectOrder
      .filter((s) => (statsBySubject.get(s)?.avg ?? 100) < 60)
      .sort((a, b) => (statsBySubject.get(a)!.avg) - (statsBySubject.get(b)!.avg));
    const fresh = subjectOrder.filter((s) => !statsBySubject.has(s));
    const chosen = [...weak, ...fresh].slice(0, 4);

    return chosen.map((subject) => {
      const list = bySubject.get(subject)!;
      const attemptedIds = new Set(
        list.map((e) => String(e.exam_id ?? e._idx)).filter((k) => attempts[k]),
      );
      const sorted = [...list].sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
      const exam = sorted.find((e) => !attemptedIds.has(String(e.exam_id ?? e._idx))) || sorted[0];
      return { subject, exam, weak: weak.includes(subject) };
    }).filter((r) => !!r.exam);
  }, [enriched, attempts, grade, userTrack, offLevel]);

  /*
   * Is any of that actually a RECOMMENDATION?
   *
   * The list is "weakest subjects first, then ones never attempted". With no
   * attempts on file — a signed-out visitor, or a new student — nothing is
   * weak and the list degrades to "subjects in coefficient order", which is a
   * sensible place to start but is not personalised to anybody. Calling it
   * "Recommandé pour vous" there claims a diagnosis we have not made, which
   * §6.4 of the redesign plan rules out in those words.
   */
  const hasAttemptEvidence = useMemo(
    () => Object.values(attempts || {}).some((a: any) => typeof a?.percentage === 'number'),
    [attempts],
  );

  // ── My level ──────────────────────────────────────────────────────────────
  // An NS4 student has no business browsing 9e papers by default. When we know
  // the grade, the page scopes to that level and the others move behind a
  // disclosure; with no grade set (signed out, or never asked) we still show
  // the picker, because we genuinely don't know what they're preparing.
  const mySlug = myLevelRaw ? (RAW_LEVEL_TO_URL[myLevelRaw] || 'terminale') : null;
  const myLevelLabel = mySlug ? (LEVEL_SLUG_LABELS[mySlug]?.[ht ? 'ht' : 'fr'] || mySlug) : '';
  const [showOtherLevels, setShowOtherLevels] = useState(false);

  // Subjects available at MY level, with how many papers each holds.
  const mySubjects = useMemo(() => {
    if (!myLevelRaw || enriched.length === 0) return [];
    const bySubject = new Map<string, number>();
    for (const e of enriched) {
      if (e.level !== myLevelRaw) continue;
      const subj = e._subject || 'Autre';
      bySubject.set(subj, (bySubject.get(subj) || 0) + 1);
    }
    const order = userTrack
      ? (a: string, b: string) => (getCoefficient(userTrack, b) || 0) - (getCoefficient(userTrack, a) || 0)
      : (a: string, b: string) => {
          const ia = DEFAULT_SUBJECT_ORDER.indexOf(a);
          const ib = DEFAULT_SUBJECT_ORDER.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        };
    return [...bySubject.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => order(a.subject, b.subject));
  }, [enriched, myLevelRaw, userTrack]);

  // ── Performance: readiness overall + where to focus ───────────────────────
  const readiness = useReadiness();
  const focusSubjects = useMemo(
    () => (readiness.subjects || [])
      .filter((sub: any) => sub.hasData)
      .sort((a: any, b: any) => a.pct - b.pct)
      .slice(0, 3),
    [readiness.subjects],
  );

  // ── "Derniers résultats" — up to 3, newest first ──────────────────────────
  const recentResults = useMemo(() => {
    if (byKey.size === 0) return [];
    return Object.entries(attempts)
      .filter(([, info]) => info.attempted && info.submittedAtMs)
      .map(([examId, info]) => {
        const exam = byKey.get(examId);
        if (!exam) return null;
        return { examId, exam, percentage: info.percentage, submittedAtMs: info.submittedAtMs! };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => b.submittedAtMs - a.submittedAtMs)
      .slice(0, 3);
  }, [attempts, byKey]);

  const hasPersonalData = drafts.length > 0 || recentResults.length > 0 || recommendations.length > 0;

  return (
    <div className="exam-landing">
      <header className="exam-landing__intro">
        <Link to="/practice" className="exam-landing__back">← {ht ? 'Pratik' : 'Pratique'}</Link>
        <h1>{offLevel
          ? (ht ? 'Egzamen nasyonal yo' : 'Les examens nationaux')
          : (ht ? 'Prepare pwochen egzamen ou' : 'Préparez votre prochain examen')}</h1>
        <p>{offLevel
          ? (ht
              ? 'Yon egzamen isit la se yon sijè ofisyèl MENFP konplè — se pa yon ti kiz. Premye yo kòmanse nan 9yèm ane.'
              : 'Ici, un examen est un sujet officiel du MENFP complet — pas un quiz rapide. Les premières épreuves nationales arrivent en 9ᵉ AF.')
          : (ht
              ? 'Chak egzamen se yon sijè ofisyèl konplè, se pa yon ti kiz. Kontinye yonn ou te kòmanse oswa chwazi matyè ou. Dire ak enstriksyon yo parèt anvan ou kòmanse.'
              : 'Chaque examen est un sujet officiel complet, pas un quiz rapide. Reprenez-en un en cours ou choisissez votre matière. La durée et les consignes sont affichées avant de commencer.')}</p>
      </header>
      <div className="exam-landing__toolbar">
        {knowsLevel ? (
          <span className="exam-landing__level-context">
            <span className="exam-landing__level-eyebrow">{t('examLanding.myLevelEyebrow')}</span>
            <strong>{myLevelLabel}</strong>
          </span>
        ) : <span />}
        <Link to="/exams/resultats" className="exam-landing__history">
          <History size={16} aria-hidden="true" /> {t('examLanding.myResults')}
        </Link>
      </div>

      {/* ── Not your class yet ────────────────────────────────────────────────
          7ᵉ, 8ᵉ, NS1–NS3 have no national paper (gradeProfile().examLevel is
          null). Say so plainly, hand them the surface that does apply, and
          leave the papers browsable below rather than hiding them. */}
      {offLevel && (
        <section className="exam-landing__offlevel">
          <h2>{ht
            ? 'Egzamen nasyonal poko pou klas ou'
            : 'Pas encore d’examen national pour votre classe'}</h2>
          <p>{ht
            ? `${gradeLabel ? `Nan ${gradeLabel}, ` : ''}kiz yo ak kou yo pi itil pou kounye a. Ou ka toujou gade epwèv yo pi ba a si ou vle.`
            : `${gradeLabel ? `En ${gradeLabel}, ` : ''}les quiz et les cours sont plus utiles pour le moment. Vous pouvez tout de même consulter les épreuves plus bas.`}</p>
          <div className="exam-landing__offlevel-actions">
            <Link to="/quizzes" className="button button--primary">
              {ht ? 'Fè yon kiz' : 'Faire un quiz'}
            </Link>
            <Link to="/courses" className="button button--ghost">
              {ht ? 'Wè kou mwen yo' : 'Voir mes cours'}
            </Link>
          </div>
        </section>
      )}

      {/* ── What taking an exam here involves ────────────────────────────────
          Purpose, timing and whether the result is kept — stated once, on the
          page where a student decides whether to open a paper at all (§6.4).
          Each line is read from real behaviour: the countdown only exists when
          the paper carries a duration, and ExamTake's save effect returns
          early without a uid, so a signed-out attempt really is not kept. */}
      <ul className="exam-landing__facts">
        <li>
          <FileText size={15} aria-hidden="true" />
          <span>
            <strong>{ht ? 'Epwèv ofisyèl konplè' : 'Épreuves officielles complètes'}</strong>
            {ht
              ? ' — sijè MENFP yo, ak tout kesyon yo, se pa yon ti kiz.'
              : ' — les sujets du MENFP, avec toutes leurs questions, pas un quiz rapide.'}
          </span>
        </li>
        <li>
          <Clock size={15} aria-hidden="true" />
          <span>
            <strong>{ht ? 'Dire reyèl la' : 'Durée réelle'}</strong>
            {ht
              ? ' — chak epwèv montre dire li anvan ou kòmanse ; kwonomèt la mache sèlman lè sijè a bay yon dire.'
              : ' — chaque épreuve affiche sa durée avant de commencer ; le chronomètre ne démarre que si le sujet en indique une.'}
          </span>
        </li>
        <li>
          {userId ? <Save size={15} aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}
          <span>
            <strong>{userId
              ? (ht ? 'Rezilta yo konsève' : 'Résultats conservés')
              : (ht ? 'Rezilta yo pa konsève' : 'Résultats non conservés')}</strong>
            {userId
              ? (ht
                  ? ' — repons ou yo anrejistre pandan w ap travay epi nòt ou rete nan istwa ou.'
                  : ' — vos réponses sont enregistrées pendant l’épreuve et le score reste dans votre historique.')
              : (ht
                  ? ' — konekte pou anrejistre repons ou yo, kontinye pita epi jwenn nòt ou ankò.'
                  : ' — connectez-vous pour enregistrer vos réponses, reprendre plus tard et retrouver votre score.')}
            {!userId && (
              <button
                type="button"
                className="exam-landing__facts-link"
                onClick={() => setShowAuthModal(true)}
              >
                {ht ? 'Konekte' : 'Se connecter'}
              </button>
            )}
          </span>
        </li>
      </ul>

      {/* ── Reprendre ─────────────────────────────────────────────────────── */}
      {drafts.length > 0 && (
        <section className="exam-landing__section">
          <h2 className="exam-landing__section-title">{t('examLanding.sectionInProgress')}</h2>
          <div className="exam-landing__cards">
            {drafts.map((d) => {
              const exam = byKey.get(d.examId);
              const name = exam ? sessionRowName(exam, ht ? 'ht' : 'fr') : { title: d.title, subtitle: d.subject };
              const subject = exam?._subject || d.subject;
              const slug = levelToSlug(exam?.level || d.level);
              return (
                <button
                  key={d.examId}
                  type="button"
                  className="exam-mini-card"
                  onClick={() => navigate(`/exams/${slug}/${d.examId}/take`, { state: { autostart: true } })}
                >
                  <CardCover className="exam-mini-card__cover" glyph={SUBJECT_GLYPHS[subject] || 'book'} color={subjectColor(subject)} />
                  <span className="exam-mini-card__body">
                    <span className="exam-mini-card__title">{name.title}</span>
                    <span className="exam-mini-card__meta">
                      {[
                        subject,
                        examRowFacts(exam, ht),
                        d.answered > 0 ? t('examLanding.resumeAnswered', { count: d.answered }) : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="exam-mini-card__cta"><PlayCircle size={15} aria-hidden="true" /> {t('examLanding.resume')}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Votre préparation (performance) ────────────────────────────────
          Exam readiness is coefficient-weighted against the Bac and its top
          band reads "Prêt pour le Bac", so it is meaningless — and misleading
          — for a class with no national paper. Hidden there, never recomputed
          into something else. */}
      {readiness.hasData && !offLevel && (
        <section className="exam-landing__section">
          <div className="exam-landing__section-head">
            <h2 className="exam-landing__section-title">{t('examLanding.sectionPreparation')}</h2>
            <Link to="/study-plan" className="exam-landing__see-all">{t('examLanding.seeAll')} →</Link>
          </div>
          <div className="exam-landing__perf">
            <div className="exam-landing__perf-score">
              <span className="exam-landing__perf-value">{readiness.overall}%</span>
              <span className="exam-landing__perf-band" style={{ color: readinessBand(readiness.overall).color }}>
                {ht ? readinessBand(readiness.overall).labelHt : readinessBand(readiness.overall).label}
              </span>
              <span className="exam-landing__perf-label">{t('examLanding.readinessOverall')}</span>
            </div>
            {focusSubjects.length > 0 && (
              <div className="exam-landing__perf-focus">
                <span className="exam-landing__perf-focus-title">{t('examLanding.weakestSubjects')}</span>
                {focusSubjects.map((sub: any) => (
                  <Link
                    key={sub.subject}
                    className="exam-landing__perf-row"
                    to={mySlug ? `/exams/${mySlug}/matiere/${encodeURIComponent(sub.subject)}` : '/exams'}
                  >
                    <span className="exam-landing__perf-subject">{sub.subject}</span>
                    <span className="exam-landing__perf-bar" aria-hidden="true">
                      <span style={{ width: `${sub.pct}%`, background: subjectColor(sub.subject) }} />
                    </span>
                    <span className="exam-landing__perf-pct">{sub.pct}%</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── À revoir — self-hides when nothing is due ─────────────────────── */}
      <div className="exam-landing__review"><ReviewBanner /></div>

      {/* ── Recommandé pour vous ─────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <section className="exam-landing__section">
          <h2 className="exam-landing__section-title">
            {hasAttemptEvidence
              ? t('examLanding.sectionRecommended')
              : ht ? 'Pou kòmanse' : 'Pour commencer'}
          </h2>
          {!hasAttemptEvidence && (
            <p className="exam-landing__section-note">
              {ht
                ? 'Matyè ki gen plis pwa nan filyè a. Lè ou fin fè kèk egzamen, n ap montre sa pou w ranfòse.'
                : 'Les matières au plus fort coefficient. Après quelques examens, nous indiquerons celles à renforcer.'}
            </p>
          )}
          {/* Compact rows, not a second grid of covers: the covers here
              repeated the subject colour already carried by the swatch, and
              four equal-weight cards competed with "Reprendre" above (§7). */}
          <ul className="exam-landing__rows">
            {recommendations.map(({ subject, exam, weak }) => {
              const name = sessionRowName(exam, ht ? 'ht' : 'fr');
              const slug = levelToSlug(exam.level);
              const key = String(exam.exam_id ?? exam._idx);
              const facts = examRowFacts(exam, ht);
              return (
                <li key={key}>
                  <Link to={`/exams/${slug}/${key}`} className="exam-landing__row">
                    <span className="exam-landing__row-swatch" style={{ background: subjectColor(subject) }} aria-hidden="true" />
                    <span className="exam-landing__row-body">
                      <span className={`exam-landing__row-reason exam-landing__row-reason--${weak ? 'weak' : 'new'}`}>
                        {weak ? t('examLanding.reasonWeak') : t('examLanding.reasonNew')}
                      </span>
                      <span className="exam-landing__row-title">{name.title}</span>
                      <span className="exam-landing__row-meta">
                        {[subject, name.subtitle, facts].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight size={16} className="exam-landing__row-chevron" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Derniers résultats ───────────────────────────────────────────── */}
      {recentResults.length > 0 && (
        <section className="exam-landing__section">
          <div className="exam-landing__section-head">
            <h2 className="exam-landing__section-title">{t('examLanding.sectionRecentResults')}</h2>
            <Link to="/exams/resultats" className="exam-landing__see-all">{t('examLanding.seeAll')} →</Link>
          </div>
          <div className="exam-landing__result-list">
            {recentResults.map(({ examId, exam, percentage }) => {
              const name = sessionRowName(exam, ht ? 'ht' : 'fr');
              const subject = exam._subject;
              const slug = levelToSlug(exam.level);
              const tone = percentage == null ? '' : percentage >= 60 ? 'good' : percentage >= 40 ? 'mid' : 'low';
              return (
                <Link key={examId} to={`/exams/${slug}/${examId}/results`} className="exam-landing__result-row">
                  <span className="exam-landing__result-swatch" style={{ background: subjectColor(subject) }} aria-hidden="true" />
                  <span className="exam-landing__result-body">
                    <span className="exam-landing__result-title">{name.title}</span>
                    <span className="exam-landing__result-meta">{subject}</span>
                  </span>
                  {percentage != null && (
                    <span className={`exam-landing__result-score exam-landing__result-score--${tone}`}>{percentage}%</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Catalog states (§8) ──────────────────────────────────────────────
          The subject list, the suggestions and the results rows all come from
          one static index. It used to fail silently: a dropped fetch simply
          erased those sections and left the level picker looking like the whole
          page. Keep the context above, then say what is happening. */}
      {knowsLevel && catalogPending && (
        <section className="exam-landing__section" aria-busy="true">
          <h2 className="exam-landing__section-title">{t('examLanding.sectionSubjects')}</h2>
          <p className="exam-landing__section-note">
            {ht ? 'Ap chaje matyè yo…' : 'Chargement des matières…'}
          </p>
          <ul className="exam-landing__rows">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <span className="exam-landing__row exam-landing__row--skeleton">
                  <Skeleton width={8} height={40} radius={999} />
                  <span className="exam-landing__row-body">
                    <Skeleton width="38%" height={14} />
                    <Skeleton width="56%" height={12} style={{ marginTop: '0.4rem' }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {catalogError && (
        <section className="exam-landing__section">
          <div className="card card--message">
            <p>
              {ht
                ? 'Nou pa t ka chaje lis egzamen yo. Tcheke koneksyon ou, epi eseye ankò.'
                : 'Nous n’avons pas pu charger la liste des examens. Vérifiez votre connexion, puis réessayez.'}
            </p>
            <button className="button button--primary" type="button" onClick={() => { void refetchCatalog(); }}>
              {ht ? 'Eseye ankò' : 'Réessayer'}
            </button>
          </div>
        </section>
      )}

      {/* ── Vos matières — the subjects of MY level, not a level picker ─────
          One compact row per subject. This was a grid of 16:9 covers whose
          only content was the subject colour the swatch now carries (§7:
          fewer decorative icon containers). */}
      {knowsLevel && mySubjects.length > 0 && (
        <section className="exam-landing__section">
          <div className="exam-landing__section-head">
            <h2 className="exam-landing__section-title">{t('examLanding.sectionSubjects')}</h2>
            <Link to={`/exams/${mySlug}`} className="exam-landing__see-all">{t('examLanding.seeAll')} →</Link>
          </div>
          <ul className="exam-landing__rows">
            {mySubjects.map(({ subject, count }) => (
              <li key={subject}>
                <Link
                  to={`/exams/${mySlug}/matiere/${encodeURIComponent(subject)}`}
                  className="exam-landing__row"
                >
                  <span className="exam-landing__row-swatch" style={{ background: subjectColor(subject) }} aria-hidden="true" />
                  <span className="exam-landing__row-body">
                    <span className="exam-landing__row-title">{subject}</span>
                    <span className="exam-landing__row-meta">{t('examLanding.subjectExams', { count })}</span>
                  </span>
                  <ChevronRight size={16} className="exam-landing__row-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Other levels ──────────────────────────────────────────────────────
          When we know the student's class this is a deliberate detour, not the
          default view — an NS4 shouldn't have to scroll past 9e papers. With no
          grade set it stays open, because then the picker IS the page. */}
      <section className="exam-landing__section">
        {grade ? (
          <button
            type="button"
            className="exam-landing__levels-toggle"
            onClick={() => setShowOtherLevels((v) => !v)}
            aria-expanded={showOtherLevels}
          >
            <span>{offLevel
              ? (ht ? 'Egzamen nasyonal ki disponib' : 'Les examens nationaux disponibles')
              : t('examLanding.otherLevels')}</span>
            <span className="exam-landing__levels-toggle-cta">
              {showOtherLevels ? t('examLanding.otherLevelsClose') : t('examLanding.otherLevelsOpen')}
              <ChevronDown size={15} aria-hidden="true" className={showOtherLevels ? 'is-open' : ''} />
            </span>
          </button>
        ) : (
          hasPersonalData && <h2 className="exam-landing__section-title">{t('examLanding.browseByLevel')}</h2>
        )}
        {/* Compact level rows. Three stacked cards with 16:9 covers, a blurb
            and a footer CTA made the picker ~720px tall on a phone and gave
            every level the same visual weight as the student's own; the row
            keeps the same information and marks which one is theirs (§7). */}
        <ul className="exam-landing__level-rows" hidden={!!grade && !showOtherLevels}>
          {orderedLevels.map((level) => {
            const heading = t(`examLanding.${level.key}Heading`);
            const desc = t(`examLanding.${level.key}Desc`);
            const isMine = !!myLevelRaw && level.raw === myLevelRaw;
            return (
              <li key={level.to} className="exam-landing__level-item">
                <Link
                  to={level.to}
                  className={`exam-landing__row exam-landing__row--level${isMine ? ' is-mine' : ''}`}
                >
                  <span className="exam-landing__row-swatch" style={{ background: level.color }} aria-hidden="true" />
                  <span className="exam-landing__row-body">
                    <span className="exam-landing__row-title">
                      {heading}
                      {isMine && (
                        <span className="exam-landing__row-badge">
                          {ht ? 'Nivo ou' : 'Votre niveau'}
                        </span>
                      )}
                    </span>
                    <span className="exam-landing__row-meta exam-landing__row-meta--wrap">{desc}</span>
                  </span>
                  <ChevronRight size={16} className="exam-landing__row-chevron" aria-hidden="true" />
                </Link>

                {/* The Baccalauréat row keeps the filière quick-pick beneath it,
                    so "choose the level / choose the série" stays one step. */}
                {level.to === '/exams/terminale' && (
                  <div className="exam-landing__tracks" aria-label={t('examLanding.chooseTrackAria')}>
                    <span className="exam-landing__tracks-label">{t('examLanding.chooseTrack')}</span>
                    <div className="exam-landing__chips">
                      {TRACKS.map((track) => {
                        const active = userTrack === track.code;
                        return (
                          <button
                            key={track.code}
                            type="button"
                            className={`bac-chip ${active ? 'bac-chip--active' : ''}`}
                            style={{ '--track-color': track.color } as React.CSSProperties}
                            onClick={() => pickTrack(track.code)}
                            aria-pressed={active}
                            title={track.label}
                          >
                            {track.shortLabel}
                            {active && <span className="bac-chip__check" aria-hidden="true">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default ExamLanding;
