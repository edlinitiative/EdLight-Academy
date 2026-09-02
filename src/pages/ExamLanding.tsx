import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { History, PlayCircle, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { TRACKS, gradeProfile, getCoefficient, DEFAULT_SUBJECT_ORDER } from '../config/trackConfig';
import CardCover from '../components/CardCover';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { levelToSlug } from '../utils/examLevels';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { buildExamIndex, subjectColor } from '../utils/examUtils';
import { sessionRowName } from '../utils/examNaming';
import { SUBJECT_GLYPHS } from '../utils/subjectGlyphs';
import { listRecentExamAttempts } from '../services/userActivity';
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
        title: draft?.exam_title || draft?.subject || '',
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
  const ht = language === 'ht';

  // Lead with the level that matches the student's grade so the relevant path
  // is the top card; everyone else keeps the default order. The Bac (Terminale)
  // card still carries the filière quick-pick wherever it lands.
  const myLevelPath = EXAM_LEVEL_TO_PATH[gradeProfile(grade).examLevel ?? ''] ?? null;
  const orderedLevels = myLevelPath
    ? [...LEVELS].sort((a, b) => (a.to === myLevelPath ? -1 : b.to === myLevelPath ? 1 : 0))
    : LEVELS;

  const pickTrack = (code: string) => {
    setTrack(code);
    setOnboardingCompleted(true);
    navigate('/exams/terminale');
  };

  const { data: catalog } = useExamCatalog();
  const attempts = useExamAttempts();

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
              title: r.exam_title || existing?.title || r.subject || '',
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
  }, [enriched, attempts, grade, userTrack]);

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
      <div className="exam-landing__toolbar">
        <span />
        <Link to="/exams/resultats" className="exam-landing__history">
          <History size={16} aria-hidden="true" /> {t('examLanding.myResults')}
        </Link>
      </div>

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
                      {subject}{d.answered > 0 ? ` · ${t('examLanding.resumeAnswered', { count: d.answered })}` : ''}
                    </span>
                  </span>
                  <span className="exam-mini-card__cta"><PlayCircle size={15} aria-hidden="true" /> {t('examLanding.resume')}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recommandé pour vous ─────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <section className="exam-landing__section">
          <h2 className="exam-landing__section-title">{t('examLanding.sectionRecommended')}</h2>
          <div className="exam-landing__cards">
            {recommendations.map(({ subject, exam, weak }) => {
              const name = sessionRowName(exam, ht ? 'ht' : 'fr');
              const slug = levelToSlug(exam.level);
              const key = String(exam.exam_id ?? exam._idx);
              return (
                <Link key={key} to={`/exams/${slug}/${key}`} className="exam-mini-card">
                  <CardCover className="exam-mini-card__cover" glyph={SUBJECT_GLYPHS[subject] || 'book'} color={subjectColor(subject)} />
                  <span className="exam-mini-card__body">
                    <span className={`exam-mini-card__reason exam-mini-card__reason--${weak ? 'weak' : 'new'}`}>
                      {weak ? t('examLanding.reasonWeak') : t('examLanding.reasonNew')}
                    </span>
                    <span className="exam-mini-card__title">{name.title}</span>
                    <span className="exam-mini-card__meta">{subject}</span>
                  </span>
                  <ChevronRight size={16} className="exam-mini-card__chevron" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
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

      {/* ── Parcourir par niveau ─────────────────────────────────────────── */}
      <section className="exam-landing__section">
        {hasPersonalData && <h2 className="exam-landing__section-title">{t('examLanding.browseByLevel')}</h2>}
        <div className="exam-landing__grid">
          {orderedLevels.map((level) => {
            const heading = t(`examLanding.${level.key}Heading`);
            const desc = t(`examLanding.${level.key}Desc`);

            // The Terminale (Baccalauréat) card embeds the filière quick-pick so the
            // whole "choose your level / choose your série" flow fits one screen
            // without a separate section forcing the page to scroll.
            if (level.to === '/exams/terminale') {
              return (
                <div
                  key={level.to}
                  className="level-card level-card--bac"
                  style={{ '--level-color': level.color } as React.CSSProperties}
                >
                  <Link to={level.to} className="level-card__link">
                    <CardCover className="level-card__cover" glyph={level.glyph} color={level.color} />
                    <div className="level-card__body">
                      <h2 className="level-card__heading">{heading}</h2>
                    </div>
                  </Link>

                  <div className="level-card__tracks" aria-label={t('examLanding.chooseTrackAria')}>
                    <span className="level-card__tracks-label">{t('examLanding.chooseTrack')}</span>
                    <div className="level-card__chips">
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

                  <div className="level-card__footer">
                    <Link to={level.to} className="level-card__cta">{t('examLanding.explore')} →</Link>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={level.to}
                to={level.to}
                className="level-card"
                style={{ '--level-color': level.color } as React.CSSProperties}
              >
                <CardCover className="level-card__cover" glyph={level.glyph} color={level.color} />
                <div className="level-card__body">
                  <h2 className="level-card__heading">{heading}</h2>
                  <p className="level-card__desc">{desc}</p>
                </div>
                <div className="level-card__footer">
                  <span className="level-card__cta">{t('examLanding.explore')} →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default ExamLanding;
